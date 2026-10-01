import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

let ctx: Contexto

beforeAll(async () => {
    ctx = await prepararContexto()
})

afterAll(() => encerrar(ctx))

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT'

function como(token: string, method: Metodo, url: string, payload?: object) {
    return ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: autorizado(token) })
}

const comoRh = (method: Metodo, url: string, payload?: object) => como(ctx.tokens.rh, method, url, payload)
const comoEquipe = (method: Metodo, url: string, payload?: object) => como(ctx.tokens.admin, method, url, payload)

describe('usuários dos clientes', () => {
    it('cliente não pode ter perfil de equipe', async () => {
        const res = await comoRh('POST', '/clientes', { nome: 'Invasor', email: 'invasor@demo.local', perfil: 'admin' })
        expect(res.statusCode).toBe(400)
    })

    it('valida CPF', async () => {
        const res = await comoRh('POST', '/clientes', { nome: 'Fulano', cpf: '123.456.789-00', perfil: 'gestor' })
        expect(res.statusCode).toBe(400)
    })

    it('cria gestor com senha temporária e troca obrigatória', async () => {
        const res = await comoRh('POST', '/clientes', {
            nome: 'Novo Gestor',
            email: 'novo.gestor@demo.local',
            cpf: '529.982.247-25',
            perfil: 'gestor',
            unidade_ids: [ctx.unidades.TRS],
        })
        expect(res.statusCode, res.body).toBe(201)
        const { id, senha_temporaria, usuario } = res.json()
        expect(senha_temporaria).toEqual(expect.any(String))
        expect(usuario).toMatchObject({
            perfil: 'gestor',
            empresa_id: ctx.empresaId,
            deve_trocar_senha: true,
            cpf_mascarado: '***.982.247-**',
        })
        expect(usuario.unidades).toEqual([{ id: ctx.unidades.TRS, nome_exibicao: 'TRS' }])

        const login = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { login: '52998224725', senha: senha_temporaria },
        })
        expect(login.statusCode).toBe(200)
        expect(login.json().usuario).toMatchObject({ tipo: 'cliente', perfil: 'gestor' })
        const bloqueado = await ctx.app.inject({
            method: 'GET',
            url: '/api/v1/unidades',
            headers: autorizado(login.json().token),
        })
        expect(bloqueado.statusCode).toBe(403)

        const duplicado = await comoRh('POST', '/clientes', { nome: 'Dup', email: 'NOVO.gestor@demo.local', perfil: 'rh' })
        expect(duplicado.statusCode).toBe(409)

        const vinculo = await comoRh('PUT', `/clientes/${id}/unidades`, {
            unidade_ids: [ctx.unidades.GDR, ctx.unidades.VRD],
        })
        expect(vinculo.json()).toEqual({ unidade_ids: [ctx.unidades.GDR, ctx.unidades.VRD] })

        const desativado = await comoRh('PATCH', `/clientes/${id}`, { ativo: false })
        expect(desativado.statusCode).toBe(200)
        expect(desativado.json().ativo).toBe(false)

        const auditoria = await db.query(
            `SELECT acao, cliente_id, usuario_id FROM log_auditoria
              WHERE entidade = 'clientes' AND entidade_id = $1 ORDER BY id`,
            [String(id)],
        )
        expect(auditoria.rows.map(r => r.acao)).toEqual(['cliente.criado', 'cliente.unidades_alteradas', 'cliente.alterado'])
        // feito pelo RH: autoria fica em cliente_id
        expect(auditoria.rows.every(r => r.cliente_id != null && r.usuario_id == null)).toBe(true)
    })

    it('RH não muda cliente de empresa', async () => {
        const { rows } = await db.query(`SELECT id FROM clientes WHERE email = 'gestor@demo.local'`)
        const res = await comoRh('PATCH', `/clientes/${rows[0].id}`, { empresa_id: 999999 })
        expect(res.statusCode).toBe(400)
    })

    it('redefinir senha invalida o token atual', async () => {
        const { rows } = await db.query(`SELECT id FROM clientes WHERE email = 'gestor@demo.local'`)
        const res = await comoRh('POST', `/clientes/${rows[0].id}/redefinir-senha`)
        expect(res.statusCode).toBe(200)
        expect(res.json().senha_temporaria).toEqual(expect.any(String))

        const antigo = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizado(ctx.tokens.gestor) })
        expect(antigo.statusCode).toBe(401)
    })

    it('lista paginada só da própria empresa, com CPF mascarado', async () => {
        const res = await comoRh('GET', '/clientes?por_pagina=100')
        expect(res.statusCode).toBe(200)
        const { itens, total } = res.json()
        expect(total).toBe(itens.length)
        expect(itens.every((u: { empresa_id: number; cpf?: string }) => u.empresa_id === ctx.empresaId && !('cpf' in u))).toBe(
            true,
        )
    })

    it('equipe cria cliente em qualquer empresa, informando a empresa', async () => {
        const semEmpresa = await comoEquipe('POST', '/clientes', { nome: 'Sem Empresa', email: 'sem.empresa@demo.local', perfil: 'rh' })
        expect(semEmpresa.statusCode).toBe(400)

        const res = await comoEquipe('POST', '/clientes', {
            nome: 'RH Criado pela Equipe',
            email: 'rh.equipe@demo.local',
            perfil: 'rh',
            empresa_id: ctx.empresaId,
        })
        expect(res.statusCode, res.body).toBe(201)

        const auditoria = await db.query(
            `SELECT usuario_id, cliente_id FROM log_auditoria WHERE entidade = 'clientes' AND entidade_id = $1`,
            [String(res.json().id)],
        )
        expect(auditoria.rows[0]).toMatchObject({ cliente_id: null })
        expect(auditoria.rows[0].usuario_id).not.toBeNull()
    })
})

describe('equipe Scale IA', () => {
    it('só a equipe acessa', async () => {
        expect((await comoRh('GET', '/equipe')).statusCode).toBe(403)
        expect((await comoRh('POST', '/equipe', { nome: 'Invasor', email: 'invasor@demo.local' })).statusCode).toBe(403)
    })

    it('cria membro que entra como equipe e não pode se desativar', async () => {
        const res = await comoEquipe('POST', '/equipe', { nome: 'Nova Pessoa', email: 'nova.pessoa@scaleia.ai' })
        expect(res.statusCode, res.body).toBe(201)
        const { id, senha_temporaria, usuario } = res.json()
        expect(usuario).toMatchObject({ nome: 'Nova Pessoa', ativo: true, deve_trocar_senha: true })

        const login = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { login: 'nova.pessoa@scaleia.ai', senha: senha_temporaria },
        })
        expect(login.json().usuario).toMatchObject({ tipo: 'equipe', perfil: 'admin', empresa_id: null })

        const lista = await comoEquipe('GET', '/equipe?busca=nova.pessoa')
        expect(lista.json().itens.map((m: { id: number }) => m.id)).toEqual([id])

        const eu = await db.query(`SELECT id FROM usuarios WHERE email = 'admin-teste@demo.local'`)
        const autoDesativar = await comoEquipe('PATCH', `/equipe/${eu.rows[0].id}`, { ativo: false })
        expect(autoDesativar.statusCode).toBe(400)
    })

    it('e-mail não se repete entre equipe e clientes', async () => {
        const res = await comoEquipe('POST', '/equipe', { nome: 'Conflito', email: 'rh@demo.local' })
        expect(res.statusCode).toBe(409)

        const cliente = await comoRh('POST', '/clientes', { nome: 'Conflito', email: 'admin-teste@demo.local', perfil: 'gestor' })
        expect(cliente.statusCode).toBe(409)
    })
})
