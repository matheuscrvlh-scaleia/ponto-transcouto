import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import * as auditoria from '../models/auditoria.models'
import * as usuariosModel from '../models/usuarios.models'
import { empresaDoUsuario } from '../services/escopo.service'
import type { UsuarioAutenticado } from '../types/auth.types'
import { idParamSchema } from '../types/comum.types'
import {
    atualizarUsuarioSchema,
    criarUsuarioSchema,
    listarUsuariosQuerySchema,
    unidadesUsuarioSchema,
    type DadosUsuario,
    type UsuarioGerenciado,
} from '../types/usuarios.types'
import { cpfNormalizado, mascararCpf } from '../utils/cpf'
import { conflito, invalido, naoEncontrado, proibido } from '../utils/errors'
import { gerarSenhaTemporaria, hashPassword } from '../utils/hash'

function paraResposta({ cpf, ...usuario }: UsuarioGerenciado) {
    return { ...usuario, cpf_mascarado: mascararCpf(cpf) }
}

function cpfInformado(cpf: string | null | undefined) {
    if (!cpf) return null
    const normalizado = cpfNormalizado(cpf)
    if (!normalizado) throw invalido('CPF inválido.')
    return normalizado
}

function podeGerenciar(ator: UsuarioAutenticado, alvo: UsuarioGerenciado) {
    if (ator.perfil === 'admin') return true
    return ator.perfil === 'rh' && alvo.perfil !== 'admin' && alvo.empresa_id === ator.empresaId
}

async function buscarGerenciavel(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const alvo = await usuariosModel.buscarPorId(id)
    if (!alvo || !podeGerenciar(req.usuario, alvo)) throw naoEncontrado('Usuário não encontrado.')
    return alvo
}

async function validarDados(dados: DadosUsuario, ignorarId: number | null) {
    if (!dados.email && !dados.cpf) throw invalido('Informe e-mail ou CPF.')
    if (dados.perfil !== 'admin' && dados.empresa_id == null) throw invalido('Informe empresa_id.')
    if (dados.empresa_id != null && !(await usuariosModel.empresaExiste(dados.empresa_id))) {
        throw invalido('Empresa não encontrada.')
    }
    if (await usuariosModel.loginEmUso(dados.email, dados.cpf, ignorarId)) {
        throw conflito('Já existe um usuário com este e-mail ou CPF.')
    }
}

async function validarUnidades(empresaId: number | null, unidadeIds: number[]) {
    const unicas = [...new Set(unidadeIds)]
    if (unicas.length === 0) return unicas
    if (empresaId == null) throw invalido('Somente gestores têm unidades vinculadas.')
    const validas = await usuariosModel.unidadesDaEmpresa(empresaId, unicas)
    if (validas.length !== unicas.length) throw invalido('Há unidades que não pertencem à empresa do usuário.')
    return unicas
}

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const q = listarUsuariosQuerySchema.parse(req.query)
    const resultado = await usuariosModel.listar(q, empresaDoUsuario(req.usuario, q.empresa_id))
    res.send({ ...resultado, itens: resultado.itens.map(paraResposta), pagina: q.pagina, por_pagina: q.por_pagina })
}

export async function criar(req: FastifyRequest, res: FastifyReply) {
    const body = criarUsuarioSchema.parse(req.body)
    const ator = req.usuario

    if (ator.perfil === 'rh' && body.perfil === 'admin') throw proibido('O RH não pode criar administradores.')
    if (body.perfil !== 'gestor' && body.unidade_ids.length) {
        throw invalido('Somente gestores têm unidades vinculadas.')
    }

    const dados: DadosUsuario = {
        nome: body.nome,
        email: body.email ?? null,
        cpf: cpfInformado(body.cpf),
        perfil: body.perfil,
        empresa_id: body.perfil === 'admin' ? null : ator.perfil === 'rh' ? ator.empresaId : (body.empresa_id ?? null),
        ativo: true,
    }
    await validarDados(dados, null)
    const unidadeIds = await validarUnidades(dados.empresa_id, body.unidade_ids)

    const senhaTemporaria = gerarSenhaTemporaria()
    const senhaHash = await hashPassword(senhaTemporaria)

    const id = await withTransaction(async client => {
        const novoId = await usuariosModel.criar(dados, senhaHash, client)
        if (dados.empresa_id != null) {
            await usuariosModel.vincularUnidades(novoId, dados.empresa_id, unidadeIds, ator.id, client)
        }
        await auditoria.registrar(
            {
                usuarioId: ator.id,
                empresaId: dados.empresa_id,
                acao: 'usuario.criado',
                entidade: 'usuarios',
                entidadeId: novoId,
                dados: { nome: dados.nome, email: dados.email, perfil: dados.perfil, unidade_ids: unidadeIds },
                ip: req.ip,
            },
            client,
        )
        return novoId
    })

    const usuario = await usuariosModel.buscarPorId(id)
    res.code(201).send({ id, senha_temporaria: senhaTemporaria, usuario: usuario && paraResposta(usuario) })
}

export async function atualizar(req: FastifyRequest, res: FastifyReply) {
    const alvo = await buscarGerenciavel(req)
    const body = atualizarUsuarioSchema.parse(req.body)
    const ator = req.usuario

    if (Object.keys(body).length === 0) throw invalido('Nenhum campo para atualizar.')
    if (ator.perfil === 'rh' && body.perfil === 'admin') throw proibido('O RH não pode criar administradores.')
    if (alvo.id === ator.id && (body.ativo === false || (body.perfil && body.perfil !== alvo.perfil))) {
        throw invalido('Você não pode desativar nem alterar o perfil do próprio usuário.')
    }

    const perfil = body.perfil ?? alvo.perfil
    const empresaInformada = body.empresa_id !== undefined ? body.empresa_id : alvo.empresa_id
    const dados: DadosUsuario = {
        nome: body.nome ?? alvo.nome,
        email: body.email !== undefined ? body.email : alvo.email,
        cpf: body.cpf !== undefined ? cpfInformado(body.cpf) : alvo.cpf,
        perfil,
        empresa_id: perfil === 'admin' ? null : ator.perfil === 'rh' ? ator.empresaId : empresaInformada,
        ativo: body.ativo ?? alvo.ativo,
    }
    await validarDados(dados, alvo.id)

    const perdeUnidades = dados.perfil !== 'gestor' || dados.empresa_id !== alvo.empresa_id

    await withTransaction(async client => {
        if (perdeUnidades) await usuariosModel.removerUnidades(alvo.id, client)
        await usuariosModel.atualizar(alvo.id, dados, client)
        await auditoria.registrar(
            {
                usuarioId: ator.id,
                empresaId: dados.empresa_id ?? alvo.empresa_id,
                acao: 'usuario.alterado',
                entidade: 'usuarios',
                entidadeId: alvo.id,
                dados: { alteracoes: body.cpf ? { ...body, cpf: mascararCpf(dados.cpf) } : body },
                ip: req.ip,
            },
            client,
        )
    })

    const atualizado = await usuariosModel.buscarPorId(alvo.id)
    res.send(atualizado && paraResposta(atualizado))
}

export async function definirUnidades(req: FastifyRequest, res: FastifyReply) {
    const alvo = await buscarGerenciavel(req)
    const { unidade_ids } = unidadesUsuarioSchema.parse(req.body)

    if (alvo.perfil !== 'gestor' || alvo.empresa_id == null) {
        throw invalido('Somente gestores têm unidades vinculadas.')
    }
    const empresaId = alvo.empresa_id
    const unidadeIds = await validarUnidades(empresaId, unidade_ids)

    await withTransaction(async client => {
        await usuariosModel.removerUnidades(alvo.id, client)
        await usuariosModel.vincularUnidades(alvo.id, empresaId, unidadeIds, req.usuario.id, client)
        await auditoria.registrar(
            {
                usuarioId: req.usuario.id,
                empresaId,
                acao: 'usuario.unidades_alteradas',
                entidade: 'usuarios',
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
        await usuariosModel.redefinirSenha(alvo.id, senhaHash, client)
        await auditoria.registrar(
            {
                usuarioId: req.usuario.id,
                empresaId: alvo.empresa_id,
                acao: 'usuario.senha_redefinida',
                entidade: 'usuarios',
                entidadeId: alvo.id,
                ip: req.ip,
            },
            client,
        )
    })

    res.send({ senha_temporaria: senhaTemporaria })
}
