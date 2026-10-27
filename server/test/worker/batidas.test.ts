import type { PoolClient } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { descartarToken } from '../../src/integrations/secullum/auth'
import { DIAS_CARGA_INICIAL, executarImportacaoBatidas } from '../../src/jobs/batidas.job'
import { logSilencioso } from '../../src/jobs/log'
import { encrypt } from '../../src/utils/crypt'
import { aplicarMigrationsPendentes } from '../migracoes'

const CPF_ANA = '52998224725'
const CPF_BRUNO = '11144477735'
const AGORA = new Date('2026-10-02T15:00:00-03:00')

type Marcacao = Record<string, unknown>

let client: PoolClient
let empresaId: number
let bancoId: string
let unidadeId: number
let chamadas: string[]
let porData: Marcacao[]
let porId: Marcacao[]

const marcacao = (id: number, data: string, hora: string, extra: Marcacao = {}) => ({
    Id: id, FuncionarioId: 10, FuncionarioCpf: '529.982.247-25', FuncionarioPis: '12345678900',
    EquipamentoId: 1, Data: `${data}T00:00:00`, DataInclusao: `${data}T${hora}:05`, Hora: hora, Tipo: 0, Origem: 1, ...extra,
})

function json(status: number, corpo?: unknown) {
    return new Response(JSON.stringify(corpo ?? null), { status, headers: { 'Content-Type': 'application/json' } })
}

async function fetchFalso(entrada: string | URL | Request, init?: RequestInit) {
    const url = new URL(String(entrada))
    if (url.pathname.endsWith('/Token')) return json(200, { access_token: 'token-falso', token_type: 'bearer', expires_in: 3600 })
    // outras empresas do banco de teste (com credenciais) também passam pelo job: ficam sem marcações
    const banco = (init?.headers as Record<string, string> | undefined)?.secullumidbancoselecionado
    if (banco !== bancoId) return json(200, [])
    chamadas.push(`${url.pathname.replace('/IntegracaoExterna/', '')}${url.search}`)
    if (url.pathname.endsWith('/FonteDados/APartirDoId')) {
        const desde = Number(url.searchParams.get('fonteDadosId'))
        return json(200, porId.filter(m => Number(m.Id) >= desde))
    }
    if (url.pathname.endsWith('/FonteDados')) {
        const de = url.searchParams.get('dataInicio')!
        const ate = url.searchParams.get('dataFim')!
        return json(200, porData.filter(m => String(m.Data).slice(0, 10) >= de && String(m.Data).slice(0, 10) <= ate))
    }
    return json(404, { title: 'rota não mockada' })
}

const importar = (agora = AGORA) => executarImportacaoBatidas({ log: logSilencioso, ex: client, agora, opcoesCliente: { backoffMs: 1 } })

async function batidas() {
    const { rows } = await client.query(
        `SELECT b.fonte_dados_id::int AS id, col.cpf, b.data::text, to_char(b.hora, 'HH24:MI') AS hora, b.tipo, b.origem
           FROM batidas b LEFT JOIN colaboradores col ON col.id = b.colaborador_id
          WHERE b.empresa_id = $1 ORDER BY b.fonte_dados_id`,
        [empresaId],
    )
    return rows
}

/** O intervalo mínimo entre consultas usa o relógio do banco: volta a tentativa no tempo. */
async function liberarProximaRodada() {
    await client.query(`UPDATE batidas_importacao SET tentado_em = now() - interval '1 hour' WHERE empresa_id = $1`, [empresaId])
}

async function cursor() {
    const { rows } = await client.query('SELECT proximo_id::int AS proximo_id FROM batidas_importacao WHERE empresa_id = $1', [empresaId])
    return rows[0]?.proximo_id ?? null
}

beforeAll(async () => {
    client = await db.connect()
})

afterAll(async () => {
    client.release()
    await db.end()
})

beforeEach(async () => {
    chamadas = []
    porData = []
    porId = []
    descartarToken()
    vi.stubGlobal('fetch', vi.fn(fetchFalso))

    await client.query('BEGIN')
    await aplicarMigrationsPendentes(client)
    bancoId = `teste-batidas-${Date.now()}`
    empresaId = (await client.query(
        `INSERT INTO empresas (nome, secullum_usuario, secullum_senha_cripto, secullum_banco_id, sincronizado_em)
         VALUES ($1, 'integracao@teste', $2, $3, now()) RETURNING id`,
        [`Teste batidas ${bancoId}`, encrypt('senha-teste'), bancoId],
    )).rows[0].id
    unidadeId = (await client.query(
        `INSERT INTO unidades (empresa_id, documento, razao_social, nome_exibicao) VALUES ($1, '12345678000190', 'TC', 'Teste A') RETURNING id`,
        [empresaId],
    )).rows[0].id
    await client.query(
        `INSERT INTO colaboradores (empresa_id, unidade_id, secullum_id, nome, cpf, ativo) VALUES ($1, $2, 10, 'Ana', $3, true)`,
        [empresaId, unidadeId, CPF_ANA],
    )
})

afterEach(async () => {
    await client.query('ROLLBACK')
    vi.unstubAllGlobals()
})

describe('importação de batidas (transação desfeita)', () => {
    it('faz a carga inicial por data, depois segue pelo Id e vincula quem chegou depois', async () => {
        porData = [
            marcacao(100, '2026-09-30', '08:01'),
            marcacao(101, '2026-09-30', '12:00'),
            // fora da janela inicial: não vem
            marcacao(50, '2026-08-01', '08:00'),
        ]
        await importar()

        const periodos = chamadas.filter(c => c.startsWith('FonteDados?'))
        expect(periodos).toHaveLength(Math.ceil(DIAS_CARGA_INICIAL / 7))
        expect(periodos[0]).toContain('dataInicio=2026-09-02')
        expect(periodos.at(-1)).toContain('dataFim=2026-10-02')
        expect(await batidas()).toEqual([
            { id: 100, cpf: CPF_ANA, data: '2026-09-30', hora: '08:01', tipo: 0, origem: 1 },
            { id: 101, cpf: CPF_ANA, data: '2026-09-30', hora: '12:00', tipo: 0, origem: 1 },
        ])
        expect(await cursor()).toBe(102)

        // antes do intervalo mínimo a empresa não é consultada de novo
        chamadas = []
        await importar(new Date(AGORA.getTime() + 60_000))
        expect(chamadas).toEqual([])

        // incremental: só Id >= cursor (a 101 alterada fica para a releitura diária);
        // Bruno ainda não sincronizado fica sem vínculo
        porId = [
            marcacao(101, '2026-09-30', '12:00', { Tipo: 3 }),
            marcacao(102, '2026-10-02', '07:58', { FuncionarioId: 11, FuncionarioCpf: CPF_BRUNO, Origem: 6 }),
        ]
        chamadas = []
        await liberarProximaRodada()
        const depois = new Date(AGORA.getTime() + 10 * 60_000)
        await importar(depois)
        expect(chamadas).toEqual(['FonteDados/APartirDoId?fonteDadosId=102'])
        expect(await cursor()).toBe(103)
        expect((await batidas()).map(b => [b.id, b.cpf, b.tipo])).toEqual([[100, CPF_ANA, 0], [101, CPF_ANA, 0], [102, null, 0]])

        await client.query(
            `INSERT INTO colaboradores (empresa_id, unidade_id, secullum_id, nome, cpf, ativo) VALUES ($1, $2, 11, 'Bruno', $3, true)`,
            [empresaId, unidadeId, CPF_BRUNO],
        )
        await liberarProximaRodada()
        porId = []
        await importar(new Date(AGORA.getTime() + 20 * 60_000))
        expect((await batidas()).find(b => b.id === 102)).toMatchObject({ cpf: CPF_BRUNO, origem: 6 })
    })

    it('relê os últimos dias uma vez por dia para pegar marcações alteradas', async () => {
        porData = [marcacao(200, '2026-10-01', '08:00')]
        await importar()
        expect(await cursor()).toBe(201)

        porData = [marcacao(200, '2026-10-01', '08:00', { Tipo: 3 })]
        const amanha = new Date(AGORA.getTime() + 25 * 3600_000)
        await liberarProximaRodada()
        chamadas = []
        await importar(amanha)

        expect(chamadas[0]).toBe('FonteDados/APartirDoId?fonteDadosId=201')
        expect(chamadas.filter(c => c.startsWith('FonteDados?'))).toHaveLength(1)
        expect((await batidas())[0].tipo).toBe(3)
    })

    it('a releitura apaga do log a marcação excluída na Secullum', async () => {
        porData = [
            marcacao(400, '2026-10-01', '08:00'),
            marcacao(401, '2026-10-01', '15:00', { Tipo: 2, Origem: 3 }),
            marcacao(402, '2026-10-01', '16:00', { Tipo: 2, Origem: 3 }),
        ]
        await importar()

        // RH excluiu as pré-assinaladas; o resto da semana segue igual
        porData = [marcacao(400, '2026-10-01', '08:00')]
        await liberarProximaRodada()
        await importar(new Date(AGORA.getTime() + 25 * 3600_000))
        expect((await batidas()).map(b => b.id)).toEqual([400])

        // resposta vazia não apaga nada
        porData = []
        await liberarProximaRodada()
        await importar(new Date(AGORA.getTime() + 50 * 3600_000))
        expect((await batidas()).map(b => b.id)).toEqual([400])
    })

    it('falha da Secullum fica registrada e não avança o cursor', async () => {
        porData = [marcacao(300, '2026-10-01', '08:00')]
        await importar()
        vi.stubGlobal('fetch', vi.fn(async (entrada: string | URL | Request) =>
            String(entrada).endsWith('/Token') ? fetchFalso(entrada) : json(500, { title: 'erro' })))
        await liberarProximaRodada()
        await importar(new Date(AGORA.getTime() + 10 * 60_000))

        const { rows } = await client.query('SELECT proximo_id::int, ultimo_erro FROM batidas_importacao WHERE empresa_id = $1', [empresaId])
        expect(rows[0].proximo_id).toBe(301)
        expect(rows[0].ultimo_erro).toMatch(/FonteDados/)
    })
})
