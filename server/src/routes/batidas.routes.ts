import type { FastifyInstance } from 'fastify'
import { listar } from '../controllers/batidas.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

export async function batidasRoutes(app: FastifyInstance) {
    app.get('/batidas', { preHandler: [authenticate, exigirTela('batidas')] }, listar)
}
