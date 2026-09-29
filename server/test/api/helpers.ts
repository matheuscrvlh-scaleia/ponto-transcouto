import type { FastifyInstance } from 'fastify'
import { expect } from 'vitest'
import { buildApp } from '../../src/app'
import { db } from '../../src/db/database'
import { hashPassword } from '../../src/utils/hash'

export const SENHA_DEMO = 'demo12345'
export const CPF_GESTOR_DEMO = '812.399.002-28'

export type Contexto = {
    app: FastifyInstance
    tokens: Record<'admin' | 'rh' | 'gestor', string>
    empresaId: number
    unidades: Record<'GDR' | 'VRD' | 'TRS', number>
}

export async function login(app: FastifyInstance, loginInformado: string, senha = SENHA_DEMO) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: loginInformado, senha } })
    expect(res.statusCode, res.body).toBe(200)
    return res.json().token as string
}

export async function prepararContexto(): Promise<Contexto> {
    const app = await buildApp()

    const empresa = await db.query(`SELECT id FROM empresas WHERE nome = 'Demo'`)
    if (!empresa.rows[0]) throw new Error('Rode "npm run seed:dev" antes dos testes de API.')
    const empresaId: number = empresa.rows[0].id

    const { rows } = await db.query('SELECT id, nome_exibicao FROM unidades WHERE empresa_id = $1', [empresaId])
    const unidades = Object.fromEntries(rows.map(r => [r.nome_exibicao, r.id])) as Contexto['unidades']

    await db.query(
        `INSERT INTO usuarios (nome, email, senha, perfil, empresa_id, ativo, deve_trocar_senha)
         VALUES ('Admin Teste', 'admin-teste@demo.local', $1, 'admin', NULL, true, false)`,
        [await hashPassword(SENHA_DEMO)],
    )

    const tokens = {
        admin: await login(app, 'admin-teste@demo.local'),
        rh: await login(app, 'rh@demo.local'),
        gestor: await login(app, 'gestor@demo.local'),
    }

    return { app, tokens, empresaId, unidades }
}

export async function encerrar(ctx: Contexto | undefined) {
    await ctx?.app.close()
    await db.end()
}

export function autorizado(token: string) {
    return { authorization: `Bearer ${token}` }
}
