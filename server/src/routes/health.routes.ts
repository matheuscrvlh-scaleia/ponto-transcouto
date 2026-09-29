import type { FastifyInstance } from 'fastify'
import { health } from '../controllers/health.controllers'

export async function healthRoutes(app: FastifyInstance) {
    app.get('/health', health)
}
