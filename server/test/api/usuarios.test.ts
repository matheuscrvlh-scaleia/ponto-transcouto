import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

let ctx: Contexto

beforeAll(async () => {
    ctx = await prepararContexto()
})

afterAll(() => encerrar(ctx))

function comoRh(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) {
    return ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: autorizado(ctx.tokens.rh) })
}

describe('gestão de acessos', () => {
    it('rh não cria admin', async () => {
        const res = await comoRh('POST', '/usuarios', { nome: 'Invasor', email: 'invasor@demo.local', perfil: 'admin' })
        expect(res.statusCode).toBe(403)
    })

    it('rh não edita nem redefine senha de admin (404)', async () => {
        const { rows } = await db.query(`SELECT id FROM usuarios WHERE email = 'admin-teste@demo.local'`)
        expect((await comoRh('PATCH', `/usuarios/${rows[0].id}`, { nome: 'Outro' })).statusCode).toBe(404)
        expect((await comoRh('POST', `/usuarios/${rows[0].id}/redefinir-senha`)).statusCode).toBe(404)
    })

    it('valida CPF', async () => {
        const res = await comoRh('POST', '/usuarios', { nome: 'Fulano', cpf: '123.456.789-00', perfil: 'gestor' })
        expect(res.statusCode).toBe(400)
    })

    it('cria gestor com senha temporária e troca obrigatória', async () => {
        const res = await comoRh('POST', '/usuarios', {
            nome: 'Novo Gestor',
            email: 'novo.gestor@demo.local',
            cpf: '529.982.247-25',
            perfil: 'gestor',
            unidade_ids: [ctx.unidades.TRS],
        })
        expect(res.statusCode, res.body).toBe(201)
        const { id, senha_temporaria, usuario } = res.json()
        expect(senha_temporaria).toEqual(expect.any(String))
        expect(usuario).toMatchObject({ perfil: 'gestor', deve_trocar_senha: true, cpf_mascarado: '***.982.247-**' })
        expect(usuario.unidades).toEqual([{ id: ctx.unidades.TRS, nome_exibicao: 'TRS' }])

        const login = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { login: '52998224725', senha: senha_temporaria },
        })
        expect(login.statusCode).toBe(200)
        const bloqueado = await ctx.app.inject({
            method: 'GET',
            url: '/api/v1/unidades',
            headers: autorizado(login.json().token),
        })
        expect(bloqueado.statusCode).toBe(403)

        const duplicado = await comoRh('POST', '/usuarios', { nome: 'Dup', email: 'NOVO.gestor@demo.local', perfil: 'rh' })
        expect(duplicado.statusCode).toBe(409)

        const vinculo = await comoRh('PUT', `/usuarios/${id}/unidades`, {
            unidade_ids: [ctx.unidades.GDR, ctx.unidades.VRD],
        })
        expect(vinculo.json()).toEqual({ unidade_ids: [ctx.unidades.GDR, ctx.unidades.VRD] })

        const desativado = await comoRh('PATCH', `/usuarios/${id}`, { ativo: false })
        expect(desativado.statusCode).toBe(200)
        expect(desativado.json().ativo).toBe(false)

        const auditoria = await db.query(
            `SELECT acao FROM log_auditoria WHERE entidade = 'usuarios' AND entidade_id = $1 ORDER BY id`,
            [String(id)],
        )
        expect(auditoria.rows.map(r => r.acao)).toEqual(['usuario.criado', 'usuario.unidades_alteradas', 'usuario.alterado'])
    })

    it('redefinir senha invalida o token atual', async () => {
        const { rows } = await db.query(`SELECT id FROM usuarios WHERE email = 'gestor@demo.local'`)
        const res = await comoRh('POST', `/usuarios/${rows[0].id}/redefinir-senha`)
        expect(res.statusCode).toBe(200)
        expect(res.json().senha_temporaria).toEqual(expect.any(String))

        const antigo = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizado(ctx.tokens.gestor) })
        expect(antigo.statusCode).toBe(401)
    })

    it('lista paginada só da própria empresa, com CPF mascarado', async () => {
        const res = await comoRh('GET', '/usuarios?por_pagina=100')
        expect(res.statusCode).toBe(200)
        const { itens, total } = res.json()
        expect(total).toBe(itens.length)
        expect(itens.every((u: { empresa_id: number; cpf?: string }) => u.empresa_id === ctx.empresaId && !('cpf' in u))).toBe(
            true,
        )
    })
})
