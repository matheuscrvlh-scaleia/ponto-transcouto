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

    it('rejeita parâmetros inválidos', async () => {
        const res = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/unidades/${ctx.unidades.GDR}/dashboard?filtro=xpto`,
            headers: autorizado(ctx.tokens.gestor),
        })
        expect(res.statusCode).toBe(400)
    })
})
