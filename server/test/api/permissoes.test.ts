import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { autorizado, encerrar, login, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

type Grupo = {
    id: number
    nome: string
    alcance: 'empresa' | 'unidades'
    telas: string[]
    padrao: 'rh' | 'gestor' | null
    usuarios: number
    pode_editar: boolean
    proprio: boolean
}

let ctx: Contexto

beforeAll(async () => {
    ctx = await prepararContexto()
})

afterAll(() => encerrar(ctx))

function como(token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
    return ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: autorizado(token) })
}

async function grupos(token = ctx.tokens.rh) {
    const res = await como(token, 'GET', '/permissoes/grupos')
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as Grupo[]
}

/** Cria um usuário no grupo (pela equipe) e devolve o token dele, já sem troca de senha pendente. */
async function usuarioNoGrupo(grupoId: number, email: string, unidadeIds: number[] = []) {
    const res = await como(ctx.tokens.admin, 'POST', '/clientes', {
        nome: `Teste ${email}`,
        email,
        grupo_id: grupoId,
        empresa_id: ctx.empresaId,
        unidade_ids: unidadeIds,
    })
    expect(res.statusCode, res.body).toBe(201)
    await db.query('UPDATE clientes SET deve_trocar_senha = false WHERE id = $1', [res.json().id])
    return { id: res.json().id as number, token: await login(ctx.app, email, res.json().senha_temporaria) }
}

describe('grupos de permissão', () => {
    it('toda empresa tem RH e Gestor como grupos padrão, com os usuários atuais', async () => {
        const lista = await grupos()
        const rh = lista.find(g => g.padrao === 'rh')!
        const gestor = lista.find(g => g.padrao === 'gestor')!
        expect(rh).toMatchObject({ nome: 'RH', alcance: 'empresa', proprio: true, pode_editar: false })
        expect(rh.telas).toContain('permissoes')
        expect(gestor).toMatchObject({ nome: 'Gestor', alcance: 'unidades', pode_editar: true })
        expect(gestor.usuarios).toBeGreaterThan(0)

        // gestor não vê a tela de permissões
        expect((await como(ctx.tokens.gestor, 'GET', '/permissoes/grupos')).statusCode).toBe(403)
    })

    it('cria, edita e exclui um grupo; nome repetido e grupo padrão são recusados', async () => {
        const criado = await como(ctx.tokens.rh, 'POST', '/permissoes/grupos', {
            nome: 'Supervisão',
            descricao: 'Só acompanha',
            alcance: 'unidades',
            telas: ['dashboard', 'batidas', 'batidas'],
        })
        expect(criado.statusCode, criado.body).toBe(201)
        expect(criado.json()).toMatchObject({ nome: 'Supervisão', telas: ['dashboard', 'batidas'], usuarios: 0 })
        const id = criado.json().id

        const repetido = await como(ctx.tokens.rh, 'POST', '/permissoes/grupos', { nome: 'supervisão', alcance: 'unidades', telas: [] })
        expect(repetido.statusCode).toBe(409)

        const editado = await como(ctx.tokens.rh, 'PATCH', `/permissoes/grupos/${id}`, { telas: ['dashboard', 'colaboradores'] })
        expect(editado.statusCode, editado.body).toBe(200)
        expect(editado.json().telas).toEqual(['dashboard', 'colaboradores'])

        const padrao = (await grupos()).find(g => g.padrao === 'gestor')!
        expect((await como(ctx.tokens.rh, 'DELETE', `/permissoes/grupos/${padrao.id}`)).statusCode).toBe(400)

        expect((await como(ctx.tokens.rh, 'DELETE', `/permissoes/grupos/${id}`)).statusCode).toBe(204)
        expect((await grupos()).some(g => g.id === id)).toBe(false)
    })

    it('as telas do grupo liberam (ou não) as rotas', async () => {
        const res = await como(ctx.tokens.rh, 'POST', '/permissoes/grupos', {
            nome: 'Só batidas',
            alcance: 'unidades',
            telas: ['batidas'],
        })
        const usuario = await usuarioNoGrupo(res.json().id, 'so-batidas@demo.local', [ctx.unidades.GDR])

        expect((await como(usuario.token, 'GET', '/batidas')).statusCode).toBe(200)
        expect((await como(usuario.token, 'GET', '/dashboard')).statusCode).toBe(403)
        expect((await como(usuario.token, 'GET', '/integracao/status')).statusCode).toBe(403)
        expect((await como(usuario.token, 'GET', '/clientes')).statusCode).toBe(403)

        const me = await como(usuario.token, 'GET', '/auth/me')
        expect(me.json().usuario).toMatchObject({ telas: ['batidas'], grupo: { nome: 'Só batidas' }, perfil: 'gestor' })

        // liberar o Dashboard vale na hora, sem novo login
        await como(ctx.tokens.rh, 'PATCH', `/permissoes/grupos/${res.json().id}`, { telas: ['batidas', 'dashboard'] })
        expect((await como(usuario.token, 'GET', '/dashboard')).statusCode).toBe(200)

        // grupo com usuários não é excluído
        expect((await como(ctx.tokens.rh, 'DELETE', `/permissoes/grupos/${res.json().id}`)).statusCode).toBe(409)
    })

    it('ninguém libera mais do que tem nem mexe no próprio grupo', async () => {
        const coordenacao = await como(ctx.tokens.admin, 'POST', `/permissoes/grupos?empresa_id=${ctx.empresaId}`, {
            nome: 'Coordenação',
            alcance: 'unidades',
            telas: ['dashboard', 'permissoes', 'usuarios'],
        })
        expect(coordenacao.statusCode, coordenacao.body).toBe(201)
        const coord = await usuarioNoGrupo(coordenacao.json().id, 'coord@demo.local', [ctx.unidades.GDR])

        // tela que ele não tem / alcance empresa toda
        const demais = await como(coord.token, 'POST', '/permissoes/grupos', { nome: 'Extra', alcance: 'unidades', telas: ['batidas'] })
        expect(demais.statusCode).toBe(403)
        const empresa = await como(coord.token, 'POST', '/permissoes/grupos', { nome: 'Empresa toda', alcance: 'empresa', telas: ['dashboard'] })
        expect(empresa.statusCode).toBe(403)
        const ok = await como(coord.token, 'POST', '/permissoes/grupos', { nome: 'Leitura', alcance: 'unidades', telas: ['dashboard'] })
        expect(ok.statusCode, ok.body).toBe(201)

        // o próprio grupo e o RH (que libera mais) aparecem sem edição e são recusados
        const vistos = await grupos(coord.token)
        expect(vistos.find(g => g.id === coordenacao.json().id)).toMatchObject({ proprio: true, pode_editar: false })
        expect(vistos.find(g => g.padrao === 'rh')!.pode_editar).toBe(false)
        expect((await como(coord.token, 'PATCH', `/permissoes/grupos/${coordenacao.json().id}`, { telas: ['dashboard'] })).statusCode).toBe(403)

        // usuários: só coloca gente em grupo que cabe no dele
        const rh = vistos.find(g => g.padrao === 'rh')!
        const noRh = await como(coord.token, 'POST', '/clientes', { nome: 'Promovido', email: 'promo@demo.local', grupo_id: rh.id })
        expect(noRh.statusCode, noRh.body).toBe(403)
        const naLeitura = await como(coord.token, 'POST', '/clientes', {
            nome: 'Leitor',
            email: 'leitor@demo.local',
            grupo_id: ok.json().id,
            unidade_ids: [ctx.unidades.GDR],
        })
        expect(naLeitura.statusCode, naLeitura.body).toBe(201)
        expect(naLeitura.json().usuario.grupo).toMatchObject({ nome: 'Leitura', alcance: 'unidades' })
    })

    it('mudar o alcance do grupo muda o perfil (e as unidades vistas) dos usuários dele', async () => {
        const res = await como(ctx.tokens.admin, 'POST', `/permissoes/grupos?empresa_id=${ctx.empresaId}`, {
            nome: 'Regional',
            alcance: 'unidades',
            telas: ['dashboard'],
        })
        const regional = await usuarioNoGrupo(res.json().id, 'regional@demo.local', [ctx.unidades.GDR])
        const antes = (await como(regional.token, 'GET', '/unidades')).json()
        expect(antes.map((u: { id: number }) => u.id)).toEqual([ctx.unidades.GDR])

        await como(ctx.tokens.admin, 'PATCH', `/permissoes/grupos/${res.json().id}`, { alcance: 'empresa' })
        const { rows } = await db.query('SELECT perfil FROM clientes WHERE id = $1', [regional.id])
        expect(rows[0].perfil).toBe('rh')
        const depois = (await como(regional.token, 'GET', '/unidades')).json()
        expect(depois.length).toBeGreaterThan(1)
    })

    it('o perfil antigo continua aceito no cadastro de usuários (vira o grupo padrão)', async () => {
        const res = await como(ctx.tokens.rh, 'POST', '/clientes', {
            nome: 'Gestor legado',
            email: 'legado@demo.local',
            perfil: 'gestor',
            unidade_ids: [ctx.unidades.VRD],
        })
        expect(res.statusCode, res.body).toBe(201)
        expect(res.json().usuario).toMatchObject({ perfil: 'gestor', grupo: { nome: 'Gestor' } })
    })
})
