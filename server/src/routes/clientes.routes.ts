import type { FastifyInstance } from 'fastify'
import { atualizar, criar, definirUnidades, excluir, listar, redefinirSenha } from '../controllers/clientes.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

/** Usuários dos clientes: equipe (qualquer empresa) e quem tem a tela Usuários (própria empresa). */
export async function clientesRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirTela('usuarios')] }

    app.get('/clientes', acesso, listar)
    app.post('/clientes', acesso, criar)
    app.patch('/clientes/:id', acesso, atualizar)
    app.delete('/clientes/:id', acesso, excluir)
    app.put('/clientes/:id/unidades', acesso, definirUnidades)
    app.post('/clientes/:id/redefinir-senha', acesso, redefinirSenha)
}
