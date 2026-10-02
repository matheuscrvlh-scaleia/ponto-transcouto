import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

type Batida = {
    id: number
    data: string
    hora: string
    tipo: number
    origem: number
    colaborador: { id: number; nome: string }
    unidade: { id: number; nome: string }
}

let ctx: Contexto
let colGdr: { id: number; nome: string }
let colTrs: { id: number; nome: string }

async function colaboradorDa(unidadeId: number) {
    const { rows } = await db.query('SELECT id, nome FROM colaboradores WHERE unidade_id = $1 ORDER BY id LIMIT 1', [unidadeId])
    return rows[0] as { id: number; nome: string }
}

beforeAll(async () => {
    ctx = await prepararContexto()
    colGdr = await colaboradorDa(ctx.unidades.GDR)
    colTrs = await colaboradorDa(ctx.unidades.TRS)

    // [fonte_dados_id, colaborador, unidade, data, hora, tipo, origem]
    const linhas: [number, number, number, string, string, number, number][] = [
        [9001, colGdr.id, ctx.unidades.GDR, '2026-09-29', '08:00', 0, 1],
        [9002, colGdr.id, ctx.unidades.GDR, '2026-09-29', '12:02', 0, 1],
        [9003, colGdr.id, ctx.unidades.GDR, '2026-09-30', '07:55', 1, 2],
        [9004, colGdr.id, ctx.unidades.GDR, '2026-09-30', '07:56', 3, 1],
        [9005, colTrs.id, ctx.unidades.TRS, '2026-10-01', '08:10', 0, 6],
    ]
    for (const [fonte, colaborador, unidade, data, hora, tipo, origem] of linhas) {
        await db.query(
            `INSERT INTO batidas (empresa_id, fonte_dados_id, colaborador_id, unidade_id, data, hora, tipo, origem)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [ctx.empresaId, fonte, colaborador, unidade, data, hora, tipo, origem],
        )
    }
})

afterAll(() => encerrar(ctx))

async function batidas(perfil: keyof Contexto['tokens'], query = '') {
    // só as batidas criadas aqui (o banco pode ter outras)
    const filtro = query.includes('&de=') ? '' : 'de=2026-09-29&ate=2026-10-01'
    const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/batidas?${filtro}${query}`,
        headers: autorizado(ctx.tokens[perfil]),
    })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as { itens: Batida[]; total: number; pagina: number; por_pagina: number }
}

const horarios = (itens: Batida[]) => itens.map(b => `${b.data} ${b.hora}`)

describe('log de batidas', () => {
    it('lista da mais recente para a mais antiga, com colaborador e unidade', async () => {
        const corpo = await batidas('rh', `&empresa_id=${ctx.empresaId}`)
        const nossas = corpo.itens.filter(b => [colGdr.id, colTrs.id].includes(b.colaborador.id))
        expect(horarios(nossas)).toEqual([
            '2026-10-01 08:10',
            '2026-09-30 07:56',
            '2026-09-30 07:55',
            '2026-09-29 12:02',
            '2026-09-29 08:00',
        ])
        expect(nossas[0]).toMatchObject({ colaborador: { id: colTrs.id, nome: colTrs.nome }, unidade: { id: ctx.unidades.TRS, nome: 'TRS' } })
    })

    it('gestor só vê as batidas das unidades dele', async () => {
        const corpo = await batidas('gestor')
        expect(corpo.itens.length).toBeGreaterThan(0)
        expect(corpo.itens.every(b => b.unidade.id !== ctx.unidades.TRS)).toBe(true)

        const foraDoEscopo = await batidas('gestor', `&unidade_id=${ctx.unidades.TRS}`)
        expect(foraDoEscopo.total).toBe(0)
    })

    it('filtra por colaborador, nome, tipo e período', async () => {
        const doColaborador = await batidas('rh', `&colaborador_id=${colGdr.id}`)
        expect(doColaborador.total).toBe(4)

        const porNome = await batidas('rh', `&busca=${encodeURIComponent(colGdr.nome.toLowerCase())}`)
        expect(porNome.itens.every(b => b.colaborador.nome === colGdr.nome)).toBe(true)

        const manuais = await batidas('rh', `&colaborador_id=${colGdr.id}&tipo=manuais`)
        expect(horarios(manuais.itens)).toEqual(['2026-09-30 07:55'])

        const desconsideradas = await batidas('rh', `&colaborador_id=${colGdr.id}&tipo=desconsideradas`)
        expect(horarios(desconsideradas.itens)).toEqual(['2026-09-30 07:56'])

        const validas = await batidas('rh', `&colaborador_id=${colGdr.id}&tipo=validas`)
        expect(validas.total).toBe(3)

        const umDia = await batidas('rh', `&colaborador_id=${colGdr.id}&de=2026-09-29&ate=2026-09-29`)
        expect(horarios(umDia.itens)).toEqual(['2026-09-29 12:02', '2026-09-29 08:00'])
    })

    it('pagina e mantém o total além da última página', async () => {
        const pagina2 = await batidas('rh', `&colaborador_id=${colGdr.id}&por_pagina=3&pagina=2`)
        expect(pagina2.total).toBe(4)
        expect(horarios(pagina2.itens)).toEqual(['2026-09-29 08:00'])

        const alem = await batidas('rh', `&colaborador_id=${colGdr.id}&por_pagina=3&pagina=5`)
        expect(alem).toMatchObject({ itens: [], total: 4 })
    })

    it('recusa período invertido', async () => {
        const res = await ctx.app.inject({
            method: 'GET',
            url: '/api/v1/batidas?de=2026-10-02&ate=2026-10-01',
            headers: autorizado(ctx.tokens.rh),
        })
        expect(res.statusCode).toBe(400)
    })
})
