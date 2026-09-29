import type { FastifyReply, FastifyRequest } from 'fastify'
import * as configuracoesModel from '../models/configuracoes.models'
import * as unidadesModel from '../models/unidades.models'
import { previsaoDaRegua } from '../services/calendario.service'
import { LIMITES_PADRAO, type Limites } from '../services/dashboard.service'
import { empresaDoUsuario } from '../services/escopo.service'
import { idParamSchema } from '../types/comum.types'
import { dashboardQuerySchema, listarUnidadesQuerySchema } from '../types/unidades.types'
import { naoEncontrado } from '../utils/errors'

const DIA_MS = 24 * 60 * 60 * 1000

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = listarUnidadesQuerySchema.parse(req.query)
    res.send(await unidadesModel.listarDoUsuario(req.usuario.id, empresaDoUsuario(req.usuario, empresa_id), LIMITES_PADRAO))
}

export async function dashboard(req: FastifyRequest, res: FastifyReply) {
    const { id } = idParamSchema.parse(req.params)
    const q = dashboardQuerySchema.parse(req.query)

    const unidade = await unidadesModel.buscarPermitida(req.usuario.id, id)
    if (!unidade) throw naoEncontrado('Unidade não encontrada.')

    const config = await configuracoesModel.buscar(unidade.empresa_id)
    const limites: Limites = config
        ? { alerta_pos: config.alerta_saldo_positivo_minutos, alerta_neg: config.alerta_saldo_negativo_minutos }
        : LIMITES_PADRAO

    const [fechamento, avisoPorCiclo, proximo] = await Promise.all([
        unidadesModel.ultimoFechamentoPublicado(unidade.id),
        unidadesModel.emSemanaDeFechamentoMes(unidade.empresa_id, unidade.id),
        unidadesModel.proximoGatilho(unidade.empresa_id),
    ])

    const previsto = !proximo && config ? previsaoDaRegua(config, 1)[0] : undefined
    const proximoGatilho = proximo?.gatilho_em ?? previsto?.gatilho_em ?? null
    const avisoPelaRegua =
        previsto?.tipo === 'fechamento_mes' && previsto.gatilho_em.getTime() - Date.now() <= 7 * DIA_MS

    const [linhas, resumo] = fechamento
        ? await Promise.all([
              unidadesModel.linhasDashboard(fechamento.id, limites, q),
              unidadesModel.resumoDashboard(fechamento.id, limites),
          ])
        : [{ linhas: [], total: 0 }, null]

    res.send({
        unidade: { id: unidade.id, nome: unidade.nome },
        fechamento,
        aviso_fechamento_mes: avisoPorCiclo || avisoPelaRegua,
        proximo_fechamento_previsto: proximoGatilho,
        limites,
        resumo,
        colaboradores: linhas.linhas,
        total: linhas.total,
        pagina: q.pagina,
        por_pagina: q.por_pagina,
    })
}
