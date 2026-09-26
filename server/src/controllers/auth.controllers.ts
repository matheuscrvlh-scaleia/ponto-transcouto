import type { FastifyRequest, FastifyReply } from "fastify";
import { search } from "../models/auth.models";
import { verifyPassword } from "../utils/hash";
import jwt from 'jsonwebtoken'

export async function login(req:FastifyRequest, res:FastifyReply) {
    const { email, senha } = req.body

    try {
        const searchUser = await search(email);

        if(searchUser.rows.length === 0) {
            res.code(400).send({ error: 'Email não encontrado.'})
        }

        const result = await verifyPassword(senha, searchUser.rows[0].senha);
        if(!result) {
            res.code(401).send({ error: 'Senha inválida.'})
        }

        const userPayload = {
            id: searchUser.rows[0].id,
            nome: searchUser.rows[0].nome
        }

        const token = await jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '8h' })

        res.code(200).send(token)
    } catch(err) {
        console.log(err) 
        res.code(500).send({ error: 'Erro interno do servidor.'})
    }
}