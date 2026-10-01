import type { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { buscarPorId } from '../models/auth.models'
import type { Ator, Perfil, TokenPayload } from '../types/auth.types'
import { naoAutorizado, proibido } from '../utils/errors'

const rotasLiberadasSemTrocaDeSenha = ['/api/v1/auth/me', '/api/v1/auth/trocar-senha']

export async function authenticate(req: FastifyRequest) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) throw naoAutorizado('Token não encontrado.')

    let payload: TokenPayload
    try {
        payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as unknown as TokenPayload
    } catch (err) {
        throw naoAutorizado(err instanceof jwt.TokenExpiredError ? 'Sessão expirada.' : 'Token inválido.')
    }

    // tokens emitidos antes da separação equipe/clientes não têm o tipo: pedem login de novo
    if (payload.t !== 'e' && payload.t !== 'c') throw naoAutorizado('Sessão inválida.')

    const usuario = await buscarPorId({ tipo: payload.t === 'e' ? 'equipe' : 'cliente', id: Number(payload.sub) })
    if (!usuario || !usuario.ativo || usuario.token_versao !== payload.tv) {
        throw naoAutorizado('Sessão inválida.')
    }

    req.usuario = {
        tipo: usuario.tipo,
        id: usuario.id,
        nome: usuario.nome,
        perfil: usuario.perfil,
        empresaId: usuario.empresa_id,
        deveTrocarSenha: usuario.deve_trocar_senha,
    }

    const rota = req.routeOptions.url ?? ''
    if (usuario.deve_trocar_senha && !rotasLiberadasSemTrocaDeSenha.includes(rota)) {
        throw proibido('Troque sua senha para continuar.')
    }
}

export function exigirPerfil(...permitidos: Perfil[]) {
    return async (req: FastifyRequest, _res: FastifyReply) => {
        if (!permitidos.includes(req.usuario.perfil)) throw proibido()
    }
}

export function assinarToken(ator: Ator, tokenVersao: number) {
    const payload = { sub: ator.id, tv: tokenVersao, t: ator.tipo === 'equipe' ? 'e' : 'c' }
    return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h' })
}
