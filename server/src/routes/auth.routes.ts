import type { FastifyInstance } from 'fastify'
import { login, me, trocarSenha } from '../controllers/auth.controllers'
import { authenticate } from '../middlewares/auth.middlewares'

const limiteTentativas = { rateLimit: { max: 10, timeWindow: '1 minute' } }

/** Login digitado, normalizado: CPF só com dígitos, e-mail em minúsculas. */
function chaveDoLogin(body: unknown) {
    const login = String((body as { login?: unknown } | null)?.login ?? '').trim().toLowerCase()
    const digitos = login.replace(/D/g, '')
    return `login:${digitos.length === 11 && !login.includes('@') ? digitos : login}`
}

export async function authRoutes(app: FastifyInstance) {
    // além do limite por IP, um limite por conta: trocar de IP não libera mais tentativas na mesma conta
    const limitePorConta = app.rateLimit({ max: 8, timeWindow: '15 minutes', keyGenerator: req => chaveDoLogin(req.body) })

    app.post('/auth/login', { config: limiteTentativas, preHandler: limitePorConta }, login)
    app.get('/auth/me', { preHandler: authenticate }, me)
    app.post('/auth/trocar-senha', { preHandler: authenticate, config: limiteTentativas }, trocarSenha)
}
