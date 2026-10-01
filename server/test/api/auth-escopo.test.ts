import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { autorizado, CPF_GESTOR_DEMO, encerrar, prepararContexto, SENHA_DEMO, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

let ctx: Contexto

beforeAll(async () => {
    ctx = await prepararContexto()
})

afterAll(() => encerrar(ctx))

describe('login', () => {
    it('entra por e-mail e devolve as unidades do usuário', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { login: 'RH@demo.local', senha: SENHA_DEMO },
        })
        expect(res.statusCode).toBe(200)
        const corpo = res.json()
        expect(corpo.usuario).toMatchObject({ email: 'rh@demo.local', perfil: 'rh', empresa_id: ctx.empresaId })
        expect(corpo.unidades.map((u: { nome_exibicao: string }) => u.nome_exibicao)).toEqual(['GDR', 'TRS', 'VRD'])
    })

    it('entra por CPF com máscara', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { login: CPF_GESTOR_DEMO, senha: SENHA_DEMO },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().usuario.perfil).toBe('gestor')
        expect(res.json().unidades).toHaveLength(2)
    })

    it('troca de senha exige senha nova diferente da atual', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/auth/trocar-senha',
            payload: { senha_atual: SENHA_DEMO, nova_senha: SENHA_DEMO },
            headers: autorizado(ctx.tokens.rh),
        })
        expect(res.statusCode).toBe(400)
    })

    it('rota inexistente responde 404 no formato padrão', async () => {
        const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nao-existe' })
        expect(res.statusCode).toBe(404)
        expect(res.json()).toEqual({ error: 'Rota não encontrada.' })
    })

    it('recusa senha errada com 401 genérico', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { login: 'gestor@demo.local', senha: 'errada123' },
        })
        expect(res.statusCode).toBe(401)
        expect(res.json().error).toBe('Login ou senha inválidos.')
    })
})

describe('escopo do gestor', () => {
    it('lista só as unidades vinculadas', async () => {
        const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/unidades', headers: autorizado(ctx.tokens.gestor) })
        expect(res.statusCode).toBe(200)
        expect(res.json().map((u: { nome_exibicao: string }) => u.nome_exibicao)).toEqual(['GDR', 'VRD'])
        expect(res.json()[0].ultimo_fechamento).not.toBeNull()
    })

    it('recebe 404 no dashboard de unidade fora do escopo', async () => {
        const res = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/unidades/${ctx.unidades.TRS}/dashboard`,
            headers: autorizado(ctx.tokens.gestor),
        })
        expect(res.statusCode).toBe(404)
    })

    it('recebe 404 em colaborador de outra unidade e 200 na própria', async () => {
        const { rows } = await db.query(
            'SELECT unidade_id, min(id) AS id FROM colaboradores WHERE unidade_id = ANY($1::int[]) GROUP BY unidade_id',
            [[ctx.unidades.TRS, ctx.unidades.GDR]],
        )
        const porUnidade = Object.fromEntries(rows.map(r => [r.unidade_id, r.id]))

        const fora = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/colaboradores/${porUnidade[ctx.unidades.TRS]}/historico`,
            headers: autorizado(ctx.tokens.gestor),
        })
        expect(fora.statusCode).toBe(404)

        const dentro = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/colaboradores/${porUnidade[ctx.unidades.GDR]}`,
            headers: autorizado(ctx.tokens.gestor),
        })
        expect(dentro.statusCode).toBe(200)
        expect(dentro.json().unidade).toEqual({ id: ctx.unidades.GDR, nome: 'GDR' })
        expect(dentro.json().resumo.saldo_min).toEqual(expect.any(Number))

        const historico = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/colaboradores/${porUnidade[ctx.unidades.GDR]}/historico?limite=2`,
            headers: autorizado(ctx.tokens.gestor),
        })
        expect(historico.statusCode).toBe(200)
        expect(historico.json()).toHaveLength(2)
        expect(historico.json()[0].data_referencia > historico.json()[1].data_referencia).toBe(true)
    })

    it('não acessa rotas de RH/admin', async () => {
        for (const url of ['/api/v1/clientes', '/api/v1/equipe', '/api/v1/configuracoes', '/api/v1/admin/fechamentos']) {
            const res = await ctx.app.inject({ method: 'GET', url, headers: autorizado(ctx.tokens.gestor) })
            expect(res.statusCode, url).toBe(403)
        }
    })

    it('colaborador transferido segue visível para a unidade antiga, só com o histórico dela', async () => {
        const { rows } = await db.query('SELECT max(id) AS id FROM colaboradores WHERE unidade_id = $1', [ctx.unidades.GDR])
        const id = rows[0].id
        await db.query('UPDATE colaboradores SET unidade_id = $1 WHERE id = $2', [ctx.unidades.TRS, id])

        const gestor = await ctx.app.inject({ method: 'GET', url: `/api/v1/colaboradores/${id}`, headers: autorizado(ctx.tokens.gestor) })
        expect(gestor.statusCode).toBe(200)
        expect(gestor.json().unidade).toEqual({ id: ctx.unidades.GDR, nome: 'GDR' })

        const rh = await ctx.app.inject({ method: 'GET', url: `/api/v1/colaboradores/${id}`, headers: autorizado(ctx.tokens.rh) })
        expect(rh.json().unidade).toEqual({ id: ctx.unidades.TRS, nome: 'TRS' })

        const historico = await ctx.app.inject({
            method: 'GET',
            url: `/api/v1/colaboradores/${id}/historico`,
            headers: autorizado(ctx.tokens.gestor),
        })
        expect(historico.json().every((s: { unidade: { id: number } }) => s.unidade.id === ctx.unidades.GDR)).toBe(true)
    })

    it('exige token', async () => {
        const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/unidades' })
        expect(res.statusCode).toBe(401)
    })
})
