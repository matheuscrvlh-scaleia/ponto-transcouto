import type { FastifyInstance } from 'fastify'
import { atualizar, listar, solicitarSincronizacao } from '../controllers/admin-unidades.controllers'
import { authenticate, exigirPerfil } from '../middlewares/auth.middlewares'

export async function adminUnidadesRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirPerfil('admin', 'rh')] }

    app.get('/admin/unidades', acesso, listar)
    app.patch('/admin/unidades/:id', acesso, atualizar)
    app.post('/admin/sincronizacoes', acesso, solicitarSincronizacao)
}
