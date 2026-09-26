import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { createUser } from "../controllers/users.controllers";
import { authenticate } from "../middlewares/auth.middlewares";

async function addUser(req:FastifyRequest, res:FastifyReply) {
    await createUser(req, res)
}

export async function userRoutes(fastify:FastifyInstance) {
    fastify.post('/user', { preHandler: authenticate }, addUser)
}