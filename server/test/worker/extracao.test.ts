import type { PoolClient } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/database'
import { descartarToken } from '../../src/integrations/secullum/auth'
import { processarProximoFechamento } from '../../src/jobs/extracao.job'
import { logSilencioso } from '../../src/jobs/log'
import { executarRegua } from '../../src/jobs/regua.job'
import { sincronizarEmpresa } from '../../src/jobs/sincronizacao.job'
import { criarFechamentosDoCiclo } from '../../src/models/extracao.models'
import { empresasParaSincronizar } from '../../src/models/sincronizacao.models'
import { proximosCiclos } from '../../src/services/calendario.service'
import { encrypt } from '../../src/utils/crypt'

const CNPJ_A = '12345678000190'
const CNPJ_B = '98765432000110'
const CPF_ANA = '52998224725'
const CPF_BRUNO = '11144477735'
const CPF_CARLA = '39053344705'
const CPF_DEMITIDO = '15350946056'

type Chamada = { url: string, metodo: string, headers: Record<string, string>, corpo: unknown }

let client: PoolClient
let empresaId: number
let bancoId: string
let chamadas: Chamada[]
let totaisPorCpf: Map<string, Array<{ status: number, corpo?: unknown }>>

const colunas = ['Data', 'Normais', 'Ex50%', 'Ex100%', 'Faltas', 'Atras.', 'BSaldo']
const resposta = (ex50: string, ex100: string, faltas: string, atrasos: string) =>
    ({ status: 200, corpo: { Colunas: colunas, Totais: ['', '176:00', ex50, ex100, faltas, atrasos, '99:00'] } })

function json(status: number, corpo?: unknown) {
    return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

async function fetchFalso(entrada: string | URL | Request, init?: RequestInit) {
    const url = String(entrada)
    const metodo = init?.method ?? 'GET'
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    const corpo = typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init?.body
    chamadas.push({ url, metodo, headers, corpo })

    if (url.endsWith('/Token')) return json(200, { access_token: 'token-falso', token_type: 'bearer', expires_in: 3600 })
    if (metodo === 'GET' && url.endsWith('/IntegracaoExterna/Empresas')) {
        return json(200, [
            { Id: 1, Nome: 'TC TESTE TRANSPORTES LTDA', Documento: '12.345.678/0001-90', Desativada: false },
            { Id: 2, Nome: 'OUTRA UNIDADE LTDA', Documento: '98.765.432/0001-10', Desativada: false },
        ])
    }
    if (metodo === 'GET' && url.endsWith('/IntegracaoExterna/Funcionarios')) {
        return json(200, [
            { Id: 10, Nome: 'Ana', Cpf: '529.982.247-25', EmpresaCnpjCpf: '12.345.678/0001-90', Admissao: '2020-01-02T00:00:00', Rg: '123', NomeMae: 'X' },
            { Id: 11, Nome: 'Bruno', Cpf: '11144477735', EmpresaId: 1, Admissao: '2021-05-01T00:00:00', DepartamentoDescricao: 'Pátio' },
            { Id: 12, Nome: 'Carla', Cpf: '390.533.447-05', EmpresaCnpjCpf: '98765432000110' },
            { Id: 13, Nome: 'Demitido', Cpf: '153.509.460-56', EmpresaCnpjCpf: '12345678000190', Admissao: '2019-01-01', Demissao: '2026-01-10T00:00:00' },
        ])
    }
    if (metodo === 'POST' && url.endsWith('/IntegracaoExterna/Calcular/SomenteTotais')) {
        const cpf = (corpo as { FuncionarioCpf: string }).FuncionarioCpf
        const fila = totaisPorCpf.get(cpf) ?? []
        const proxima = fila.length > 1 ? fila.shift()! : fila[0]
        if (!proxima) return json(400, [{ Property: 'FuncionarioCpf', Message: 'Funcionário não encontrado' }])
        return json(proxima.status, proxima.corpo)
    }
    return json(404, { title: 'rota não mockada' })
}

async function um<T>(sql: string, params: unknown[] = []) {
    const { rows } = await client.query(sql, params)
    return rows[0] as T
}

async function criarCiclo(tipo: string, periodoInicio: string, dataReferencia: string, gatilho: string) {
    const { id } = await um<{ id: number }>(
        `INSERT INTO ciclos (empresa_id, tipo, periodo_inicio, data_referencia, gatilho_previsto_em, gatilho_em)
         VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
        [empresaId, tipo, periodoInicio, dataReferencia, gatilho],
    )
    await criarFechamentosDoCiclo(id, client)
    return um<{ id: number }>('SELECT id FROM fechamentos WHERE ciclo_id = $1', [id])
}

const processar = () => processarProximoFechamento({ log: logSilencioso, ex: client, opcoesCliente: { backoffMs: 1 } })
const chamadasCalcular = () => chamadas.filter(c => c.url.endsWith('Calcular/SomenteTotais'))

beforeAll(async () => {
    client = await db.connect()
})

afterAll(async () => {
    client.release()
    await db.end()
})

beforeEach(async () => {
    chamadas = []
    totaisPorCpf = new Map()
    descartarToken()
    vi.stubGlobal('fetch', vi.fn(fetchFalso))

    await client.query('BEGIN')
    bancoId = `teste-${Date.now()}`
    ;({ id: empresaId } = await um<{ id: number }>(
        `INSERT INTO empresas (nome, secullum_usuario, secullum_senha_cripto, secullum_banco_id, sincronizacao_solicitada_em)
         VALUES ($1, 'integracao@teste', $2, $3, now()) RETURNING id`,
        [`Teste worker ${bancoId}`, encrypt('senha-teste'), bancoId],
    ))
    await client.query(
        `INSERT INTO configuracoes (empresa_id, origem_horas_pagas, teto_horas_pagas_minutos, teto_periodicidade)
         VALUES ($1, 'teto', 600, 'mensal')`,
        [empresaId],
    )
    await client.query(
        `INSERT INTO mapeamento_colunas (empresa_id, coluna_secullum, campo)
         SELECT $1, c, f FROM unnest($2::text[], $3::text[]) AS m(c, f)`,
        [empresaId, ['Normais', 'Ex50%', 'Ex100%', 'Faltas', 'Atras.', 'BSaldo'], ['ignorar', 'extra', 'extra', 'negativa', 'negativa', 'ignorar']],
    )
    await client.query(
        `INSERT INTO unidades (empresa_id, documento, razao_social, nome_exibicao) VALUES ($1, $2, 'TC TESTE', 'Teste A')`,
        [empresaId, CNPJ_A],
    )
})

afterEach(async () => {
    await client.query('ROLLBACK')
    vi.unstubAllGlobals()
})

describe('worker com Secullum mockada (transação desfeita)', () => {
    it('sincroniza unidades e colaboradores sem dados pessoais extras', async () => {
        expect(await empresasParaSincronizar(client)).toContain(empresaId)
        await sincronizarEmpresa(empresaId, logSilencioso, client)
        expect(await empresasParaSincronizar(client)).not.toContain(empresaId)

        const unidades = (await client.query(
            'SELECT documento, razao_social, nome_exibicao, ativo FROM unidades WHERE empresa_id = $1 ORDER BY documento',
            [empresaId],
        )).rows
        expect(unidades).toEqual([
            { documento: CNPJ_A, razao_social: 'TC TESTE TRANSPORTES LTDA', nome_exibicao: 'Teste A', ativo: true },
            { documento: CNPJ_B, razao_social: 'OUTRA UNIDADE LTDA', nome_exibicao: null, ativo: true },
        ])

        const colaboradores = (await client.query(
            `SELECT col.cpf, col.nome, un.documento, col.ativo, col.data_demissao::text, col.departamento
               FROM colaboradores col JOIN unidades un ON un.id = col.unidade_id
              WHERE col.empresa_id = $1 ORDER BY col.nome`,
            [empresaId],
        )).rows
        expect(colaboradores).toEqual([
            { cpf: CPF_ANA, nome: 'Ana', documento: CNPJ_A, ativo: true, data_demissao: null, departamento: null },
            { cpf: CPF_BRUNO, nome: 'Bruno', documento: CNPJ_A, ativo: true, data_demissao: null, departamento: 'Pátio' },
            { cpf: CPF_CARLA, nome: 'Carla', documento: CNPJ_B, ativo: true, data_demissao: null, departamento: null },
            { cpf: CPF_DEMITIDO, nome: 'Demitido', documento: CNPJ_A, ativo: false, data_demissao: '2026-01-10', departamento: null },
        ])

        const empresa = await um<{ ok: boolean }>(
            'SELECT sincronizado_em >= sincronizacao_solicitada_em AS ok FROM empresas WHERE id = $1', [empresaId],
        )
        expect(empresa.ok).toBe(true)
        expect(chamadas.every(c => c.metodo === 'GET' || c.url.endsWith('/Token'))).toBe(true)
        expect(chamadas.find(c => c.url.endsWith('/Empresas'))?.headers.secullumidbancoselecionado).toBe(bancoId)
    })

    it('executa ciclos completos: publica, calcula *_semana, respeita retry e cota, bloqueia mapeamento desconhecido', async () => {
        await sincronizarEmpresa(empresaId, logSilencioso, client)

        totaisPorCpf.set(CPF_ANA, [resposta('12:30', '02:00', '08:00', '00:45')])
        totaisPorCpf.set(CPF_BRUNO, [{ status: 503 }, resposta('01:00', '', '', '')])

        // 1) semanal 15/09: Ana e Bruno (Bruno com 503 + retry); demitido fora; Carla é de outra unidade
        const semanal = await criarCiclo('semanal', '2026-08-26', '2026-09-15', '2001-01-01T09:00:00Z')
        expect(await processar()).toBe(true)

        const f1 = await um<{ status: string, publicado_em: Date | null, total_colaboradores: number, tentativas: number }>(
            'SELECT status, publicado_em, total_colaboradores, tentativas FROM fechamentos WHERE id = $1', [semanal.id],
        )
        expect(f1).toMatchObject({ status: 'sucesso', total_colaboradores: 2, tentativas: 1 })
        expect(f1.publicado_em).not.toBeNull()

        const ana1 = await um<Record<string, unknown>>(
            `SELECT r.* FROM registros_horas r JOIN colaboradores c ON c.id = r.colaborador_id
              WHERE r.fechamento_id = $1 AND c.cpf = $2`, [semanal.id, CPF_ANA],
        )
        expect(ana1).toMatchObject({
            extra_periodo: 870, negativa_periodo: 525, pagas_periodo: 600, banco_periodo: 270,
            extra_semana: 870, banco_semana: 270, saldo_banco_total: -255, base_semana_registro_id: null,
        })
        expect(ana1.dados_brutos).toEqual({ colunas, totais: ['', '176:00', '12:30', '02:00', '08:00', '00:45', '99:00'] })

        const calc = chamadasCalcular()
        expect(calc).toHaveLength(3)
        expect(calc[0].corpo).toEqual({ FuncionarioCpf: CPF_ANA, DataInicial: '2026-08-26', DataFinal: '2026-09-15' })
        expect(calc[0].headers).toMatchObject({ Authorization: 'Bearer token-falso', secullumidbancoselecionado: bancoId })

        const cota = (await client.query(
            `SELECT http_status FROM chamadas_api WHERE empresa_id = $1 AND rota = 'Calcular/SomenteTotais' ORDER BY id`,
            [empresaId],
        )).rows.map(r => r.http_status)
        expect(cota).toEqual([200, 503, 200])

        const exec1 = await um<{ status: string, processados: number, com_erro: number }>(
            'SELECT status, processados, com_erro FROM execucoes_extracao WHERE fechamento_id = $1', [semanal.id],
        )
        expect(exec1).toEqual({ status: 'sucesso', processados: 2, com_erro: 0 })

        // 2) fechamento do mês 25/09 no mesmo período: *_semana contra o semanal publicado
        totaisPorCpf.set(CPF_ANA, [resposta('20:00', '02:00', '08:00', '00:45')])
        totaisPorCpf.set(CPF_BRUNO, [resposta('01:00', '', '', '')])
        const mensal = await criarCiclo('fechamento_mes', '2026-08-26', '2026-09-25', '2001-01-02T09:00:00Z')
        expect(await processar()).toBe(true)

        const ana2 = await um<Record<string, unknown>>(
            `SELECT r.* FROM registros_horas r JOIN colaboradores c ON c.id = r.colaborador_id
              WHERE r.fechamento_id = $1 AND c.cpf = $2`, [mensal.id, CPF_ANA],
        )
        expect(ana2).toMatchObject({
            extra_periodo: 1320, pagas_periodo: 600, banco_periodo: 720,
            extra_semana: 450, negativa_semana: 0, pagas_semana: 0, banco_semana: 450,
            saldo_banco_total: 720 - 525, base_semana_registro_id: ana1.id,
        })

        // 3) novo período: saldo acumula o fechamento anterior; coluna nova bloqueia e não gasta cota com os demais
        totaisPorCpf.set(CPF_ANA, [{ status: 200, corpo: { Colunas: [...colunas, 'ExNot'], Totais: ['', '', '01:00', '', '', '', '', '00:30'] } }])
        const novo = await criarCiclo('semanal', '2026-09-26', '2026-10-06', '2001-01-03T09:00:00Z')
        const antes = chamadasCalcular().length
        expect(await processar()).toBe(true)
        expect(chamadasCalcular().length - antes).toBe(1)

        const f3 = await um<{ status: string }>('SELECT status FROM fechamentos WHERE id = $1', [novo.id])
        expect(f3.status).toBe('falhou')
        const erros = (await client.query(
            `SELECT er.etapa, er.mensagem FROM execucao_erros er JOIN execucoes_extracao e ON e.id = er.execucao_id
              WHERE e.fechamento_id = $1`, [novo.id],
        )).rows
        expect(erros).toContainEqual({ etapa: 'mapeamento', mensagem: 'Coluna não mapeada: ExNot' })
        expect((await um<{ n: number }>('SELECT count(*)::int AS n FROM registros_horas WHERE fechamento_id = $1', [novo.id])).n).toBe(0)

        // 4) mapeia a coluna, reprocessa e confere o saldo acumulado do período anterior
        await client.query(`INSERT INTO mapeamento_colunas (empresa_id, coluna_secullum, campo) VALUES ($1, 'ExNot', 'extra')`, [empresaId])
        await client.query(`UPDATE fechamentos SET status = 'pendente', tentativas = 0, proxima_tentativa_em = now() WHERE id = $1`, [novo.id])
        totaisPorCpf.set(CPF_BRUNO, [{ status: 200, corpo: { Colunas: [...colunas, 'ExNot'], Totais: ['', '', '', '', '', '', '', ''] } }])
        expect(await processar()).toBe(true)
        const ana3 = await um<Record<string, number>>(
            `SELECT r.extra_periodo, r.banco_periodo, r.saldo_banco_total, r.extra_semana FROM registros_horas r
               JOIN colaboradores c ON c.id = r.colaborador_id WHERE r.fechamento_id = $1 AND c.cpf = $2`, [novo.id, CPF_ANA],
        )
        expect(ana3).toEqual({ extra_periodo: 90, banco_periodo: 0, saldo_banco_total: 720 - 525, extra_semana: 90 })
        expect((await um<{ status: string }>('SELECT status FROM fechamentos WHERE id = $1', [novo.id])).status).toBe('sucesso')

        // 5) cota esgotada: devolve para a fila sem gastar tentativa e sem chamar a Secullum
        await client.query('UPDATE configuracoes SET cota_calcular_por_hora = 1 WHERE empresa_id = $1', [empresaId])
        const bloqueado = await criarCiclo('semanal', '2026-09-26', '2026-10-13', '2001-01-04T09:00:00Z')
        const antesCota = chamadasCalcular().length
        expect(await processar()).toBe(true)
        expect(chamadasCalcular().length).toBe(antesCota)
        const f5 = await um<{ status: string, tentativas: number, adiado: boolean }>(
            'SELECT status, tentativas, proxima_tentativa_em > now() AS adiado FROM fechamentos WHERE id = $1', [bloqueado.id],
        )
        expect(f5).toEqual({ status: 'pendente', tentativas: 0, adiado: true })
        const exec5 = await um<{ status: string }>('SELECT status FROM execucoes_extracao WHERE fechamento_id = $1', [bloqueado.id])
        expect(exec5.status).toBe('interrompida')

        expect(chamadas.every(c => c.metodo === 'GET' || c.url.endsWith('/Token') || c.url.includes('/Calcular'))).toBe(true)
    })

    it('falha transitória deixa o fechamento pendente com backoff e não publica parcial', async () => {
        await sincronizarEmpresa(empresaId, logSilencioso, client)
        totaisPorCpf.set(CPF_ANA, [resposta('01:00', '', '', '')])
        totaisPorCpf.set(CPF_BRUNO, [{ status: 500 }])

        const f = await criarCiclo('semanal', '2026-08-26', '2026-09-15', '2001-01-01T09:00:00Z')
        expect(await processar()).toBe(true)

        const estado = await um<{ status: string, publicado_em: Date | null, adiado: boolean }>(
            'SELECT status, publicado_em, proxima_tentativa_em > now() AS adiado FROM fechamentos WHERE id = $1', [f.id],
        )
        expect(estado).toEqual({ status: 'pendente', publicado_em: null, adiado: true })
        const exec = await um<{ status: string, processados: number, com_erro: number }>(
            'SELECT status, processados, com_erro FROM execucoes_extracao WHERE fechamento_id = $1', [f.id],
        )
        expect(exec).toEqual({ status: 'falhou', processados: 1, com_erro: 1 })
        expect(chamadasCalcular().filter(c => (c.corpo as { FuncionarioCpf: string }).FuncionarioCpf === CPF_BRUNO)).toHaveLength(3)

        // retomada: só o Bruno é recalculado
        totaisPorCpf.set(CPF_BRUNO, [resposta('02:00', '', '', '')])
        await client.query('UPDATE fechamentos SET proxima_tentativa_em = now() WHERE id = $1', [f.id])
        const antes = chamadasCalcular().length
        expect(await processar()).toBe(true)
        expect(chamadasCalcular().slice(antes).map(c => (c.corpo as { FuncionarioCpf: string }).FuncionarioCpf)).toEqual([CPF_BRUNO])
        expect((await um<{ status: string }>('SELECT status FROM fechamentos WHERE id = $1', [f.id])).status).toBe('sucesso')
    })

    it('régua cria os ciclos previstos com fechamento só para unidades ativas e nomeadas', async () => {
        await client.query(
            `INSERT INTO unidades (empresa_id, documento, razao_social) VALUES ($1, $2, 'SEM DE-PARA')`,
            [empresaId, CNPJ_B],
        )
        const agora = new Date('2026-10-01T12:00:00Z')
        const { ciclosCriados } = await executarRegua(logSilencioso, client, agora)

        const config = await um<{ dia_semana_extracao: number, hora_extracao: string, dia_fechamento_mes: number, dias_apos_fechamento_mes: number, fuso_horario: string }>(
            `SELECT dia_semana_extracao, hora_extracao::text, dia_fechamento_mes, dias_apos_fechamento_mes, fuso_horario
               FROM configuracoes WHERE empresa_id = $1`, [empresaId],
        )
        const esperados = proximosCiclos(config, new Date(agora.getTime() - 2 * 86400000), 6)
            .filter(c => c.gatilho_em.getTime() <= agora.getTime() + 14 * 86400000)
        expect(ciclosCriados).toBeGreaterThanOrEqual(esperados.length)
        expect(esperados.map(c => c.data_referencia)).toEqual(['2026-10-06', '2026-10-13'])

        const linhas = (await client.query(
            `SELECT c.tipo, c.data_referencia::text, count(f.id)::int AS fechamentos
               FROM ciclos c LEFT JOIN fechamentos f ON f.ciclo_id = c.id
              WHERE c.empresa_id = $1 GROUP BY c.id ORDER BY c.data_referencia`, [empresaId],
        )).rows
        expect(linhas).toEqual([
            { tipo: 'semanal', data_referencia: '2026-10-06', fechamentos: 1 },
            { tipo: 'semanal', data_referencia: '2026-10-13', fechamentos: 1 },
        ])

        expect((await executarRegua(logSilencioso, client, agora)).ciclosCriados).toBe(0)
    })

    it('sincronização não reativa unidade desativada manualmente', async () => {
        await sincronizarEmpresa(empresaId, logSilencioso, client)
        await client.query('UPDATE unidades SET ativo = false WHERE empresa_id = $1 AND documento = $2', [empresaId, CNPJ_A])
        await sincronizarEmpresa(empresaId, logSilencioso, client)
        const unidade = await um<{ ativo: boolean }>(
            'SELECT ativo FROM unidades WHERE empresa_id = $1 AND documento = $2', [empresaId, CNPJ_A],
        )
        expect(unidade.ativo).toBe(false)
    })

    it('unidade sem colaborador elegível cancela o fechamento em vez de publicar vazio', async () => {
        const f = await criarCiclo('semanal', '2026-08-26', '2026-09-15', '2001-01-01T09:00:00Z')
        expect(await processar()).toBe(true)

        const estado = await um<{ status: string, publicado_em: Date | null }>(
            'SELECT status, publicado_em FROM fechamentos WHERE id = $1', [f.id],
        )
        expect(estado).toEqual({ status: 'cancelado', publicado_em: null })
        const exec = await um<{ status: string }>('SELECT status FROM execucoes_extracao WHERE fechamento_id = $1', [f.id])
        expect(exec.status).toBe('sucesso')
        expect(chamadas).toHaveLength(0)
    })

    it('descarta o resultado se o fechamento for reaberto durante a extração', async () => {
        await sincronizarEmpresa(empresaId, logSilencioso, client)
        totaisPorCpf.set(CPF_ANA, [resposta('01:00', '', '', '')])
        totaisPorCpf.set(CPF_BRUNO, [resposta('02:00', '', '', '')])
        const f = await criarCiclo('semanal', '2026-08-26', '2026-09-15', '2001-01-01T09:00:00Z')

        let reaberto = false
        const reabrir = async () => {
            if (reaberto) return
            reaberto = true
            await client.query(`UPDATE fechamentos SET status = 'pendente', tentativas = 0 WHERE id = $1`, [f.id])
        }
        expect(await processarProximoFechamento({ log: logSilencioso, ex: client, aoProgredir: reabrir })).toBe(true)

        const estado = await um<{ status: string, publicado_em: Date | null }>(
            'SELECT status, publicado_em FROM fechamentos WHERE id = $1', [f.id],
        )
        expect(estado).toEqual({ status: 'pendente', publicado_em: null })
        const exec = await um<{ status: string }>('SELECT status FROM execucoes_extracao WHERE fechamento_id = $1', [f.id])
        expect(exec.status).toBe('interrompida')
        expect(chamadasCalcular()).toHaveLength(1)
    })

    it('colaborador transferido usa como base da semana o registro da unidade antiga', async () => {
        await sincronizarEmpresa(empresaId, logSilencioso, client)
        totaisPorCpf.set(CPF_ANA, [resposta('10:00', '', '', '')])
        totaisPorCpf.set(CPF_BRUNO, [resposta('01:00', '', '', '')])
        await criarCiclo('semanal', '2026-08-26', '2026-09-15', '2001-01-01T09:00:00Z')
        expect(await processar()).toBe(true)
        const base = await um<{ id: string }>(
            `SELECT r.id FROM registros_horas r JOIN colaboradores c ON c.id = r.colaborador_id
              WHERE c.empresa_id = $1 AND c.cpf = $2`, [empresaId, CPF_ANA],
        )

        const unidadeB = await um<{ id: number }>(
            `UPDATE unidades SET nome_exibicao = 'Teste B' WHERE empresa_id = $1 AND documento = $2 RETURNING id`,
            [empresaId, CNPJ_B],
        )
        await client.query('UPDATE colaboradores SET unidade_id = $1 WHERE empresa_id = $2 AND cpf = $3', [unidadeB.id, empresaId, CPF_ANA])
        totaisPorCpf.set(CPF_ANA, [resposta('12:00', '', '', '')])
        totaisPorCpf.set(CPF_CARLA, [resposta('00:30', '', '', '')])
        await criarCiclo('semanal', '2026-08-26', '2026-09-22', '2001-01-02T09:00:00Z')
        expect(await processar()).toBe(true)
        expect(await processar()).toBe(true)

        const ana = await um<{ extra_semana: number, base_semana_registro_id: string, unidade_id: number }>(
            `SELECT r.extra_semana, r.base_semana_registro_id, f.unidade_id
               FROM registros_horas r
               JOIN fechamentos f ON f.id = r.fechamento_id
               JOIN colaboradores c ON c.id = r.colaborador_id
              WHERE c.empresa_id = $1 AND c.cpf = $2 AND r.id <> $3`, [empresaId, CPF_ANA, base.id],
        )
        expect(ana).toEqual({ extra_semana: 120, base_semana_registro_id: base.id, unidade_id: unidadeB.id })
    })
})
