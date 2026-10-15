import os from 'node:os'
import { env } from '../config/env'
import { db } from '../db/database'
import { registrarHeartbeat } from '../models/worker.models'
import { executarImportacaoBatidas } from './batidas.job'
import { executarExtracao } from './extracao.job'
import { logConsole as log } from './log'
import { executarRecalculos } from './recalculo.job'
import { executarRegua } from './regua.job'
import { executarSincronizacoes } from './sincronizacao.job'
import { executarTempoReal } from './tempo-real.job'

const NOME = 'worker'
const HEARTBEAT_MIN_MS = 30000

export type Worker = {
    /** Pede para parar depois da operação em andamento; resolve quando o laço termina. */
    parar(): Promise<void>
    terminou: Promise<void>
}

// Laço do worker, usado pelo processo próprio (worker.ts) ou embutido na API (WORKER_EMBUTIDO).
// Não fecha o pool do banco: quem chamou decide quando encerrar.
export function iniciarWorker(opcoes: { umaVez?: boolean } = {}): Worker {
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
        // regra de horas pagas ou mapeamento alterados: refaz o histórico antes de qualquer nova coleta
        await executarRecalculos(log)
        // log de batidas: leve (fora da cota de /Calcular), roda antes da extração, que pode demorar
        await executarImportacaoBatidas({ log, deveParar: () => parar })
        await executarExtracao({ log, deveParar: () => parar, aoProgredir: () => heartbeat('extraindo', false) })
        // depois dos fechamentos (que têm prioridade), o rodízio das empresas em tempo real
        await executarTempoReal({ log, deveParar: () => parar })
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

    async function executar() {
        await db.query('SELECT 1')
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
            if (opcoes.umaVez) break
            if (!parar) await dormir(Math.max(env.WORKER_INTERVALO_MS - (Date.now() - inicio), 1000))
        }

        await heartbeat('parado')
        log.info('worker encerrado')
    }

    const terminou = executar()

    return {
        terminou,
        parar() {
            if (!parar) {
                log.info('encerrando após a operação em andamento...')
                parar = true
                acordar?.()
            }
            return terminou
        },
    }
}
