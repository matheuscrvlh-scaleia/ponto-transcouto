import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import * as auditoria from '../models/auditoria.models'
import * as permissoesModel from '../models/permissoes.models'
import { exigirEmpresa } from '../services/escopo.service'
import { cabeNoAtor, podeGerenciarGrupo } from '../services/permissoes.service'
import type { UsuarioAutenticado } from '../types/auth.types'
import { idParamSchema } from '../types/comum.types'
import {
    atualizarGrupoSchema,
    criarGrupoSchema,
    listarGruposQuerySchema,
    type Alcance,
    type GrupoPermissao,
    type Tela,
} from '../types/permissoes.types'
import { conflito, invalido, naoEncontrado, proibido } from '../utils/errors'

/* Grupos de permissão (Configuração → Permissões). A equipe gerencia os de qualquer
   empresa; um cliente com a tela Permissões, só os da própria empresa e sem passar
   do que ele mesmo tem: só libera telas que ele vê e só dá alcance "empresa toda"
   se ele também tiver. O próprio grupo ele não edita (não se tranca para fora). */

function exigirCabeNoAtor(ator: UsuarioAutenticado, telas: Tela[], alcance: Alcance) {
    if (!cabeNoAtor(ator, telas, alcance)) {
        throw proibido('Você só pode liberar telas e alcance que o seu próprio grupo tem.')
    }
}

/** Grupo que o ator pode alterar ou excluir. */
async function buscarGerenciavel(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const grupo = await permissoesModel.buscar(id)
    const ator = req.usuario
    if (!grupo || (ator.tipo !== 'equipe' && grupo.empresa_id !== ator.empresaId)) {
        throw naoEncontrado('Grupo não encontrado.')
    }
    if (ator.tipo !== 'equipe' && ator.grupoId === grupo.id) {
        throw proibido('Você não pode alterar o grupo ao qual pertence. Peça a outra pessoa com acesso a Permissões.')
    }
    exigirCabeNoAtor(ator, grupo.telas, grupo.alcance)
    return grupo
}

function resposta(grupo: GrupoPermissao, ator: UsuarioAutenticado) {
    const proprio = ator.tipo !== 'equipe' && ator.grupoId === grupo.id
    return { ...grupo, pode_editar: podeGerenciarGrupo(ator, grupo), proprio }
}

export async function listar(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = listarGruposQuerySchema.parse(req.query)
    const empresaId = exigirEmpresa(req.usuario, empresa_id)
    const grupos = await permissoesModel.listar(empresaId)
    res.send(grupos.map(grupo => resposta(grupo, req.usuario)))
}

export async function criar(req: FastifyRequest, res: FastifyReply) {
    const { empresa_id } = listarGruposQuerySchema.parse(req.query)
    const body = criarGrupoSchema.parse(req.body)
    const empresaId = exigirEmpresa(req.usuario, empresa_id)
    exigirCabeNoAtor(req.usuario, body.telas, body.alcance)
    if (await permissoesModel.nomeEmUso(empresaId, body.nome, null)) throw conflito('Já existe um grupo com este nome.')

    const dados = { nome: body.nome, descricao: body.descricao || null, alcance: body.alcance, telas: body.telas }
    const id = await withTransaction(async client => {
        const novoId = await permissoesModel.criar(empresaId, dados, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId,
                acao: 'grupo_permissao.criado',
                entidade: 'grupos_permissao',
                entidadeId: novoId,
                dados,
                ip: req.ip,
            },
            client,
        )
        return novoId
    })

    const grupo = await permissoesModel.buscar(id)
    res.code(201).send(grupo && resposta(grupo, req.usuario))
}

export async function atualizar(req: FastifyRequest, res: FastifyReply) {
    const grupo = await buscarGerenciavel(req)
    const body = atualizarGrupoSchema.parse(req.body)
    if (Object.keys(body).length === 0) throw invalido('Nenhum campo para atualizar.')

    const dados = {
        nome: body.nome ?? grupo.nome,
        descricao: body.descricao !== undefined ? body.descricao || null : grupo.descricao,
        alcance: body.alcance ?? grupo.alcance,
        telas: body.telas ?? grupo.telas,
    }
    exigirCabeNoAtor(req.usuario, dados.telas, dados.alcance)
    if (dados.nome !== grupo.nome && (await permissoesModel.nomeEmUso(grupo.empresa_id, dados.nome, grupo.id))) {
        throw conflito('Já existe um grupo com este nome.')
    }

    await withTransaction(async client => {
        await permissoesModel.atualizar(grupo.id, dados, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: grupo.empresa_id,
                acao: 'grupo_permissao.alterado',
                entidade: 'grupos_permissao',
                entidadeId: grupo.id,
                dados: {
                    antes: { nome: grupo.nome, descricao: grupo.descricao, alcance: grupo.alcance, telas: grupo.telas },
                    depois: dados,
                },
                ip: req.ip,
            },
            client,
        )
    })

    const atualizado = await permissoesModel.buscar(grupo.id)
    res.send(atualizado && resposta(atualizado, req.usuario))
}

export async function excluir(req: FastifyRequest, res: FastifyReply) {
    const grupo = await buscarGerenciavel(req)
    if (grupo.padrao) throw invalido('Os grupos padrão (RH e Gestor) não podem ser excluídos, só editados.')
    if (grupo.usuarios > 0) {
        throw conflito(
            `O grupo tem ${grupo.usuarios} ${grupo.usuarios === 1 ? 'usuário' : 'usuários'}. Mova ${grupo.usuarios === 1 ? 'ele' : 'eles'} para outro grupo antes de excluir.`,
        )
    }

    await withTransaction(async client => {
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: grupo.empresa_id,
                acao: 'grupo_permissao.excluido',
                entidade: 'grupos_permissao',
                entidadeId: grupo.id,
                dados: { nome: grupo.nome, alcance: grupo.alcance, telas: grupo.telas },
                ip: req.ip,
            },
            client,
        )
        await permissoesModel.excluir(grupo.id, client)
    })

    res.code(204).send()
}
