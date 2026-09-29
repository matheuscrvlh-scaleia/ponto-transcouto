import Fastify, { type FastifyError } from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { ZodError, z } from 'zod'
import { env } from './config/env'
import { routes } from './routes'
import { AppError } from './utils/errors'

z.config(z.locales.pt())

const VIOLACAO_UNICIDADE = '23505'

export async function buildApp() {
    const app = Fastify({
        trustProxy: env.TRUST_PROXY,
        logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'warn' },
    })

    await app.register(cors, {
        origin: env.CORS_ORIGIN.split(','),
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    })
    await app.register(rateLimit, { global: false })

    app.setErrorHandler((err: FastifyError, req, res) => {
        if (err instanceof ZodError) {
            return res.code(400).send({ error: 'Dados inválidos.', campos: z.flattenError(err).fieldErrors })
        }
        if (err instanceof AppError) {
            return res.code(err.statusCode).send({ error: err.message, detalhes: err.detalhes })
        }
        if ((err as { code?: string }).code === VIOLACAO_UNICIDADE) {
            return res.code(409).send({ error: 'Registro duplicado.' })
        }
        if (err.statusCode && err.statusCode < 500) {
            return res.code(err.statusCode).send({ error: err.message })
        }
        req.log.error(err)
        res.code(500).send({ error: 'Erro interno do servidor.' })
    })

    app.setNotFoundHandler((_req, res) => {
        res.code(404).send({ error: 'Rota não encontrada.' })
    })

    await app.register(routes, { prefix: '/api/v1' })

    return app
}
