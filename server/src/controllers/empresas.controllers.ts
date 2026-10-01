import type { FastifyReply, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/database'
import { listarBancos } from '../integrations/secullum/auth'
import * as auditoria from '../models/auditoria.models'
import * as configuracoesModel from '../models/configuracoes.models'
import * as empresasModel from '../models/empresas.models'
import { idParamSchema } from '../types/comum.types'
import {
    atualizarEmpresaSchema,
    criarEmpresaSchema,
    testarConexaoSchema,
    type DadosEmpresa,
} from '../types/empresas.types'
import { decrypt, encrypt } from '../utils/crypt'
import { conflito, invalido, naoEncontrado } from '../utils/errors'

async function buscarEmpresa(req: FastifyRequest) {
    const { id } = idParamSchema.parse(req.params)
    const empresa = await empresasModel.buscar(id)
    if (!empresa) throw naoEncontrado('Empresa não encontrada.')
    return empresa
}

async function validar(dados: DadosEmpresa, ignorarId: number | null) {
    if ((dados.secullum_usuario == null) !== (dados.secullum_senha_cripto == null)) {
        throw invalido('Informe usuário e senha da Secullum juntos.')
    }
    const campo = await empresasModel.conflitos(dados.nome, dados.secullum_banco_id, ignorarId)
    if (campo === 'nome') throw conflito('Já existe uma empresa com este nome.')
    if (campo) throw conflito('Este banco Secullum já está vinculado a outra empresa.')
}

export async function listar(_req: FastifyRequest, res: FastifyReply) {
    res.send(await empresasModel.listar())
}

export async function detalhe(req: FastifyRequest, res: FastifyReply) {
    res.send(await buscarEmpresa(req))
}

export async function criar(req: FastifyRequest, res: FastifyReply) {
    const body = criarEmpresaSchema.parse(req.body)
    const dados: DadosEmpresa = {
        nome: body.nome,
        secullum_usuario: body.secullum_usuario ?? null,
        secullum_senha_cripto: body.secullum_senha ? encrypt(body.secullum_senha) : null,
        secullum_banco_id: body.secullum_banco_id ?? null,
        ativo: body.ativo,
    }
    await validar(dados, null)

    const empresa = await withTransaction(async client => {
        const id = await empresasModel.criar(dados, client)
        await configuracoesModel.criarPadrao(id, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: id,
                acao: 'empresa.criada',
                entidade: 'empresas',
                entidadeId: id,
                dados: { nome: dados.nome, secullum_usuario: dados.secullum_usuario, secullum_banco_id: dados.secullum_banco_id },
                ip: req.ip,
            },
            client,
        )
        return empresasModel.buscar(id, client)
    })

    res.code(201).send(empresa)
}

export async function atualizar(req: FastifyRequest, res: FastifyReply) {
    const atual = await buscarEmpresa(req)
    const body = atualizarEmpresaSchema.parse(req.body)
    if (Object.keys(body).length === 0) throw invalido('Nenhum campo para atualizar.')

    const credenciais = await empresasModel.buscarCredenciais(atual.id)
    const usuario = body.secullum_usuario !== undefined ? body.secullum_usuario : atual.secullum_usuario
    const senhaCripto =
        body.secullum_senha !== undefined
            ? body.secullum_senha && encrypt(body.secullum_senha)
            : (credenciais?.secullum_senha_cripto ?? null)

    const dados: DadosEmpresa = {
        nome: body.nome ?? atual.nome,
        secullum_usuario: usuario,
        secullum_senha_cripto: usuario == null ? null : senhaCripto,
        secullum_banco_id: body.secullum_banco_id !== undefined ? body.secullum_banco_id : atual.secullum_banco_id,
        ativo: body.ativo ?? atual.ativo,
    }
    await validar(dados, atual.id)

    const { secullum_senha, ...alteracoes } = body
    const empresa = await withTransaction(async client => {
        await empresasModel.atualizar(atual.id, dados, client)
        await auditoria.registrar(
            {
                ator: req.usuario,
                empresaId: atual.id,
                acao: 'empresa.alterada',
                entidade: 'empresas',
                entidadeId: atual.id,
                dados: { alteracoes, senha_alterada: secullum_senha !== undefined },
                ip: req.ip,
            },
            client,
        )
        return empresasModel.buscar(atual.id, client)
    })

    res.send(empresa)
}

export async function testarConexao(req: FastifyRequest, res: FastifyReply) {
    const empresa = await buscarEmpresa(req)
    const body = testarConexaoSchema.parse(req.body ?? {})
    const credenciais = await empresasModel.buscarCredenciais(empresa.id)

    const usuario = body.secullum_usuario ?? credenciais?.secullum_usuario
    const senha =
        body.secullum_senha ?? (credenciais?.secullum_senha_cripto ? decrypt(credenciais.secullum_senha_cripto) : null)
    if (!usuario || !senha) throw invalido('Empresa sem credenciais da Secullum.')

    try {
        const bancos = await listarBancos(usuario, senha)
        res.send({
            ok: true,
            bancos,
            banco_configurado_encontrado: empresa.secullum_banco_id
                ? bancos.some(b => String(b.id) === empresa.secullum_banco_id)
                : null,
        })
    } catch (err) {
        res.send({ ok: false, erro: err instanceof Error ? err.message : 'Falha ao conectar na Secullum.' })
    }
}
