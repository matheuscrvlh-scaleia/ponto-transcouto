import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import * as auditoria from '../models/auditoria.models'
import { loginEmUso } from '../models/auth.models'
import * as equipeModel from '../models/equipe.models'
import { idParamSchema } from '../types/comum.types'
import {
    atualizarMembroSchema,
    criarMembroSchema,
    listarEquipeQuerySchema,
    type DadosMembro,
    type MembroEquipe,
} from '../types/equipe.types'
import { mascararCpf } from '../utils/cpf'
import { conflito, invalido, naoEncontrado } from '../utils/errors'
import { gerarSenhaTemporaria, hashPassword } from '../utils/hash'
import { cpfInformado } from './clientes.controllers'

/* Equipe Scale IA (tabela usuarios): só a própria equipe gerencia. */

function paraResposta({ cpf, ...membro }: MembroEquipe) {
    return { ...membro, cpf_mascarado: mascararCpf(cpf) }
}

async function buscarMembro(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const membro = await equipeModel.buscarPorId(id)
    if (!membro) throw naoEncontrado('Membro da equipe não encontrado.')
    return membro
}

async function validarDados(dados: DadosMembro, ignorarId: number | null) {
    if (!dados.email && !dados.cpf) throw invalido('Informe e-mail ou CPF.')
    if (await loginEmUso(dados.email, dados.cpf, ignorarId == null ? null : { tipo: 'equipe', id: ignorarId })) {
        throw conflito('Já existe um usuário com este e-mail ou CPF.')
    }
}

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const q = listarEquipeQuerySchema.parse(req.query)
    const resultado = await equipeModel.listar(q)
    res.send({ ...resultado, itens: resultado.itens.map(paraResposta), pagina: q.pagina, por_pagina: q.por_pagina })
}

export async function criar(req: FastifyRequest, res: FastifyReply) {
    const body = criarMembroSchema.parse(req.body)
    const dados: DadosMembro = {
        nome: body.nome,
        email: body.email ?? null,
        cpf: cpfInformado(body.cpf),
        ativo: true,
    }
    await validarDados(dados, null)

    const senhaTemporaria = gerarSenhaTemporaria()
    const senhaHash = await hashPassword(senhaTemporaria)

    const id = await withTransaction(async client => {
        const novoId = await equipeModel.criar(dados, senhaHash, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: null,
                acao: 'equipe.criado',
                entidade: 'usuarios',
                entidadeId: novoId,
                dados: { nome: dados.nome, email: dados.email },
                ip: req.ip,
            },
            client,
        )
        return novoId
    })

    const membro = await equipeModel.buscarPorId(id)
    res.code(201).send({ id, senha_temporaria: senhaTemporaria, usuario: membro && paraResposta(membro) })
}

export async function atualizar(req: FastifyRequest, res: FastifyReply) {
    const alvo = await buscarMembro(req)
    const body = atualizarMembroSchema.parse(req.body)

    if (Object.keys(body).length === 0) throw invalido('Nenhum campo para atualizar.')
    if (alvo.id === req.usuario.id && body.ativo === false) throw invalido('Você não pode desativar o próprio usuário.')

    const dados: DadosMembro = {
        nome: body.nome ?? alvo.nome,
        email: body.email !== undefined ? body.email : alvo.email,
        cpf: body.cpf !== undefined ? cpfInformado(body.cpf) : alvo.cpf,
        ativo: body.ativo ?? alvo.ativo,
    }
    await validarDados(dados, alvo.id)

    await withTransaction(async client => {
        await equipeModel.atualizar(alvo.id, dados, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: null,
                acao: 'equipe.alterado',
                entidade: 'usuarios',
                entidadeId: alvo.id,
                dados: { alteracoes: body.cpf ? { ...body, cpf: mascararCpf(dados.cpf) } : body },
                ip: req.ip,
            },
            client,
        )
    })

    const atualizado = await equipeModel.buscarPorId(alvo.id)
    res.send(atualizado && paraResposta(atualizado))
}

export async function redefinirSenha(req: FastifyRequest, res: FastifyReply) {
    const alvo = await buscarMembro(req)
    const senhaTemporaria = gerarSenhaTemporaria()
    const senhaHash = await hashPassword(senhaTemporaria)

    await withTransaction(async client => {
        await equipeModel.redefinirSenha(alvo.id, senhaHash, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: null,
                acao: 'equipe.senha_redefinida',
                entidade: 'usuarios',
                entidadeId: alvo.id,
                ip: req.ip,
            },
            client,
        )
    })

    res.send({ senha_temporaria: senhaTemporaria })
}
