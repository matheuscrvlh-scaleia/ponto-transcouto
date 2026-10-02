import type { FastifyReply, FastifyRequest } from 'fastify'
import * as batidasModel from '../models/batidas.models'
import { empresaDoUsuario } from '../services/escopo.service'
import { listarBatidasQuerySchema } from '../types/batidas.types'

/** Log de batidas das unidades que o usuário pode ver, da mais recente para a mais antiga. */
export async function listar(req: FastifyRequest, res: FastifyReply) {
    const q = listarBatidasQuerySchema.parse(req.query)
    const empresaId = empresaDoUsuario(req.usuario, q.empresa_id)

    const [{ itens, total }, importadoEm] = await Promise.all([
        batidasModel.listar(req.usuario, empresaId, q),
        batidasModel.ultimaImportacao(req.usuario, empresaId),
    ])

    res.send({ itens, total, pagina: q.pagina, por_pagina: q.por_pagina, importado_em: importadoEm })
}
