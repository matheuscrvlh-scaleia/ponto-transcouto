import type { FastifyInstance } from 'fastify'
import { login, me, trocarSenha } from '../controllers/auth.controllers'
import { authenticate } from '../middlewares/auth.middlewares'

const limiteTentativas = { rateLimit: { max: 10, timeWindow: '1 minute' } }

export async function authRoutes(app: FastifyInstance) {
    app.post('/auth/login', { config: limiteTentativas }, login)
    app.get('/auth/me', { preHandler: authenticate }, me)
    app.post('/auth/trocar-senha', { preHandler: authenticate, config: limiteTentativas }, trocarSenha)
}
