import type { FastifyInstance } from 'fastify'
import { detalhe, historico } from '../controllers/colaboradores.controllers'
import { authenticate } from '../middlewares/auth.middlewares'

export async function colaboradoresRoutes(app: FastifyInstance) {
    app.get('/colaboradores/:id', { preHandler: authenticate }, detalhe)
    app.get('/colaboradores/:id/historico', { preHandler: authenticate }, historico)
}
