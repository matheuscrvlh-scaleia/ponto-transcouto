import type { FastifyInstance } from 'fastify'
import { atualizar, criar, definirUnidades, listar, redefinirSenha } from '../controllers/usuarios.controllers'
import { authenticate, exigirPerfil } from '../middlewares/auth.middlewares'

export async function usuariosRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirPerfil('admin', 'rh')] }

    app.get('/usuarios', acesso, listar)
    app.post('/usuarios', acesso, criar)
    app.patch('/usuarios/:id', acesso, atualizar)
    app.put('/usuarios/:id/unidades', acesso, definirUnidades)
    app.post('/usuarios/:id/redefinir-senha', acesso, redefinirSenha)
}
