import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { login } from "../controllers/auth.controllers";

async function loginUser(req:FastifyRequest, res:FastifyReply) {
    await login(req, res)
}

export async function authRoutes(fastify:FastifyInstance) {
    fastify.post('/login', loginUser)
}