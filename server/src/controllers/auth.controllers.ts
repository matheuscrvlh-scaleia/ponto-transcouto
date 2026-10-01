import type { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { assinarToken } from '../middlewares/auth.middlewares'
import * as authModel from '../models/auth.models'
import { loginSchema, trocarSenhaSchema } from '../types/auth.types'
import { cpfNormalizado } from '../utils/cpf'
import { invalido, naoAutorizado } from '../utils/errors'
import { hashPassword, verifyPassword } from '../utils/hash'

async function buscarPorLogin(login: string) {
    if (login.includes('@')) return authModel.buscarPorEmail(login)
    const cpf = cpfNormalizado(login)
    return cpf ? authModel.buscarPorCpf(cpf) : null
}

export async function login(req: FastifyRequest, res: FastifyReply) {
    const { login, senha } = loginSchema.parse(req.body)

    const usuario = await buscarPorLogin(login)
    const senhaConfere = await verifyPassword(senha, usuario?.senha ?? null)

    if (!usuario || !usuario.ativo || !senhaConfere) {
        throw naoAutorizado('Login ou senha inválidos.')
    }

    await authModel.registrarLogin(usuario)

    const token = assinarToken(usuario, usuario.token_versao)
    const { exp } = jwt.decode(token) as { exp: number }

    res.send({
        token,
        expira_em: new Date(exp * 1000).toISOString(),
        usuario: authModel.sessao(usuario),
        unidades: await authModel.listarUnidadesPermitidas(usuario),
    })
}

export async function me(req: FastifyRequest, res: FastifyReply) {
    const usuario = await authModel.buscarPorId(req.usuario)
    if (!usuario) throw naoAutorizado()

    res.send({
        usuario: authModel.sessao(usuario),
        unidades: await authModel.listarUnidadesPermitidas(usuario),
    })
}

export async function trocarSenha(req: FastifyRequest, res: FastifyReply) {
    const { senha_atual, nova_senha } = trocarSenhaSchema.parse(req.body)

    const usuario = await authModel.buscarPorId(req.usuario)
    if (!usuario || !(await verifyPassword(senha_atual, usuario.senha))) {
        throw invalido('Senha atual incorreta.')
    }
    if (nova_senha === senha_atual) throw invalido('A nova senha deve ser diferente da atual.')

    const tokenVersao = await authModel.atualizarSenha(usuario, await hashPassword(nova_senha))

    res.send({ token: assinarToken(usuario, tokenVersao) })
}
