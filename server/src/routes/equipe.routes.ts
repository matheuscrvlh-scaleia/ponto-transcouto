import type { FastifyInstance } from 'fastify'
import { atualizar, criar, excluir, listar, redefinirSenha } from '../controllers/equipe.controllers'
import { authenticate, exigirPerfil } from '../middlewares/auth.middlewares'

/** Equipe Scale IA: só a própria equipe gerencia. */
export async function equipeRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirPerfil('admin')] }

    app.get('/equipe', acesso, listar)
    app.post('/equipe', acesso, criar)
    app.patch('/equipe/:id', acesso, atualizar)
    app.delete('/equipe/:id', acesso, excluir)
    app.post('/equipe/:id/redefinir-senha', acesso, redefinirSenha)
}
