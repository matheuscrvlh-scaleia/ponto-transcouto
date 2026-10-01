import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import * as auditoria from '../models/auditoria.models'
import { loginEmUso } from '../models/auth.models'
import * as clientesModel from '../models/clientes.models'
import { empresaDoUsuario } from '../services/escopo.service'
import type { UsuarioAutenticado } from '../types/auth.types'
import {
    atualizarClienteSchema,
    criarClienteSchema,
    listarClientesQuerySchema,
    unidadesClienteSchema,
    type ClienteGerenciado,
    type DadosCliente,
} from '../types/clientes.types'
import { idParamSchema } from '../types/comum.types'
import { cpfNormalizado, mascararCpf } from '../utils/cpf'
import { conflito, invalido, naoEncontrado } from '../utils/errors'
import { gerarSenhaTemporaria, hashPassword } from '../utils/hash'

/* Usuários dos clientes (tabela clientes): a equipe gerencia os de qualquer
   empresa; o RH, só os da própria empresa. */

function paraResposta({ cpf, ...cliente }: ClienteGerenciado) {
    return { ...cliente, cpf_mascarado: mascararCpf(cpf) }
}

export function cpfInformado(cpf: string | null | undefined) {
    if (!cpf) return null
    const normalizado = cpfNormalizado(cpf)
    if (!normalizado) throw invalido('CPF inválido.')
    return normalizado
}

function podeGerenciar(ator: UsuarioAutenticado, alvo: ClienteGerenciado) {
    if (ator.tipo === 'equipe') return true
    return ator.perfil === 'rh' && alvo.empresa_id === ator.empresaId
}

/** O próprio cliente logado (ids de equipe e clientes podem coincidir, então compara o tipo também). */
function ehOProprio(ator: UsuarioAutenticado, alvo: ClienteGerenciado) {
    return ator.tipo === 'cliente' && ator.id === alvo.id
}

async function buscarGerenciavel(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const alvo = await clientesModel.buscarPorId(id)
    if (!alvo || !podeGerenciar(req.usuario, alvo)) throw naoEncontrado('Usuário não encontrado.')
    return alvo
}

async function validarDados(dados: DadosCliente, ignorarId: number | null) {
    if (!dados.email && !dados.cpf) throw invalido('Informe e-mail ou CPF.')
    if (!(await clientesModel.empresaExiste(dados.empresa_id))) throw invalido('Empresa não encontrada.')
    if (await loginEmUso(dados.email, dados.cpf, ignorarId == null ? null : { tipo: 'cliente', id: ignorarId })) {
        throw conflito('Já existe um usuário com este e-mail ou CPF.')
    }
}

async function validarUnidades(empresaId: number, unidadeIds: number[]) {
    const unicas = [...new Set(unidadeIds)]
    if (unicas.length === 0) return unicas
    const validas = await clientesModel.unidadesDaEmpresa(empresaId, unicas)
    if (validas.length !== unicas.length) throw invalido('Há unidades que não pertencem à empresa do usuário.')
    return unicas
}

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const q = listarClientesQuerySchema.parse(req.query)
    const resultado = await clientesModel.listar(q, empresaDoUsuario(req.usuario, q.empresa_id))
    res.send({ ...resultado, itens: resultado.itens.map(paraResposta), pagina: q.pagina, por_pagina: q.por_pagina })
}

export async function criar(req: FastifyRequest, res: FastifyReply) {
    const body = criarClienteSchema.parse(req.body)
    const ator = req.usuario

    if (body.perfil !== 'gestor' && body.unidade_ids.length) {
        throw invalido('Somente gestores têm unidades vinculadas.')
    }

    const empresaId = ator.tipo === 'equipe' ? body.empresa_id : ator.empresaId
    if (empresaId == null) throw invalido('Informe empresa_id.')

    const dados: DadosCliente = {
        nome: body.nome,
        email: body.email ?? null,
        cpf: cpfInformado(body.cpf),
        perfil: body.perfil,
        empresa_id: empresaId,
        ativo: true,
    }
    await validarDados(dados, null)
    const unidadeIds = await validarUnidades(empresaId, body.unidade_ids)

    const senhaTemporaria = gerarSenhaTemporaria()
    const senhaHash = await hashPassword(senhaTemporaria)

    const id = await withTransaction(async client => {
        const novoId = await clientesModel.criar(dados, senhaHash, client)
        await clientesModel.vincularUnidades(novoId, empresaId, unidadeIds, ator, client)
        await auditoria.registrar(
            {
                ator,
                empresaId,
                acao: 'cliente.criado',
                entidade: 'clientes',
                entidadeId: novoId,
                dados: { nome: dados.nome, email: dados.email, perfil: dados.perfil, unidade_ids: unidadeIds },
                ip: req.ip,
            },
            client,
        )
        return novoId
    })

    const cliente = await clientesModel.buscarPorId(id)
    res.code(201).send({ id, senha_temporaria: senhaTemporaria, usuario: cliente && paraResposta(cliente) })
}

export async function atualizar(req: FastifyRequest, res: FastifyReply) {
    const alvo = await buscarGerenciavel(req)
    const body = atualizarClienteSchema.parse(req.body)
    const ator = req.usuario

    if (Object.keys(body).length === 0) throw invalido('Nenhum campo para atualizar.')
    if (ehOProprio(ator, alvo) && (body.ativo === false || (body.perfil && body.perfil !== alvo.perfil))) {
        throw invalido('Você não pode desativar nem alterar o perfil do próprio usuário.')
    }
    if (body.empresa_id !== undefined && body.empresa_id !== alvo.empresa_id && ator.tipo !== 'equipe') {
        throw invalido('Somente a equipe pode mudar o usuário de empresa.')
    }

    const dados: DadosCliente = {
        nome: body.nome ?? alvo.nome,
        email: body.email !== undefined ? body.email : alvo.email,
        cpf: body.cpf !== undefined ? cpfInformado(body.cpf) : alvo.cpf,
        perfil: body.perfil ?? alvo.perfil,
        empresa_id: body.empresa_id ?? alvo.empresa_id,
        ativo: body.ativo ?? alvo.ativo,
    }
    await validarDados(dados, alvo.id)

    const perdeUnidades = dados.perfil !== 'gestor' || dados.empresa_id !== alvo.empresa_id

    await withTransaction(async client => {
        if (perdeUnidades) await clientesModel.removerUnidades(alvo.id, client)
        await clientesModel.atualizar(alvo.id, dados, client)
        await auditoria.registrar(
            {
                ator,
                empresaId: dados.empresa_id,
                acao: 'cliente.alterado',
                entidade: 'clientes',
                entidadeId: alvo.id,
                dados: { alteracoes: body.cpf ? { ...body, cpf: mascararCpf(dados.cpf) } : body },
                ip: req.ip,
            },
            client,
        )
    })

    const atualizado = await clientesModel.buscarPorId(alvo.id)
    res.send(atualizado && paraResposta(atualizado))
}

export async function definirUnidades(req: FastifyRequest, res: FastifyReply) {
    const alvo = await buscarGerenciavel(req)
    const { unidade_ids } = unidadesClienteSchema.parse(req.body)

    if (alvo.perfil !== 'gestor') throw invalido('Somente gestores têm unidades vinculadas.')
    const unidadeIds = await validarUnidades(alvo.empresa_id, unidade_ids)

    await withTransaction(async client => {
        await clientesModel.removerUnidades(alvo.id, client)
        await clientesModel.vincularUnidades(alvo.id, alvo.empresa_id, unidadeIds, req.usuario, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: alvo.empresa_id,
                acao: 'cliente.unidades_alteradas',
                entidade: 'clientes',
                entidadeId: alvo.id,
                dados: { antes: alvo.unidades.map(u => u.id), depois: unidadeIds },
                ip: req.ip,
            },
            client,
        )
    })

    res.send({ unidade_ids: unidadeIds })
}

export async function redefinirSenha(req: FastifyRequest, res: FastifyReply) {
    const alvo = await buscarGerenciavel(req)
    const senhaTemporaria = gerarSenhaTemporaria()
    const senhaHash = await hashPassword(senhaTemporaria)

    await withTransaction(async client => {
        await clientesModel.redefinirSenha(alvo.id, senhaHash, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: alvo.empresa_id,
                acao: 'cliente.senha_redefinida',
                entidade: 'clientes',
                entidadeId: alvo.id,
                ip: req.ip,
            },
            client,
        )
    })

    res.send({ senha_temporaria: senhaTemporaria })
}
