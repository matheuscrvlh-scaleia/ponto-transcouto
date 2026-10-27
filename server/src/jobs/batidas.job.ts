import { db, type Executor } from '../db/database'
import { LIMITE_PAGINA_FONTE_DADOS, marcacoesAPartirDoId, marcacoesDoPeriodo } from '../integrations/secullum/fonte-dados'
import type { ClienteSecullum } from '../integrations/secullum/cliente'
import type { MarcacaoSecullum, OpcoesCliente } from '../integrations/secullum/tipos'
import {
    empresasParaImportar,
    gravarMarcacoes,
    marcarTentativa,
    registrarErro,
    registrarSucesso,
    removerAusentes,
    vincularPendentes,
    type ImportacaoBatidas,
} from '../models/batidas.models'
import { buscarCredenciais, registrarChamadaApi } from '../models/sincronizacao.models'
import { dataLocal, diaParaIso } from '../services/calendario.service'
import { clienteDaEmpresa } from './cliente-empresa'
import type { Log } from './log'

/*
 * Batidas: copia as marcações da FonteDados da Secullum para o log da tela de Batidas.
 * - carga inicial: os últimos DIAS_CARGA_INICIAL dias, por data;
 * - depois, incremental: FonteDados/APartirDoId a partir do maior Id já visto;
 * - uma vez por dia relê os últimos DIAS_REVISAO dias por data, para pegar marcações
 *   alteradas na Secullum sem Id novo (ex.: batida desconsiderada pelo RH) e apagar as que foram excluídas.
 * A FonteDados não entra na cota de /Calcular.
 */

/** Uma empresa não é consultada de novo antes disso. */
export const INTERVALO_IMPORTACAO_MIN = 5
export const DIAS_CARGA_INICIAL = 31
export const DIAS_REVISAO = 7
const DIAS_POR_CHAMADA = 7
const HORAS_ENTRE_REVISOES = 24
/** Páginas de 5.000 por rodada, para não segurar o resto do ciclo do worker. */
const MAXIMO_PAGINAS_POR_RODADA = 20

export type OpcoesBatidas = {
    log: Log
    ex?: Executor
    deveParar?: () => boolean
    opcoesCliente?: Omit<OpcoesCliente, 'ganchos'>
    agora?: Date
}

const maiorId = (marcacoes: MarcacaoSecullum[]) => marcacoes.reduce((maior, m) => Math.max(maior, m.id), -1)

/** Lê [inicio, fim] (dias desde 1970) em janelas de DIAS_POR_CHAMADA; devolve o maior Id visto (-1 se nenhum). */
async function importarPeriodo(cliente: ClienteSecullum, empresaId: number, inicio: number, fim: number, ex: Executor) {
    let maior = -1
    for (let de = inicio; de <= fim; de += DIAS_POR_CHAMADA) {
        const ate = Math.min(de + DIAS_POR_CHAMADA - 1, fim)
        const marcacoes = await marcacoesDoPeriodo(cliente, diaParaIso(de), diaParaIso(ate))
        await gravarMarcacoes(empresaId, marcacoes, ex)
        // atalho: resposta vazia não apaga nada (uma semana inteira sem marcação é mais provável falha da API que exclusão)
        if (marcacoes.length > 0) {
            await removerAusentes(empresaId, diaParaIso(de), diaParaIso(ate), marcacoes.map(m => m.id), ex)
        }
        maior = Math.max(maior, maiorId(marcacoes))
    }
    return maior
}

/** Páginas de FonteDados/APartirDoId; devolve o próximo cursor. */
async function importarIncremental(cliente: ClienteSecullum, empresaId: number, cursor: number, op: OpcoesBatidas, ex: Executor) {
    for (let pagina = 0; pagina < MAXIMO_PAGINAS_POR_RODADA && !op.deveParar?.(); pagina++) {
        const marcacoes = await marcacoesAPartirDoId(cliente, cursor)
        await gravarMarcacoes(empresaId, marcacoes, ex)
        const proximo = maiorId(marcacoes) + 1
        // página vazia ou sem avanço (a API devolve Id >= cursor): nada novo
        if (proximo <= cursor) break
        cursor = proximo
        // página incompleta: era a última
        if (marcacoes.length < LIMITE_PAGINA_FONTE_DADOS) break
    }
    return cursor
}

async function importarEmpresa(empresa: ImportacaoBatidas, op: OpcoesBatidas, ex: Executor) {
    await marcarTentativa(empresa.empresa_id, ex)
    const credenciais = await buscarCredenciais(empresa.empresa_id, ex)
    if (!credenciais) return
    const cliente = clienteDaEmpresa(credenciais, {
        ...op.opcoesCliente,
        ganchos: {
            depois: (rota, status, duracaoMs) =>
                registrarChamadaApi({ empresaId: empresa.empresa_id, execucaoId: null, rota, status, duracaoMs }, ex),
        },
    })

    const agora = op.agora ?? new Date()
    const hoje = dataLocal(agora, empresa.fuso_horario)
    let proximoId: number | null = null
    let revisadoEm: Date | null = null

    if (empresa.proximo_id === null) {
        const maior = await importarPeriodo(cliente, empresa.empresa_id, hoje - DIAS_CARGA_INICIAL + 1, hoje, ex)
        // sem nenhuma marcação no período a carga inicial se repete na próxima rodada
        if (maior >= 0) proximoId = maior + 1
        revisadoEm = agora
    } else {
        proximoId = await importarIncremental(cliente, empresa.empresa_id, Number(empresa.proximo_id), op, ex)
        const revisarDesde = agora.getTime() - HORAS_ENTRE_REVISOES * 3600_000
        if (!empresa.revisado_em || empresa.revisado_em.getTime() <= revisarDesde) {
            const maior = await importarPeriodo(cliente, empresa.empresa_id, hoje - DIAS_REVISAO + 1, hoje, ex)
            proximoId = Math.max(proximoId, maior + 1)
            revisadoEm = agora
        }
    }

    await vincularPendentes(empresa.empresa_id, ex)
    await registrarSucesso(empresa.empresa_id, { proximoId, revisadoEm }, ex)
}

export async function executarImportacaoBatidas(op: OpcoesBatidas) {
    const ex = op.ex ?? db
    for (const empresa of await empresasParaImportar(INTERVALO_IMPORTACAO_MIN, ex)) {
        if (op.deveParar?.()) break
        try {
            await importarEmpresa(empresa, op, ex)
        } catch (err) {
            const mensagem = (err as Error).message
            await registrarErro(empresa.empresa_id, mensagem, ex).catch(() => {})
            op.log.erro(`batidas: empresa ${empresa.empresa_id}: ${mensagem}`)
        }
    }
}
