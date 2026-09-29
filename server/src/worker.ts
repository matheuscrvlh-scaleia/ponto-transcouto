import os from 'node:os'
import { env } from './config/env'
import { db } from './db/database'
import { executarExtracao } from './jobs/extracao.job'
import { logConsole as log } from './jobs/log'
import { executarRegua } from './jobs/regua.job'
import { executarSincronizacoes } from './jobs/sincronizacao.job'
import { registrarHeartbeat } from './models/worker.models'

const NOME = 'worker'
const HEARTBEAT_MIN_MS = 30000
const umaVez = process.argv.includes('--uma-vez')
const iniciadoEm = new Date().toISOString()

let parar = false
let acordar: (() => void) | null = null
let ultimoHeartbeat = 0
let ultimoErro: string | null = null

async function heartbeat(status: string, forcar = true) {
    if (!forcar && Date.now() - ultimoHeartbeat < HEARTBEAT_MIN_MS) return
    ultimoHeartbeat = Date.now()
    try {
        await registrarHeartbeat(NOME, { status, pid: process.pid, host: os.hostname(), iniciado_em: iniciadoEm, ultimo_erro: ultimoErro })
    } catch (err) {
        log.erro(`heartbeat falhou: ${(err as Error).message}`)
    }
}

async function tick() {
    await executarRegua(log)
    await executarSincronizacoes(log)
    await executarExtracao({ log, deveParar: () => parar, aoProgredir: () => heartbeat('extraindo', false) })
}

function dormir(ms: number) {
    return new Promise<void>(resolve => {
        const timer = setTimeout(resolve, ms)
        acordar = () => {
            clearTimeout(timer)
            resolve()
        }
    })
}

function encerrar() {
    if (parar) return
    log.info('encerrando após a operação em andamento...')
    parar = true
    acordar?.()
}

async function main() {
    await db.query('SELECT 1')
    process.on('SIGINT', encerrar)
    process.on('SIGTERM', encerrar)
    log.info(`worker iniciado (intervalo ${env.WORKER_INTERVALO_MS} ms)`)

    while (!parar) {
        const inicio = Date.now()
        await heartbeat('rodando')
        try {
            await tick()
            ultimoErro = null
        } catch (err) {
            ultimoErro = (err as Error).message
            log.erro(`tick falhou: ${ultimoErro}`)
        }
        await heartbeat('ocioso')
        if (umaVez) break
        if (!parar) await dormir(Math.max(env.WORKER_INTERVALO_MS - (Date.now() - inicio), 1000))
    }

    await heartbeat('parado')
    await db.end()
    log.info('worker encerrado')
}

main().catch(async err => {
    console.error(err)
    await db.end().catch(() => {})
    process.exit(1)
})
