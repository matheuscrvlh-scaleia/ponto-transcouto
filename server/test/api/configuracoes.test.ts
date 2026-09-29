import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

let ctx: Contexto

beforeAll(async () => {
    ctx = await prepararContexto()
})

afterAll(() => encerrar(ctx))

function requisitar(perfil: keyof Contexto['tokens'], method: 'GET' | 'PATCH', url: string, payload?: object) {
    return ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: autorizado(ctx.tokens[perfil]) })
}

describe('configurações', () => {
    it('rh lê a configuração da própria empresa', async () => {
        const res = await requisitar('rh', 'GET', '/configuracoes')
        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({ empresa_id: ctx.empresaId, hora_extracao: '06:00', dia_semana_extracao: 3 })
    })

    it('rh altera teto e alertas, com auditoria', async () => {
        const res = await requisitar('rh', 'PATCH', '/configuracoes', {
            teto_horas_pagas_minutos: 720,
            alerta_saldo_positivo_minutos: 480,
        })
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toMatchObject({ teto_horas_pagas_minutos: 720, atualizado_por: { nome: 'RH Demo' } })

        const { rows } = await db.query(
            `SELECT dados FROM log_auditoria WHERE acao = 'configuracao.alterada' AND empresa_id = $1 ORDER BY id DESC LIMIT 1`,
            [ctx.empresaId],
        )
        expect(rows[0].dados.depois).toEqual({ teto_horas_pagas_minutos: 720, alerta_saldo_positivo_minutos: 480 })
    })

    it('rh não altera a régua', async () => {
        const res = await requisitar('rh', 'PATCH', '/configuracoes', { dia_semana_extracao: 4 })
        expect(res.statusCode).toBe(403)
    })

    it('rh ignora empresa_id de outra empresa', async () => {
        const res = await requisitar('rh', 'GET', '/configuracoes?empresa_id=1')
        expect(res.json().empresa_id).toBe(ctx.empresaId)
    })

    it('admin precisa informar a empresa e pode alterar a régua', async () => {
        expect((await requisitar('admin', 'GET', '/configuracoes')).statusCode).toBe(400)

        const res = await requisitar('admin', 'PATCH', `/configuracoes?empresa_id=${ctx.empresaId}`, {
            dia_semana_extracao: 4,
            hora_extracao: '07:30',
        })
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toMatchObject({ dia_semana_extracao: 4, hora_extracao: '07:30' })
    })

    it('mudar a régua descarta ciclos futuros não iniciados para a régua recriar', async () => {
        const ciclo = await db.query(
            `INSERT INTO ciclos (empresa_id, tipo, periodo_inicio, data_referencia, gatilho_previsto_em, gatilho_em)
             VALUES ($1, 'semanal', '2030-01-01', '2030-01-07', '2030-01-08T09:00:00Z', '2030-01-08T09:00:00Z')
             RETURNING id`,
            [ctx.empresaId],
        )
        await db.query('INSERT INTO fechamentos (ciclo_id, empresa_id, unidade_id) VALUES ($1, $2, $3)', [
            ciclo.rows[0].id,
            ctx.empresaId,
            ctx.unidades.GDR,
        ])
        const futuros = () =>
            db.query('SELECT count(*)::int AS n FROM ciclos WHERE empresa_id = $1 AND gatilho_em > now()', [ctx.empresaId])
        expect((await futuros()).rows[0].n).toBeGreaterThan(0)

        const res = await requisitar('admin', 'PATCH', `/configuracoes?empresa_id=${ctx.empresaId}`, { hora_extracao: '08:00' })
        expect(res.statusCode, res.body).toBe(200)
        expect((await futuros()).rows[0].n).toBe(0)

        const { rows } = await db.query(
            `SELECT dados FROM log_auditoria WHERE empresa_id = $1 AND acao = 'configuracao.alterada' ORDER BY id DESC LIMIT 1`,
            [ctx.empresaId],
        )
        expect(rows[0].dados.ciclos_descartados).toBeGreaterThan(0)
    })

    it('valida valores', async () => {
        const res = await requisitar('admin', 'PATCH', `/configuracoes?empresa_id=${ctx.empresaId}`, { dia_fechamento_mes: 31 })
        expect(res.statusCode).toBe(400)
    })

    it('gestor não acessa', async () => {
        expect((await requisitar('gestor', 'GET', '/configuracoes')).statusCode).toBe(403)
    })
})
