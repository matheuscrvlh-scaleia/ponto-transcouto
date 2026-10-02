import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { criarExecucao } from '../../src/models/extracao.models'
import { autorizado, encerrar, prepararContexto, type Contexto } from './helpers'

vi.mock('../../src/db/database', () => import('./banco-transacional'))

let ctx: Contexto
let semanas: string[]

beforeAll(async () => {
    ctx = await prepararContexto()
    const { rows } = await db.query(
        `SELECT DISTINCT c.data_referencia::text AS d
           FROM ciclos c JOIN fechamentos f ON f.ciclo_id = c.id AND f.status = 'sucesso'
          WHERE c.empresa_id = $1 ORDER BY 1`,
        [ctx.empresaId],
    )
    semanas = rows.map(r => r.d)
})

afterAll(() => encerrar(ctx))

type Perfil = keyof Contexto['tokens']

/** A Demo não tem integração; os testes de sincronização precisam de credenciais (falsas, na transação). */
const configurarCredenciais = () =>
    db.query(
        `UPDATE empresas SET secullum_usuario = 'teste', secullum_senha_cripto = 'x', secullum_banco_id = '1' WHERE id = $1`,
        [ctx.empresaId],
    )

function como(perfil: Perfil, method: 'GET' | 'POST', url: string, payload?: object) {
    return ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: autorizado(ctx.tokens[perfil]) })
}

describe('integração FriPonto', () => {
    it('RH e gestor só puxam dados recentes; a equipe puxa períodos antigos', async () => {
        const antigo = 'inicio=2026-01-05&fim=2026-01-11'
        const rh = await como('rh', 'GET', `/integracao/dados/previa?${antigo}`)
        expect(rh.statusCode).toBe(400)
        expect(rh.json().error).toContain('últimos 45 dias')
        expect((await como('gestor', 'POST', '/integracao/dados', { inicio: '2026-01-05', fim: '2026-01-11' })).statusCode).toBe(400)

        const equipe = await como('admin', 'GET', `/integracao/dados/previa?${antigo}&empresa_id=${ctx.empresaId}`)
        expect(equipe.statusCode, equipe.body).toBe(200)
    })

    it('gestor só vê no histórico o que fez e o que envolve unidades dele', async () => {
        const sessao = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizado(ctx.tokens.gestor) })
        const dele: number[] = sessao.json().unidades.map((u: { id: number }) => u.id)
        const outra = Object.values(ctx.unidades).find(id => !dele.includes(id))!
        const rh = await db.query(`SELECT id FROM clientes WHERE email = 'rh@demo.local'`)
        const pedido = (unidades: number[], motivo: string) =>
            db.query(
                `INSERT INTO log_auditoria (cliente_id, empresa_id, acao, entidade, entidade_id, dados, criado_em)
                 VALUES ($1, $2, 'integracao.dados_solicitados', 'empresas', $3, $4, now() - interval '1 second')`,
                [rh.rows[0].id, ctx.empresaId, String(ctx.empresaId), { inicio: '2026-09-01', fim: '2026-09-07', unidade_ids: unidades, motivo }],
            )
        // um pouco antes de agora: não passa na frente do que os outros testes conferem no topo do histórico
        await pedido([outra], 'so-outra')
        await pedido([dele[0]], 'so-dele')

        const motivos = async (perfil: Perfil) =>
            (await como(perfil, 'GET', '/integracao/historico')).json().itens.map((i: { dados: { motivo?: string } | null }) => i.dados?.motivo)
        expect(await motivos('gestor')).toContain('so-dele')
        expect(await motivos('gestor')).not.toContain('so-outra')
        expect(await motivos('rh')).toEqual(expect.arrayContaining(['so-dele', 'so-outra']))
    })

    it('status mostra só as unidades do escopo de cada perfil', async () => {
        const rh = await como('rh', 'GET', '/integracao/status')
        expect(rh.statusCode, rh.body).toBe(200)
        // a 4ª unidade da Demo (sem nome no seed) aparece com a razão social
        expect(rh.json().unidades).toHaveLength(4)
        expect(rh.json().empresa).toMatchObject({ id: ctx.empresaId })
        expect(rh.json().cota.limite_por_hora).toBeGreaterThan(0)

        const gestor = await como('gestor', 'GET', '/integracao/status')
        expect(gestor.json().unidades).toHaveLength(2)

        // equipe precisa dizer de qual empresa
        expect((await como('admin', 'GET', '/integracao/status')).statusCode).toBe(400)
        expect((await como('admin', 'GET', `/integracao/status?empresa_id=${ctx.empresaId}`)).statusCode).toBe(200)
    })

    it('valida o período pedido', async () => {
        const futuro = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
        const fimNoFuturo = await como('rh', 'GET', `/integracao/dados/previa?inicio=2026-09-01&fim=${futuro}`)
        expect(fimNoFuturo.statusCode).toBe(400)

        const longo = await como('rh', 'GET', '/integracao/dados/previa?inicio=2026-01-01&fim=2026-09-01')
        expect(longo.statusCode).toBe(400)

        const invertido = await como('rh', 'GET', '/integracao/dados/previa?inicio=2026-09-10&fim=2026-09-01')
        expect(invertido.statusCode).toBe(400)
    })

    it('gestor não puxa unidade que não é dele', async () => {
        const sessao = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizado(ctx.tokens.gestor) })
        const dele: number[] = sessao.json().unidades.map((u: { id: number }) => u.id)
        const outra = Object.values(ctx.unidades).find(id => !dele.includes(id))!
        const res = await como('gestor', 'GET', `/integracao/dados/previa?inicio=${semanas[0]}&fim=${semanas[0]}&unidade_id=${outra}`)
        expect(res.statusCode).toBe(404)
    })

    it('prévia de uma semana antiga inclui as semanas seguintes como dependentes', async () => {
        expect(semanas.length).toBeGreaterThan(1)
        const alvo = semanas[0]
        const res = await como('rh', 'GET', `/integracao/dados/previa?inicio=${alvo}&fim=${alvo}`)
        expect(res.statusCode, res.body).toBe(200)
        const previa = res.json()
        expect(previa.fechamentos).toBe(3)
        expect(previa.dependentes).toBeGreaterThan(0)
        expect(previa.semanas.find((s: { data_referencia: string }) => s.data_referencia === alvo)).toMatchObject({
            nova: false,
            dependente: false,
        })
        expect(previa.semanas.some((s: { dependente: boolean }) => s.dependente)).toBe(true)
        expect(previa.chamadas_estimadas).toBeGreaterThan(0)
    })

    it('gestor pede dados: reabre as semanas com ele como solicitante e fica no histórico', async () => {
        const alvo = semanas[semanas.length - 1]
        const res = await como('gestor', 'POST', '/integracao/dados', { inicio: alvo, fim: alvo, motivo: 'conferência' })
        expect(res.statusCode, res.body).toBe(202)
        expect(res.json().fechamentos).toBe(2)

        const { rows } = await db.query(
            `SELECT f.id, f.status, f.solicitado_por_cliente, cl.email,
                    (SELECT count(*)::int FROM registros_horas r WHERE r.fechamento_id = f.id) AS registros
               FROM fechamentos f
               JOIN ciclos c ON c.id = f.ciclo_id
               JOIN clientes cl ON cl.id = f.solicitado_por_cliente
              WHERE c.empresa_id = $1 AND c.data_referencia = $2`,
            [ctx.empresaId, alvo],
        )
        expect(rows).toHaveLength(2)
        expect(rows.every(r => r.status === 'pendente' && r.email === 'gestor@demo.local' && r.registros === 0)).toBe(true)

        // ao começar, o worker registra a execução como manual, com o gestor como autor
        const execucaoId = await criarExecucao(rows[0].id, 10, 0)
        const execucao = await db.query(
            'SELECT disparo, disparado_por, disparado_por_cliente FROM execucoes_extracao WHERE id = $1',
            [execucaoId],
        )
        expect(execucao.rows[0]).toMatchObject({ disparo: 'manual', disparado_por: null })
        expect(execucao.rows[0].disparado_por_cliente).toBe(rows[0].solicitado_por_cliente)

        const historico = await como('rh', 'GET', '/integracao/historico')
        const ultimo = historico.json().itens[0]
        expect(ultimo).toMatchObject({ acao: 'integracao.dados_solicitados', ator: { tipo: 'cliente', nome: 'Gestor Demo' } })
        expect(ultimo.descricao).toContain('Pediu dados de')
        expect(ultimo.dados.motivo).toBe('conferência')

        const execucoes = await como('gestor', 'GET', '/integracao/execucoes')
        expect(execucoes.statusCode).toBe(200)
        expect(execucoes.json().itens[0]).toMatchObject({ disparo: 'manual', disparado_por: { tipo: 'cliente', nome: 'Gestor Demo' } })
    })

    it('pedido de cadastros marca a sincronização e registra quem pediu (sem duplicar pedido na fila)', async () => {
        await db.query('UPDATE empresas SET sincronizacao_solicitada_em = NULL WHERE id = $1', [ctx.empresaId])
        const res = await como('gestor', 'POST', '/integracao/cadastros', { motivo: 'colaborador novo' })
        expect(res.statusCode, res.body).toBe(202)

        const repetido = await como('rh', 'POST', '/integracao/cadastros', {})
        expect(repetido.statusCode).toBe(202)
        expect(repetido.json().ja_pendente).toBe(true)

        const status = await como('gestor', 'GET', '/integracao/status')
        expect(status.json().empresa.sincronizacao_pendente).toBe(true)

        const historico = await como('rh', 'GET', '/integracao/historico')
        expect(historico.json().itens[0]).toMatchObject({
            acao: 'sincronizacao.solicitada',
            ator: { tipo: 'cliente', nome: 'Gestor Demo' },
        })
    })

    it('forçar sincronização pede cadastros e batidas e, no tempo real, põe todos na frente da fila', async () => {
        expect((await como('gestor', 'POST', '/integracao/sincronizar', {})).statusCode).toBe(403)

        const semIntegracao = await como('rh', 'POST', '/integracao/sincronizar', {})
        expect(semIntegracao.statusCode).toBe(400)
        expect(semIntegracao.json().error).toContain('não está configurada')
        await configurarCredenciais()

        await db.query('UPDATE empresas SET sincronizacao_solicitada_em = NULL WHERE id = $1', [ctx.empresaId])
        const semanal = await como('rh', 'POST', '/integracao/sincronizar', { motivo: 'conferir cadastros' })
        expect(semanal.statusCode, semanal.body).toBe(202)
        expect(semanal.json()).toMatchObject({ cadastros: { ja_pendente: false }, batidas: true, tempo_real: null })

        const importacao = await db.query('SELECT tentado_em FROM batidas_importacao WHERE empresa_id = $1', [ctx.empresaId])
        expect(new Date(importacao.rows[0].tentado_em).getUTCFullYear()).toBe(2000)
        expect((await como('rh', 'GET', '/integracao/status')).json().empresa.sincronizacao_pendente).toBe(true)

        const historico = await como('rh', 'GET', '/integracao/historico')
        expect(historico.json().itens[0]).toMatchObject({
            acao: 'integracao.sincronizacao_forcada',
            descricao: 'Forçou a sincronização (cadastros e batidas)',
            ator: { tipo: 'cliente' },
        })

        await db.query(`UPDATE configuracoes SET modo_extracao = 'tempo_real' WHERE empresa_id = $1`, [ctx.empresaId])
        const tempoReal = await como('admin', 'POST', `/integracao/sincronizar?empresa_id=${ctx.empresaId}`, {})
        expect(tempoReal.statusCode, tempoReal.body).toBe(202)
        // cadastros já estavam na fila: não pede de novo
        expect(tempoReal.json().cadastros.ja_pendente).toBe(true)
        expect(tempoReal.json().tempo_real.colaboradores).toBeGreaterThan(0)
        await db.query(`UPDATE configuracoes SET modo_extracao = 'semanal' WHERE empresa_id = $1`, [ctx.empresaId])
    })

    it('atividade: mostra o que está sincronizando e só RH e equipe veem os erros recentes', async () => {
        await configurarCredenciais()
        await db.query('UPDATE empresas SET sincronizacao_solicitada_em = now() WHERE id = $1', [ctx.empresaId])
        await db.query(
            `INSERT INTO batidas_importacao (empresa_id, tentado_em, ultimo_erro, ultimo_erro_em)
             VALUES ($1, timestamptz '2000-01-01', 'Secullum FonteDados: erro de teste', now())
             ON CONFLICT (empresa_id) DO UPDATE SET tentado_em = EXCLUDED.tentado_em,
                    ultimo_erro = EXCLUDED.ultimo_erro, ultimo_erro_em = EXCLUDED.ultimo_erro_em`,
            [ctx.empresaId],
        )

        const rh = (await como('rh', 'GET', '/integracao/atividade')).json()
        expect(rh.sincronizando).toBe(true)
        expect(rh.tarefas).toMatchObject({ cadastros: 1, batidas: 1 })
        expect(rh.erros[0]).toMatchObject({ origem: 'Batidas', mensagem: 'Secullum FonteDados: erro de teste' })
        expect(rh.erros[0].chave).toMatch(/^batidas:/)

        const gestor = await como('gestor', 'GET', '/integracao/atividade')
        expect(gestor.statusCode).toBe(200)
        expect(gestor.json().sincronizando).toBe(true)
        expect(gestor.json().erros).toEqual([])

        await db.query(`UPDATE empresas SET sincronizado_em = now() + interval '1 second' WHERE id = $1`, [ctx.empresaId])
        await db.query('UPDATE batidas_importacao SET tentado_em = now() WHERE empresa_id = $1', [ctx.empresaId])
        const parado = (await como('admin', 'GET', `/integracao/atividade?empresa_id=${ctx.empresaId}`)).json()
        expect(parado.tarefas).toMatchObject({ cadastros: 0, batidas: 0 })
    })
})
