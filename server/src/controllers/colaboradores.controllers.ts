import type { FastifyReply, FastifyRequest } from 'fastify'
import * as colaboradoresModel from '../models/colaboradores.models'
import * as configuracoesModel from '../models/configuracoes.models'
import { foraDaCurva, LIMITES_PADRAO } from '../services/dashboard.service'
import { historicoQuerySchema } from '../types/colaboradores.types'
import { idParamSchema } from '../types/comum.types'
import { naoEncontrado } from '../utils/errors'

async function buscarColaborador(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const colaborador = await colaboradoresModel.buscarPermitido(req.usuario.id, id)
    if (!colaborador) throw naoEncontrado('Colaborador não encontrado.')
    return colaborador
}

export async function detalhe(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id, ...colaborador } = await buscarColaborador(req)

    const [atual, limitesEmpresa] = await Promise.all([
        colaboradoresModel.registroAtual(req.usuario.id, colaborador.id),
        configuracoesModel.limitesDaEmpresa(empresa_id),
    ])
    const limites = limitesEmpresa ?? LIMITES_PADRAO

    const curva = atual ? foraDaCurva(atual.saldo_min, limites) : null
    res.send({
        ...colaborador,
        resumo: atual ? { ...atual, fora_da_curva: curva } : null,
        fora_da_curva: curva,
        limites,
    })
}

export async function historico(req: FastifyRequest, res: FastifyReply) {
    const { limite } = historicoQuerySchema.parse(req.query)
    const colaborador = await buscarColaborador(req)
    res.send(await colaboradoresModel.historico(req.usuario.id, colaborador.id, limite))
}
