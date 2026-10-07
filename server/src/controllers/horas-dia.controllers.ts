import type { FastifyReply, FastifyRequest } from 'fastify'
import * as horasDiaModel from '../models/horas-dia.models'
import * as unidadesModel from '../models/unidades.models'
import { LIMITES_PADRAO } from '../services/dashboard.service'
import { empresaDoUsuario } from '../services/escopo.service'
import { horasDiaQuerySchema } from '../types/horas-dia.types'
import { naoEncontrado } from '../utils/errors'

/** Extras e negativas somadas por colaborador num intervalo de datas (uma unidade ou todas as do usuário). */
export async function totais(req: FastifyRequest, res: FastifyReply) {
    const { de, ate, unidade_id, empresa_id } = horasDiaQuerySchema.parse(req.query)

    let unidadeIds: number[]
    if (unidade_id) {
        const unidade = await unidadesModel.buscarPermitida(req.usuario, unidade_id)
        if (!unidade) throw naoEncontrado('Unidade não encontrada.')
        unidadeIds = [unidade.id]
    } else {
        const unidades = await unidadesModel.unidadesDoPainel(req.usuario, empresaDoUsuario(req.usuario, empresa_id), LIMITES_PADRAO)
        unidadeIds = unidades.map(u => u.id)
    }

    const [colaboradores, dadosAte] = await Promise.all([
        horasDiaModel.totaisNoIntervalo(unidadeIds, de, ate),
        horasDiaModel.ultimoDiaComDados(unidadeIds, ate),
    ])
    res.send({ de, ate, dados_ate: dadosAte, colaboradores })
}
