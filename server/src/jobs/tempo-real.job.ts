import { db, withTransaction, type Executor } from '../db/database'
import { calcularTotais } from '../integrations/secullum/calculo'
import { ROTA_TOTAIS, type ClienteSecullum } from '../integrations/secullum/cliente'
import { SecullumError, type OpcoesCliente } from '../integrations/secullum/tipos'
import {
    buscarMapeamento,
    buscarRegistroAnterior,
    chamadasNaUltimaHora,
    concluirChamada,
    saldoPeriodosAnteriores,
    travarEmpresa,
} from '../models/extracao.models'
import { buscarCredenciais, registrarChamadaApi } from '../models/sincronizacao.models'
import {
    empresasTempoReal,
    gravar,
    limparForaDoEscopo,
    proximosDoRodizio,
    registrarFalha,
    reservarChamadaTempoReal,
    temFechamentoNaFila,
    type EmpresaTempoReal,
} from '../models/tempo-real.models'
import { periodoDeHoje } from '../services/calendario.service'
import { calcularHoras, mensagensErroMapeamento, type RegraPagas } from '../services/calculo-horas.service'
import { clienteDaEmpresa } from './cliente-empresa'
import type { Log } from './log'

/*
 * Tempo real: para empresas com modo_extracao = 'tempo_real', atualiza em rodízio o
 * período atual (início do período até hoje) de cada colaborador em registros_tempo_real.
 * Os fechamentos do mês continuam sendo feitos pela extração normal, que tem prioridade:
 * com fechamento na fila, o tempo real espera; e sempre sobra RESERVA_COTA na hora.
 */

/** Chamadas por hora que o tempo real deixa livres para fechamentos e pedidos da Integração. */
export const RESERVA_COTA = 10
/** Um mesmo colaborador não é consultado de novo antes disso, mesmo com cota sobrando. */
export const INTERVALO_MINIMO_MIN = 15
/** Por rodada do worker (a cada ~1 min), para não segurar o resto do ciclo. */
const MAXIMO_POR_RODADA = 30

class SemCota extends Error {}

export type OpcoesTempoReal = {
    log: Log
    ex?: Executor
    deveParar?: () => boolean
    opcoesCliente?: Omit<OpcoesCliente, 'ganchos'>
    agora?: Date
}

/** Quantas chamadas o tempo real ainda pode fazer nesta hora. */
export function cotaDisponivel(cota: number, usadasNaHora: number) {
    return Math.max(cota - RESERVA_COTA - usadasNaHora, 0)
}

/** Minutos para atualizar todos os colaboradores uma vez (null se não há ninguém). */
export function minutosPorRodada(colaboradores: number, cota: number) {
    if (colaboradores <= 0) return null
    const porHora = Math.max(cota - RESERVA_COTA, 1)
    return Math.max(Math.ceil((colaboradores / porHora) * 60), INTERVALO_MINIMO_MIN)
}

function prepararCliente(empresa: EmpresaTempoReal, credenciais: NonNullable<Awaited<ReturnType<typeof buscarCredenciais>>>, op: OpcoesTempoReal, ex: Executor) {
    let reserva: string | null = null
    return clienteDaEmpresa(credenciais, {
        ...op.opcoesCliente,
        ganchos: {
            antes: async rota => {
                if (rota !== ROTA_TOTAIS) return
                reserva = await withTransaction(async client => {
                    await travarEmpresa(empresa.empresa_id, client)
                    const uso = await chamadasNaUltimaHora(empresa.empresa_id, ROTA_TOTAIS, client)
                    if (cotaDisponivel(empresa.cota_calcular_por_hora, uso.total) <= 0) throw new SemCota()
                    return reservarChamadaTempoReal(empresa.empresa_id, ROTA_TOTAIS, client)
                }, ex)
            },
            depois: async (rota, status, duracaoMs) => {
                if (rota === ROTA_TOTAIS && reserva) {
                    await concluirChamada(reserva, status, duracaoMs, ex)
                    reserva = null
                } else {
                    await registrarChamadaApi({ empresaId: empresa.empresa_id, execucaoId: null, rota, status, duracaoMs }, ex)
                }
            },
        },
    })
}

async function atualizarEmpresa(empresa: EmpresaTempoReal, op: OpcoesTempoReal, ex: Executor) {
    const { periodo_inicio: periodoInicio, hoje } = periodoDeHoje(empresa, op.agora)
    await limparForaDoEscopo(empresa.empresa_id, periodoInicio, hoje, ex)

    if (await temFechamentoNaFila(empresa.empresa_id, ex)) return 0

    const uso = await chamadasNaUltimaHora(empresa.empresa_id, ROTA_TOTAIS, ex)
    const disponivel = Math.min(cotaDisponivel(empresa.cota_calcular_por_hora, uso.total), MAXIMO_POR_RODADA)
    if (disponivel <= 0) return 0

    const fila = await proximosDoRodizio(empresa.empresa_id, periodoInicio, hoje, INTERVALO_MINIMO_MIN, disponivel, ex)
    if (fila.length === 0) return 0

    const credenciais = await buscarCredenciais(empresa.empresa_id, ex)
    if (!credenciais) return 0
    const mapeamento = await buscarMapeamento(empresa.empresa_id, ex)
    const regra: RegraPagas = {
        origem: empresa.origem_horas_pagas,
        teto_minutos: empresa.origem_horas_pagas === 'teto' ? empresa.teto_horas_pagas_minutos : null,
        periodicidade: empresa.origem_horas_pagas === 'teto' ? empresa.teto_periodicidade : null,
    }

    let cliente: ClienteSecullum
    try {
        cliente = prepararCliente(empresa, credenciais, op, ex)
    } catch (err) {
        op.log.erro(`tempo real: empresa ${empresa.empresa_id}: ${(err as Error).message}`)
        return 0
    }

    let atualizados = 0
    for (const col of fila) {
        if (op.deveParar?.()) break
        const alvo = { colaboradorId: col.id, empresaId: empresa.empresa_id, unidadeId: col.unidade_id, periodoInicio, hoje }

        let dados
        try {
            dados = await calcularTotais(cliente, { cpf: col.cpf, dataInicial: periodoInicio, dataFinal: hoje })
        } catch (err) {
            if (err instanceof SemCota) break
            if (err instanceof SecullumError && ['rate_limit', 'auth', 'nao_encontrado', 'formato'].includes(err.tipo)) {
                // problema da empresa/integração, não do colaborador: para e tenta na próxima rodada
                if (err.tipo === 'formato') await registrarFalha(alvo, err.message, ex)
                op.log.erro(`tempo real: empresa ${empresa.empresa_id}: ${err.message}`)
                break
            }
            await registrarFalha(alvo, (err as Error).message, ex)
            continue
        }

        const anterior = await buscarRegistroAnterior(
            { colaboradorId: col.id, empresaId: empresa.empresa_id, periodoInicio, dataReferencia: hoje },
            ex,
        )
        const saldoAnterior = await saldoPeriodosAnteriores(
            { colaboradorId: col.id, empresaId: empresa.empresa_id, periodoInicio },
            ex,
        )
        const resultado = calcularHoras({ dados, mapeamento, regra, anterior, saldoPeriodosAnteriores: saldoAnterior })
        if (!resultado.ok) {
            const mensagem = mensagensErroMapeamento(resultado.erro).join(' ')
            await registrarFalha(alvo, mensagem, ex)
            op.log.erro(`tempo real: empresa ${empresa.empresa_id}: mapeamento de colunas: ${mensagem}`)
            break
        }

        await gravar(alvo, resultado.valores, dados, ex)
        atualizados++
    }
    return atualizados
}

export async function executarTempoReal(op: OpcoesTempoReal) {
    const ex = op.ex ?? db
    let total = 0
    for (const empresa of await empresasTempoReal(ex)) {
        if (op.deveParar?.()) break
        try {
            const atualizados = await atualizarEmpresa(empresa, op, ex)
            if (atualizados) op.log.info(`tempo real: empresa ${empresa.empresa_id}: ${atualizados} colaboradores atualizados`)
            total += atualizados
        } catch (err) {
            op.log.erro(`tempo real: empresa ${empresa.empresa_id}: ${(err as Error).message}`)
        }
    }
    return total
}
