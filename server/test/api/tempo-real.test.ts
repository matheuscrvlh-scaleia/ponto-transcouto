import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

let ctx: Contexto
let colaboradorId: number

beforeAll(async () => {
    ctx = await prepararContexto()
    const { rows } = await db.query(
        `SELECT id FROM colaboradores WHERE unidade_id = $1 AND ativo ORDER BY id LIMIT 1`,
        [ctx.unidades.GDR],
    )
    colaboradorId = rows[0].id
})

afterAll(() => encerrar(ctx))

function como(perfil: keyof Contexto['tokens'], method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
    return ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: autorizado(ctx.tokens[perfil]) })
}

describe('tempo real sem fotografia semanal', () => {
    it('recusa tempo real com teto semanal de horas pagas', async () => {
        const res = await como('rh', 'PATCH', '/configuracoes', {
            modo_extracao: 'tempo_real',
            origem_horas_pagas: 'teto',
            teto_periodicidade: 'semanal',
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error).toContain('teto semanal')
    })

    it('"atualizar agora" só vale para empresa em tempo real', async () => {
        expect((await como('rh', 'POST', '/integracao/tempo-real/atualizar', {})).statusCode).toBe(400)

        const ativar = await como('rh', 'PATCH', '/configuracoes', { modo_extracao: 'tempo_real' })
        expect(ativar.statusCode, ativar.body).toBe(200)

        const res = await como('gestor', 'POST', '/integracao/tempo-real/atualizar', { motivo: 'conferir hoje' })
        expect(res.statusCode, res.body).toBe(202)
        expect(res.json().colaboradores).toBeGreaterThan(0)
        expect(res.json().minutos_estimados).toBeGreaterThan(0)

        const historico = await como('rh', 'GET', '/integracao/historico')
        expect(historico.json().itens[0]).toMatchObject({
            acao: 'integracao.tempo_real_forcado',
            ator: { tipo: 'cliente', nome: 'Gestor Demo' },
        })
        expect(historico.json().itens[0].descricao).toContain('atualização imediata')
    })

    it('ao virar tempo real, a prévia de "puxar dados" só considera fechamentos do mês', async () => {
        const { rows } = await db.query(
            `SELECT min(data_referencia)::text AS inicio, max(data_referencia)::text AS fim
               FROM ciclos WHERE empresa_id = $1 AND gatilho_em <= now()`,
            [ctx.empresaId],
        )
        // o período pega meses já fechados: só a equipe refaz
        const res = await como(
            'admin', 'GET', `/integracao/dados/previa?inicio=${rows[0].inicio}&fim=${rows[0].fim}&empresa_id=${ctx.empresaId}`,
        )
        expect(res.statusCode, res.body).toBe(200)
        const doPeriodo = res.json().semanas.filter((s: { dependente: boolean }) => !s.dependente)
        expect(doPeriodo.length).toBeGreaterThan(0)
        expect(doPeriodo.every((s: { tipo: string }) => s.tipo === 'fechamento_mes')).toBe(true)
    })

    it('detalhe traz o modo e o histórico diário mostra a variação de cada dia', async () => {
        await db.query(
            `INSERT INTO historico_diario
                    (colaborador_id, dia, empresa_id, unidade_id, periodo_inicio,
                     extra_periodo, negativa_periodo, pagas_periodo, banco_periodo, saldo_banco_total)
             VALUES ($1, current_date - 1, $2, $3, current_date - 5, 100, 30, 0, 100, 500),
                    ($1, current_date,     $2, $3, current_date - 5, 160, 30, 0, 160, 560)`,
            [colaboradorId, ctx.empresaId, ctx.unidades.GDR],
        )

        const detalhe = await como('rh', 'GET', `/colaboradores/${colaboradorId}`)
        expect(detalhe.json().modo_extracao).toBe('tempo_real')

        const res = await como('rh', 'GET', `/colaboradores/${colaboradorId}/historico-diario?dias=30`)
        expect(res.statusCode, res.body).toBe(200)
        const [hoje, ontem] = res.json()
        expect(hoje).toMatchObject({ extra_dia: 60, negativa_dia: 0, banco_dia: 60, saldo_total: 560, unidade: { id: ctx.unidades.GDR } })
        expect(ontem).toMatchObject({ extra_dia: null, extra_periodo: 100, saldo_total: 500 })

        // fora do escopo do gestor? o gestor só vê as unidades dele
        const sessao = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizado(ctx.tokens.gestor) })
        const doGestor: number[] = sessao.json().unidades.map((u: { id: number }) => u.id)
        const doGestorRes = await como('gestor', 'GET', `/colaboradores/${colaboradorId}/historico-diario`)
        expect(doGestorRes.statusCode).toBe(doGestor.includes(ctx.unidades.GDR) ? 200 : 404)
    })
})
