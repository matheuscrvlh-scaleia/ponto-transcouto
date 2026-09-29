import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import * as fechamentosModel from '../models/admin-fechamentos.models'
import * as auditoria from '../models/auditoria.models'
import { exigirEmpresa } from '../services/escopo.service'
import {
    ajustarGatilhoSchema,
    listarFechamentosQuerySchema,
    publicarSchema,
    reprocessarSchema,
} from '../types/admin-fechamentos.types'
import { empresaQuerySchema, idParamSchema } from '../types/comum.types'
import { conflito, naoEncontrado } from '../utils/errors'

const LIMITE_SECULLUM_POR_HORA = 100
const HORA_MS = 60 * 60 * 1000

async function buscarFechamento(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const fechamento = await fechamentosModel.buscar(id)
    const foraDaEmpresa = req.usuario.perfil !== 'admin' && fechamento?.empresa.id !== req.usuario.empresaId
    if (!fechamento || foraDaEmpresa) throw naoEncontrado('Fechamento não encontrado.')
    return fechamento
}

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const q = listarFechamentosQuerySchema.parse(req.query)
    const empresa_id = req.usuario.perfil === 'admin' ? q.empresa_id : req.usuario.empresaId ?? undefined
    res.send(await fechamentosModel.listar({ ...q, empresa_id }))
}

export async function detalhe(req: FastifyRequest, res: FastifyReply) {
    const fechamento = await buscarFechamento(req)
    const [execucoes, erros] = await Promise.all([
        fechamentosModel.execucoes(fechamento.id),
        fechamentosModel.erros(fechamento.id),
    ])
    res.send({ ...fechamento, execucoes, erros })
}

export async function reprocessar(req: FastifyRequest, res: FastifyReply) {
    const fechamento = await buscarFechamento(req)
    const { motivo } = reprocessarSchema.parse(req.body ?? {})

    if (fechamento.status === 'processando') throw conflito('O fechamento está em processamento.')
    if (fechamento.status === 'sucesso' && (await fechamentosModel.existePublicadoPosterior(fechamento.id))) {
        throw conflito('Há um fechamento mais recente publicado que depende deste; reprocesse a partir dele.')
    }

    const atualizado = await withTransaction(async client => {
        if (!(await fechamentosModel.reabrir(fechamento.id, client))) {
            throw conflito('O fechamento entrou em processamento.')
        }
        await auditoria.registrar(
            {
                usuarioId: req.usuario.id,
                empresaId: fechamento.empresa.id,
                acao: 'fechamento.reprocessado',
                entidade: 'fechamentos',
                entidadeId: fechamento.id,
                dados: { status_anterior: fechamento.status, motivo: motivo ?? null },
                ip: req.ip,
            },
            client,
        )
        return fechamentosModel.buscar(fechamento.id, client)
    })

    res.code(202).send(atualizado)
}

export async function publicar(req: FastifyRequest, res: FastifyReply) {
    const fechamento = await buscarFechamento(req)
    const { motivo } = publicarSchema.parse(req.body)

    if (fechamento.status === 'sucesso') throw conflito('O fechamento já está publicado.')
    if (fechamento.status === 'processando') throw conflito('O fechamento está em processamento.')
    if (fechamento.registros === 0) throw conflito('Não há registros de horas para publicar.')

    const publicado = await withTransaction(async client => {
        if (!(await fechamentosModel.publicar(fechamento.id, client))) {
            throw conflito('O fechamento mudou de situação; atualize a tela.')
        }
        await auditoria.registrar(
            {
                usuarioId: req.usuario.id,
                empresaId: fechamento.empresa.id,
                acao: 'fechamento.publicado_forcado',
                entidade: 'fechamentos',
                entidadeId: fechamento.id,
                dados: {
                    status_anterior: fechamento.status,
                    registros: fechamento.registros,
                    total_colaboradores: fechamento.total_colaboradores,
                    motivo,
                },
                ip: req.ip,
            },
            client,
        )
        return fechamentosModel.buscar(fechamento.id, client)
    })

    res.send(publicado)
}

export async function ajustarGatilho(req: FastifyRequest, res: FastifyReply) {
    const { id } = idParamSchema.parse(req.params)
    const { gatilho_em, motivo } = ajustarGatilhoSchema.parse(req.body)

    const ciclo = await fechamentosModel.buscarCiclo(id)
    if (!ciclo) throw naoEncontrado('Ciclo não encontrado.')

    const atualizado = await withTransaction(async client => {
        if (!(await fechamentosModel.ajustarGatilho(ciclo.id, gatilho_em, req.usuario.id, client))) {
            throw conflito('Este ciclo já tem fechamentos em processamento ou publicados.')
        }
        await auditoria.registrar(
            {
                usuarioId: req.usuario.id,
                empresaId: ciclo.empresa_id,
                acao: 'ciclo.gatilho_ajustado',
                entidade: 'ciclos',
                entidadeId: ciclo.id,
                dados: { antes: ciclo.gatilho_em, depois: gatilho_em, motivo },
                ip: req.ip,
            },
            client,
        )
        return fechamentosModel.buscarCiclo(ciclo.id, client)
    })

    res.send(atualizado)
}

export async function cotaSecullum(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = empresaQuerySchema.parse(req.query)
    const empresaId = exigirEmpresa(req.usuario, empresa_id)

    const [rotas, cota] = await Promise.all([fechamentosModel.usoCota(empresaId), fechamentosModel.limiteCota(empresaId)])
    const calcular = rotas.filter(r => r.rota.toLowerCase().startsWith('calcular'))
    const usadas = calcular.reduce((soma, r) => soma + r.usadas, 0)
    const primeira = calcular
        .map(r => r.primeira)
        .filter((d): d is Date => d != null)
        .sort((a, b) => a.getTime() - b.getTime())[0]
    const limite = cota ?? LIMITE_SECULLUM_POR_HORA

    res.send({
        empresa_id: empresaId,
        usadas_ultima_hora: usadas,
        limite,
        limite_secullum: LIMITE_SECULLUM_POR_HORA,
        disponiveis: Math.max(limite - usadas, 0),
        proxima_liberacao: usadas >= limite && primeira ? new Date(primeira.getTime() + HORA_MS) : null,
        por_rota: rotas.map(({ rota, usadas }) => ({ rota, usadas })),
    })
}
