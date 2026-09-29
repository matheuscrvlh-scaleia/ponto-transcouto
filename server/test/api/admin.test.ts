import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { decrypt } from '../../src/utils/crypt'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

let ctx: Contexto

beforeAll(async () => {
    ctx = await prepararContexto()
})

afterAll(() => encerrar(ctx))

function comoAdmin(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) {
    return ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: autorizado(ctx.tokens.admin) })
}

describe('de-para de unidades', () => {
    it('lista não mapeadas primeiro e responde 409 para nome duplicado', async () => {
        const lista = await ctx.app.inject({
            method: 'GET',
            url: '/api/v1/admin/unidades',
            headers: autorizado(ctx.tokens.rh),
        })
        expect(lista.statusCode).toBe(200)
        const unidades = lista.json()
        expect(unidades[0].nome_exibicao).toBeNull()
        expect(unidades.every((u: { empresa_id: number }) => u.empresa_id === ctx.empresaId)).toBe(true)

        const duplicado = await ctx.app.inject({
            method: 'PATCH',
            url: `/api/v1/admin/unidades/${unidades[0].id}`,
            payload: { nome_exibicao: 'gdr' },
            headers: autorizado(ctx.tokens.rh),
        })
        expect(duplicado.statusCode).toBe(409)

        const ok = await ctx.app.inject({
            method: 'PATCH',
            url: `/api/v1/admin/unidades/${unidades[0].id}`,
            payload: { nome_exibicao: 'NOF' },
            headers: autorizado(ctx.tokens.rh),
        })
        expect(ok.statusCode).toBe(200)
        expect(ok.json().nome_exibicao).toBe('NOF')
    })

    it('solicita sincronização', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/api/v1/admin/sincronizacoes',
            headers: autorizado(ctx.tokens.rh),
        })
        expect(res.statusCode).toBe(202)
        expect(res.json().empresas.map((e: { id: number }) => e.id)).toEqual([ctx.empresaId])
    })
})

describe('painel de fechamentos', () => {
    it('lista com dados do ciclo e detalha erros', async () => {
        const res = await comoAdmin('GET', `/admin/fechamentos?empresa_id=${ctx.empresaId}&status=falhou`)
        expect(res.statusCode).toBe(200)
        const [falhou] = res.json()
        expect(falhou).toMatchObject({ status: 'falhou', tipo: 'fechamento_mes', unidade: { nome: 'TRS' } })
        expect(falhou.ultima_execucao.status).toBe('falhou')

        const detalhe = await comoAdmin('GET', `/admin/fechamentos/${falhou.id}`)
        expect(detalhe.json().execucoes).toHaveLength(1)
        expect(detalhe.json().erros.length).toBeGreaterThan(0)

        const semMotivo = await comoAdmin('POST', `/admin/fechamentos/${falhou.id}/publicar`, {})
        expect(semMotivo.statusCode).toBe(400)

        const publicado = await comoAdmin('POST', `/admin/fechamentos/${falhou.id}/publicar`, {
            motivo: 'Publicação parcial aprovada pelo RH',
        })
        expect(publicado.statusCode, publicado.body).toBe(200)
        expect(publicado.json().status).toBe('sucesso')

        const reprocessado = await comoAdmin('POST', `/admin/fechamentos/${falhou.id}/reprocessar`, {})
        expect(reprocessado.statusCode).toBe(202)
        expect(reprocessado.json()).toMatchObject({ status: 'pendente', tentativas: 0, registros: 0 })
    })

    it('ajusta gatilho só de ciclo não iniciado', async () => {
        const { rows } = await db.query(
            `SELECT c.id, bool_or(f.status = 'sucesso') AS publicado
               FROM ciclos c JOIN fechamentos f ON f.ciclo_id = c.id
              WHERE c.empresa_id = $1 GROUP BY c.id`,
            [ctx.empresaId],
        )
        const futuro = rows.find(r => !r.publicado)
        const passado = rows.find(r => r.publicado)

        const bloqueado = await comoAdmin('PATCH', `/admin/ciclos/${passado.id}/gatilho`, {
            gatilho_em: '2030-01-01T09:00:00Z',
            motivo: 'teste bloqueio',
        })
        expect(bloqueado.statusCode).toBe(409)

        const ok = await comoAdmin('PATCH', `/admin/ciclos/${futuro.id}/gatilho`, {
            gatilho_em: '2030-01-02T12:00:00-03:00',
            motivo: 'Feriado municipal',
        })
        expect(ok.statusCode, ok.body).toBe(200)
        expect(new Date(ok.json().gatilho_em).toISOString()).toBe('2030-01-02T15:00:00.000Z')
    })

    it('rh consulta o painel só da própria empresa e não executa ações', async () => {
        const rh = (method: 'GET' | 'POST', url: string) =>
            ctx.app.inject({ method, url: `/api/v1${url}`, headers: autorizado(ctx.tokens.rh), payload: method === 'POST' ? {} : undefined })

        const lista = await rh('GET', '/admin/fechamentos?empresa_id=999999')
        expect(lista.statusCode).toBe(200)
        expect(lista.json().length).toBeGreaterThan(0)
        expect(lista.json().every((f: { empresa: { id: number } }) => f.empresa.id === ctx.empresaId)).toBe(true)

        const id = lista.json()[0].id
        expect((await rh('GET', `/admin/fechamentos/${id}`)).statusCode).toBe(200)
        expect((await rh('GET', `/admin/cota-secullum`)).statusCode).toBe(200)
        expect((await rh('POST', `/admin/fechamentos/${id}/reprocessar`)).statusCode).toBe(403)

        const { rows } = await db.query(
            `INSERT INTO empresas (nome) VALUES ('Outra Empresa RH') RETURNING id`,
        )
        const { rows: [unidade] } = await db.query(
            `INSERT INTO unidades (empresa_id, documento, razao_social, nome_exibicao)
             VALUES ($1, '11222333000181', 'OUTRA LTDA', 'OUT') RETURNING id`,
            [rows[0].id],
        )
        const { rows: [ciclo] } = await db.query(
            `INSERT INTO ciclos (empresa_id, periodo_inicio, data_referencia, gatilho_previsto_em, gatilho_em)
             VALUES ($1, '2030-01-01', '2030-01-07', now(), now()) RETURNING id`,
            [rows[0].id],
        )
        const { rows: [outro] } = await db.query(
            `INSERT INTO fechamentos (ciclo_id, empresa_id, unidade_id) VALUES ($1, $2, $3) RETURNING id`,
            [ciclo.id, rows[0].id, unidade.id],
        )
        expect((await rh('GET', `/admin/fechamentos/${outro.id}`)).statusCode).toBe(404)
    })
})

describe('empresas e mapeamento', () => {
    it('cria empresa com senha cifrada e configuração padrão, sem expor a senha', async () => {
        const res = await comoAdmin('POST', '/admin/empresas', {
            nome: 'Empresa Teste API',
            secullum_usuario: 'usuario@teste',
            secullum_senha: 'segredo-123',
            secullum_banco_id: 'banco-teste-api',
        })
        expect(res.statusCode, res.body).toBe(201)
        const empresa = res.json()
        expect(empresa).toMatchObject({ nome: 'Empresa Teste API', possui_senha: true })
        expect(JSON.stringify(empresa)).not.toContain('segredo')

        const { rows } = await db.query('SELECT secullum_senha_cripto FROM empresas WHERE id = $1', [empresa.id])
        expect(decrypt(rows[0].secullum_senha_cripto)).toBe('segredo-123')

        const config = await comoAdmin('GET', `/configuracoes?empresa_id=${empresa.id}`)
        expect(config.statusCode).toBe(200)

        const duplicada = await comoAdmin('POST', '/admin/empresas', { nome: 'empresa teste api' })
        expect(duplicada.statusCode).toBe(409)

        const semSenha = await comoAdmin('PATCH', `/admin/empresas/${empresa.id}`, { secullum_senha: null })
        expect(semSenha.statusCode).toBe(400)
    })

    it('mapeamento de colunas: lê colunas detectadas e substitui', async () => {
        const atual = await comoAdmin('GET', `/admin/mapeamento-colunas?empresa_id=${ctx.empresaId}`)
        expect(atual.statusCode).toBe(200)
        expect(atual.json().colunas_detectadas).toEqual(expect.arrayContaining(['BSaldo', 'Ex50%', 'Ex150%']))

        const invalido = await comoAdmin('PUT', `/admin/mapeamento-colunas?empresa_id=${ctx.empresaId}`, {
            mapeamento: [
                { coluna_secullum: 'BSaldo', campo: 'saldo_banco' },
                { coluna_secullum: 'Outro', campo: 'saldo_banco' },
            ],
        })
        expect(invalido.statusCode).toBe(400)

        const novo = [...atual.json().mapeamento, { coluna_secullum: 'Ex150%', campo: 'extra' }]
        const salvo = await comoAdmin('PUT', `/admin/mapeamento-colunas?empresa_id=${ctx.empresaId}`, { mapeamento: novo })
        expect(salvo.statusCode, salvo.body).toBe(200)
        expect(salvo.json().mapeamento).toHaveLength(novo.length)
    })

    it('cota da Secullum', async () => {
        const res = await comoAdmin('GET', `/admin/cota-secullum?empresa_id=${ctx.empresaId}`)
        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({ usadas_ultima_hora: 0, limite: 90 })
    })
})
