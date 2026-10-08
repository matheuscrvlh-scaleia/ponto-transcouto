import type { FastifyReply, FastifyRequest } from 'fastify'
import * as colaboradoresModel from '../models/colaboradores.models'
import * as configuracoesModel from '../models/configuracoes.models'
import * as horasDiaModel from '../models/horas-dia.models'
import { foraDaCurva, LIMITES_PADRAO } from '../services/dashboard.service'
import { historicoDiarioQuerySchema, historicoQuerySchema } from '../types/colaboradores.types'
import { idParamSchema } from '../types/comum.types'
import { diasColaboradorQuerySchema } from '../types/horas-dia.types'
import { naoEncontrado } from '../utils/errors'

async function buscarColaborador(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const colaborador = await colaboradoresModel.buscarPermitido(req.usuario, id)
    if (!colaborador) throw naoEncontrado('Colaborador não encontrado.')
    return colaborador
}

export async function detalhe(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id, ...colaborador } = await buscarColaborador(req)

    const [fotografia, aoVivo, limitesEmpresa, config] = await Promise.all([
        colaboradoresModel.registroAtual(req.usuario, colaborador.id),
        colaboradoresModel.registroTempoReal(req.usuario, colaborador.id),
        configuracoesModel.limitesDaEmpresa(empresa_id),
        configuracoesModel.buscar(empresa_id),
    ])
    const limites = limitesEmpresa ?? LIMITES_PADRAO

    // o mais recente entre o valor ao vivo e o último fechamento publicado (ao vivo ganha no empate)
    const usarAoVivo = aoVivo && (!fotografia || aoVivo.data_referencia >= fotografia.data_referencia)
    const atual = usarAoVivo
        ? { ...aoVivo, fonte: 'tempo_real' as const }
        : fotografia && { ...fotografia, fonte: 'fechamento' as const, atualizado_em: null }

    const curva = atual ? foraDaCurva(atual.saldo_min, limites) : null
    res.send({
        ...colaborador,
        modo_extracao: config?.modo_extracao ?? 'semanal',
        resumo: atual ? { ...atual, fora_da_curva: curva } : null,
        fora_da_curva: curva,
        limites,
    })
}

export async function historico(req: FastifyRequest, res: FastifyReply) {
    const { limite } = historicoQuerySchema.parse(req.query)
    const colaborador = await buscarColaborador(req)
    res.send(await colaboradoresModel.historico(req.usuario, colaborador.id, limite))
}

export async function historicoDiario(req: FastifyRequest, res: FastifyReply) {
    const { dias } = historicoDiarioQuerySchema.parse(req.query)
    const colaborador = await buscarColaborador(req)
    res.send(await colaboradoresModel.historicoDiario(req.usuario, colaborador.id, dias))
}

/** Horas de cada dia no intervalo (extras, negativas, marcações) e os limites diários da empresa. */
export async function dias(req: FastifyRequest, res: FastifyReply) {
    const { de, ate } = diasColaboradorQuerySchema.parse(req.query)
    const colaborador = await buscarColaborador(req)
    const [config, lista] = await Promise.all([
        configuracoesModel.buscar(colaborador.empresa_id),
        horasDiaModel.diasDoColaborador(colaborador.id, de, ate),
    ])
    res.send({
        de,
        ate,
        limites: { extra_dia: config?.alerta_extra_dia_minutos ?? 0, negativa_dia: config?.alerta_negativa_dia_minutos ?? 0 },
        dias: lista,
    })
}

/**
 * Dia a dia para a tela de detalhe: as horas de cada dia (como em /dias) mais as batidas do log, com os limites
 * diários da empresa. Dias fora da janela da coleta (ou do log de batidas) simplesmente não vêm na lista.
 */
export async function diasDetalhe(req: FastifyRequest, res: FastifyReply) {
    const { de, ate } = diasColaboradorQuerySchema.parse(req.query)
    const colaborador = await buscarColaborador(req)
    const [config, lista] = await Promise.all([
        configuracoesModel.buscar(colaborador.empresa_id),
        horasDiaModel.diasDetalhados(req.usuario, colaborador.id, colaborador.empresa_id, de, ate),
    ])
    res.send({
        de,
        ate,
        limites: { extra_dia: config?.alerta_extra_dia_minutos ?? 0, negativa_dia: config?.alerta_negativa_dia_minutos ?? 0 },
        dias: lista,
    })
}
