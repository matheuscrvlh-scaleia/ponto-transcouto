import { db, withTransaction, type Executor } from '../db/database'
import { buscarMapeamento, travarEmpresa } from '../models/extracao.models'
import {
    aoVivoDaEmpresa,
    atualizarTetoAplicado,
    concluirPedido,
    diasDaEmpresa,
    gravarAoVivo,
    gravarDias,
    gravarHorasDia,
    gravarRegistros,
    horasDiaDaEmpresa,
    pedidosPendentes,
    regraDaEmpresa,
    registrosDaEmpresa,
    type PedidoRecalculo,
} from '../models/recalculo.models'
import { recalcularHistorico, recalcularHorasDia, regraDaConfiguracao } from '../services/recalculo.service'
import type { Log } from './log'

/*
 * Recálculo do histórico de saldos: quando a regra de horas pagas ou o mapeamento de colunas
 * muda, a empresa é marcada (recalculos_saldo) e o worker refaz todos os registros com a regra
 * atual. Roda no laço do worker, entre uma extração e outra, para nunca cruzar com uma coleta.
 */

const MAXIMO_FALHAS_NO_LOG = 10

/** Recalcula o histórico da empresa numa transação só; com `pedido`, tira o pedido junto. */
export async function recalcularEmpresa(empresaId: number, pedido: PedidoRecalculo | null, ex: Executor = db) {
    return withTransaction(async client => {
        await travarEmpresa(empresaId, client)
        const config = await regraDaEmpresa(empresaId, client)
        if (!config) throw new Error('Configuração da empresa não encontrada.')
        const regra = regraDaConfiguracao(config)

        const mapeamento = await buscarMapeamento(empresaId, client)
        const registros = await registrosDaEmpresa(empresaId, client)
        const aoVivo = await aoVivoDaEmpresa(empresaId, client)
        const dias = await diasDaEmpresa(empresaId, client)
        const resultado = recalcularHistorico({ registros, aoVivo, dias, mapeamento, regra })
        // extras e negativas de cada dia (tela do colaborador e painel por intervalo) também seguem o mapeamento atual
        const horasDia = recalcularHorasDia(await horasDiaDaEmpresa(empresaId, client), mapeamento)

        const alterados = {
            registros: await gravarRegistros(resultado.registros, client),
            aoVivo: await gravarAoVivo(resultado.aoVivo, client),
            dias: await gravarDias(resultado.dias, client),
            horasDia: await gravarHorasDia(horasDia.dias, client),
        }
        await atualizarTetoAplicado(empresaId, regra, client)
        if (pedido) await concluirPedido(pedido, client)
        return { total: registros.length, alterados, falhas: [...resultado.falhas, ...horasDia.falhas] }
    }, ex)
}

export async function executarRecalculos(log: Log, ex: Executor = db) {
    for (const pedido of await pedidosPendentes(ex)) {
        const empresa = pedido.empresa_id
        try {
            const { total, alterados, falhas } = await recalcularEmpresa(empresa, pedido, ex)
            log.info(
                `recálculo de saldos: empresa ${empresa}: ${alterados.registros} de ${total} registros alterados` +
                    `, ${alterados.aoVivo} ao vivo, ${alterados.dias} dias do histórico diário, ${alterados.horasDia} dias de horas por dia`,
            )
            // registro sem cálculo pela regra atual fica como estava; o pedido sai mesmo assim para não repetir sem fim
            for (const falha of falhas.slice(0, MAXIMO_FALHAS_NO_LOG)) {
                log.erro(`recálculo de saldos: empresa ${empresa}, colaborador ${falha.colaborador_id} em ${falha.referencia}: ${falha.mensagem}`)
            }
            if (falhas.length > MAXIMO_FALHAS_NO_LOG) log.erro(`recálculo de saldos: empresa ${empresa}: mais ${falhas.length - MAXIMO_FALHAS_NO_LOG} falhas`)
        } catch (err) {
            // o pedido continua: tenta de novo na próxima rodada
            log.erro(`recálculo de saldos: empresa ${empresa}: ${(err as Error).message}`)
        }
    }
}
