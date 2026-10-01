import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

type Linha = {
    id: number
    nome: string
    extra_min: number
    negativa_min: number
    saldo_min: number
    fora_da_curva: 'positivo' | 'negativo' | null
}

let ctx: Contexto

beforeAll(async () => {
    ctx = await prepararContexto()
})

afterAll(() => encerrar(ctx))

async function dashboard(unidadeId: number, query = '') {
    const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/unidades/${unidadeId}/dashboard${query}`,
        headers: autorizado(ctx.tokens.gestor),
    })
    expect(res.statusCode, res.body).toBe(200)
    return res.json()
}

describe('dashboard da unidade', () => {
    it('ordena por saldo decrescente e marca fora da curva', async () => {
        const corpo = await dashboard(ctx.unidades.GDR)
        const linhas: Linha[] = corpo.colaboradores

        expect(corpo.unidade).toEqual({ id: ctx.unidades.GDR, nome: 'GDR' })
        expect(corpo.fechamento.semana_fechamento_mes).toBe(true)
        expect(corpo.total).toBe(10)
        expect(linhas.map(l => l.saldo_min)).toEqual([...linhas.map(l => l.saldo_min)].sort((a, b) => b - a))

        const { alerta_pos, alerta_neg } = corpo.limites
        for (const l of linhas) {
            const esperado = l.saldo_min >= alerta_pos ? 'positivo' : l.saldo_min <= -alerta_neg ? 'negativo' : null
            expect(l.fora_da_curva).toBe(esperado)
        }
        expect(linhas.some(l => l.fora_da_curva === 'positivo')).toBe(true)
        expect(linhas.some(l => l.fora_da_curva === 'negativo')).toBe(true)
        expect(corpo.resumo.total).toBe(10)
        expect(corpo.proximo_fechamento_previsto).not.toBeNull()
    })

    it('ordena por nome', async () => {
        const nomes = (await dashboard(ctx.unidades.GDR, '?ordem=nome')).colaboradores.map((l: Linha) => l.nome)
        expect(nomes).toEqual([...nomes].sort((a: string, b: string) => a.localeCompare(b, 'pt-BR')))
    })

    it('filtra extras, negativas e fora da curva', async () => {
        const extras: Linha[] = (await dashboard(ctx.unidades.VRD, '?filtro=extra')).colaboradores
        expect(extras.length).toBeGreaterThan(0)
        expect(extras.every(l => l.extra_min > 0)).toBe(true)

        const negativas: Linha[] = (await dashboard(ctx.unidades.VRD, '?filtro=negativa')).colaboradores
        expect(negativas.every(l => l.negativa_min > 0)).toBe(true)

        const fora = await dashboard(ctx.unidades.GDR, '?filtro=fora')
        expect(fora.colaboradores.every((l: Linha) => l.fora_da_curva !== null)).toBe(true)
        expect(fora.total).toBe(fora.resumo.fora_positivo + fora.resumo.fora_negativo)
    })

    it('busca por nome e pagina', async () => {
        const todos = await dashboard(ctx.unidades.GDR, '?ordem=nome')
        const alvo: Linha = todos.colaboradores[0]
        const busca = await dashboard(ctx.unidades.GDR, `?busca=${encodeURIComponent(alvo.nome.split(' ')[0].toLowerCase())}`)
        expect(busca.colaboradores.map((l: Linha) => l.id)).toContain(alvo.id)

        const pagina2 = await dashboard(ctx.unidades.GDR, '?ordem=nome&pagina=2&por_pagina=4')
        expect(pagina2.total).toBe(10)
        expect(pagina2.colaboradores.map((l: Linha) => l.id)).toEqual(
            todos.colaboradores.slice(4, 8).map((l: Linha) => l.id),
        )
    })

    it('avisa semana de fechamento quando o fechamento mensal falhou e mostra o último publicado', async () => {
        const res = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/unidades/${ctx.unidades.TRS}/dashboard`,
            headers: autorizado(ctx.tokens.rh),
        })
        const corpo = res.json()
        expect(corpo.aviso_fechamento_mes).toBe(true)
        expect(corpo.fechamento.semana_fechamento_mes).toBe(false)
    })

    it('rejeita parâmetros inválidos no painel consolidado', async () => {
        const res = await ctx.app.inject({
            method: 'GET',
            url: '/api/v1/dashboard?ordem=xpto',
            headers: autorizado(ctx.tokens.rh),
        })
        expect(res.statusCode).toBe(400)
    })

    it('rejeita parâmetros inválidos', async () => {
        const res = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/unidades/${ctx.unidades.GDR}/dashboard?filtro=xpto`,
            headers: autorizado(ctx.tokens.gestor),
        })
        expect(res.statusCode).toBe(400)
    })
})

type LinhaGeral = Linha & { unidade_id: number; unidade_nome: string; alerta_pos: number; alerta_neg: number }

async function painelGeral(token: string, query = '') {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/dashboard${query}`, headers: autorizado(token) })
    expect(res.statusCode, res.body).toBe(200)
    return res.json()
}

async function dashboardComo(token: string, unidadeId: number) {
    const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/unidades/${unidadeId}/dashboard`,
        headers: autorizado(token),
    })
    expect(res.statusCode, res.body).toBe(200)
    return res.json()
}

describe('painel consolidado (todas as unidades)', () => {
    it('soma as unidades do RH e marca cada colaborador com a unidade e o limite dela', async () => {
        const corpo = await painelGeral(ctx.tokens.rh)
        // mesmas unidades da lista do usuário (só as com nome de exibição e ativas)
        const lista = await ctx.app.inject({ method: 'GET', url: '/api/v1/unidades', headers: autorizado(ctx.tokens.rh) })
        const ids: number[] = lista.json().map((u: { id: number }) => u.id)

        expect(corpo.unidade).toBeNull()
        expect(corpo.unidades.map((u: { id: number }) => u.id).sort()).toEqual([...ids].sort())

        const porUnidade = await Promise.all(ids.map(id => dashboardComo(ctx.tokens.rh, id)))
        const soma = (campo: 'total' | 'fora_positivo' | 'fora_negativo' | 'pagas_total_min') =>
            porUnidade.reduce((total, d) => total + (d.resumo?.[campo] ?? 0), 0)

        expect(corpo.resumo.total).toBe(soma('total'))
        expect(corpo.resumo.fora_positivo).toBe(soma('fora_positivo'))
        expect(corpo.resumo.fora_negativo).toBe(soma('fora_negativo'))
        expect(corpo.resumo.pagas_total_min).toBe(soma('pagas_total_min'))
        expect(corpo.total).toBe(soma('total'))

        const linhas: LinhaGeral[] = corpo.colaboradores
        expect(new Set(linhas.map(l => l.unidade_id))).toEqual(
            new Set(porUnidade.filter(d => d.fechamento).map(d => d.unidade.id)),
        )
        for (const l of linhas) {
            const esperado = l.saldo_min >= l.alerta_pos ? 'positivo' : l.saldo_min <= -l.alerta_neg ? 'negativo' : null
            expect(l.fora_da_curva).toBe(esperado)
        }
        expect(linhas.map(l => l.saldo_min)).toEqual([...linhas.map(l => l.saldo_min)].sort((a, b) => b - a))
        expect(corpo.fechamento).not.toBeNull()
    })

    it('mostra ao gestor só as unidades vinculadas', async () => {
        const corpo = await painelGeral(ctx.tokens.gestor)
        const sessao = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizado(ctx.tokens.gestor) })
        const vinculadas: number[] = sessao.json().unidades.map((u: { id: number }) => u.id)

        expect(corpo.unidades.map((u: { id: number }) => u.id).sort()).toEqual([...vinculadas].sort())
        expect(corpo.colaboradores.every((l: LinhaGeral) => vinculadas.includes(l.unidade_id))).toBe(true)
    })

    it('filtra fora da curva e pagina no conjunto inteiro', async () => {
        const fora = await painelGeral(ctx.tokens.rh, '?filtro=fora')
        expect(fora.colaboradores.every((l: LinhaGeral) => l.fora_da_curva !== null)).toBe(true)
        expect(fora.total).toBe(fora.resumo.fora_positivo + fora.resumo.fora_negativo)

        const todos = await painelGeral(ctx.tokens.rh, '?ordem=nome')
        const pagina2 = await painelGeral(ctx.tokens.rh, '?ordem=nome&pagina=2&por_pagina=5')
        expect(pagina2.total).toBe(todos.total)
        expect(pagina2.colaboradores.map((l: LinhaGeral) => l.id)).toEqual(
            todos.colaboradores.slice(5, 10).map((l: LinhaGeral) => l.id),
        )

        const alem = await painelGeral(ctx.tokens.rh, '?pagina=99&por_pagina=5')
        expect(alem.colaboradores).toEqual([])
        expect(alem.total).toBe(todos.total)
    })
})

describe('painel consolidado por empresa', () => {
    it('a equipe filtra uma empresa; o cliente não sai da dele', async () => {
        const daDemo = await painelGeral(ctx.tokens.admin, `?empresa_id=${ctx.empresaId}`)
        const lista = await ctx.app.inject({ method: 'GET', url: '/api/v1/unidades', headers: autorizado(ctx.tokens.rh) })
        const idsDemo: number[] = lista.json().map((u: { id: number }) => u.id)
        expect(daDemo.unidades.map((u: { id: number }) => u.id).sort()).toEqual([...idsDemo].sort())

        // RH informando outra empresa continua vendo só a própria
        const rhOutra = await painelGeral(ctx.tokens.rh, '?empresa_id=999999')
        expect(rhOutra.unidades.map((u: { id: number }) => u.id).sort()).toEqual([...idsDemo].sort())

        const sessao = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizado(ctx.tokens.rh) })
        expect(sessao.json().unidades.every((u: { empresa_id: number }) => u.empresa_id === ctx.empresaId)).toBe(true)
    })
})
