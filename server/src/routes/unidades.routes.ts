import type { FastifyInstance } from 'fastify'
import { dashboard, dashboardGeral, listar } from '../controllers/unidades.controllers'
import { authenticate } from '../middlewares/auth.middlewares'

export async function unidadesRoutes(app: FastifyInstance) {
    app.get('/unidades', { preHandler: authenticate }, listar)
    app.get('/dashboard', { preHandler: authenticate }, dashboardGeral)
    app.get('/unidades/:id/dashboard', { preHandler: authenticate }, dashboard)
}
