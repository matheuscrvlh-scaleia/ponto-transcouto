import type { FastifyInstance } from 'fastify'
import { atualizar, criar, definirUnidades, listar, redefinirSenha } from '../controllers/clientes.controllers'
import { authenticate, exigirPerfil } from '../middlewares/auth.middlewares'

/** Usuários dos clientes: equipe (qualquer empresa) e RH (própria empresa). */
export async function clientesRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirPerfil('admin', 'rh')] }

    app.get('/clientes', acesso, listar)
    app.post('/clientes', acesso, criar)
    app.patch('/clientes/:id', acesso, atualizar)
    app.put('/clientes/:id/unidades', acesso, definirUnidades)
    app.post('/clientes/:id/redefinir-senha', acesso, redefinirSenha)
}
