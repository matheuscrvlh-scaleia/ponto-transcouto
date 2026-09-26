import type { FastifyReply, FastifyRequest } from "fastify"
import jwt from 'jsonwebtoken'

export async function authenticate(req:FastifyRequest, res:FastifyReply) {
    const authHeader = req.headers.authorization

    try {
        const token = authHeader?.split(' ')[1]

        if(!token) {
            res.code(401).send({ error: 'Token não encontrado.'})
        }

        const decodedPayload = jwt.verify(token, process.env.JWT_SECRET)

        const

    } catch(err) {
        console.error(err)
        res.code(500).send({ error: 'Erro interno do servidor.'})
    }
}