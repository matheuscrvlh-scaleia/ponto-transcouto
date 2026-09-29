import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import * as unidadesAdminModel from '../models/admin-unidades.models'
import * as auditoria from '../models/auditoria.models'
import { empresaDoUsuario } from '../services/escopo.service'
import {
    atualizarUnidadeSchema,
    listarUnidadesAdminQuerySchema,
    solicitarSincronizacaoSchema,
} from '../types/admin-unidades.types'
import { idParamSchema } from '../types/comum.types'
import { conflito, invalido, naoEncontrado } from '../utils/errors'

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const q = listarUnidadesAdminQuerySchema.parse(req.query)
    res.send(await unidadesAdminModel.listar(q, empresaDoUsuario(req.usuario, q.empresa_id)))
}

export async function atualizar(req: FastifyRequest, res: FastifyReply) {
    const { id } = idParamSchema.parse(req.params)
    const body = atualizarUnidadeSchema.parse(req.body)
    if (Object.keys(body).length === 0) throw invalido('Nenhum campo para atualizar.')

    const unidade = await unidadesAdminModel.buscar(id)
    const empresaPermitida = empresaDoUsuario(req.usuario)
    if (!unidade || (empresaPermitida != null && unidade.empresa_id !== empresaPermitida)) {
        throw naoEncontrado('Unidade não encontrada.')
    }

    const nome = body.nome_exibicao !== undefined ? body.nome_exibicao : unidade.nome_exibicao
    const ativo = body.ativo ?? unidade.ativo
    if (nome && (await unidadesAdminModel.nomeEmUso(unidade.empresa_id, nome, unidade.id))) {
        throw conflito(`Já existe uma unidade chamada ${nome}.`)
    }

    const atualizada = await withTransaction(async client => {
        await unidadesAdminModel.atualizar(unidade.id, nome, ativo, client)
        await auditoria.registrar(
            {
                usuarioId: req.usuario.id,
                empresaId: unidade.empresa_id,
                acao: 'unidade.de_para',
                entidade: 'unidades',
                entidadeId: unidade.id,
                dados: {
                    antes: { nome_exibicao: unidade.nome_exibicao, ativo: unidade.ativo },
                    depois: { nome_exibicao: nome, ativo },
                },
                ip: req.ip,
            },
            client,
        )
        return unidadesAdminModel.buscar(unidade.id, client)
    })

    res.send(atualizada)
}

export async function solicitarSincronizacao(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = solicitarSincronizacaoSchema.parse(req.body ?? {})
    const empresas = await withTransaction(async client => {
        const solicitadas = await unidadesAdminModel.solicitarSincronizacao(empresaDoUsuario(req.usuario, empresa_id), client)
        if (solicitadas.length === 0) throw naoEncontrado('Nenhuma empresa ativa para sincronizar.')
        for (const empresa of solicitadas) {
            await auditoria.registrar(
                {
                    usuarioId: req.usuario.id,
                    empresaId: empresa.id,
                    acao: 'sincronizacao.solicitada',
                    entidade: 'empresas',
                    entidadeId: empresa.id,
                    ip: req.ip,
                },
                client,
            )
        }
        return solicitadas
    })

    res.code(202).send({ empresas })
}
