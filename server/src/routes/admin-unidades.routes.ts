import type { FastifyInstance } from 'fastify'
import { atualizar, listar, solicitarSincronizacao } from '../controllers/admin-unidades.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

export async function adminUnidadesRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirTela('unidades')] }
    // a lista também abastece os filtros de Usuários e Fechamentos
    const leitura = { preHandler: [authenticate, exigirTela('unidades', 'usuarios', 'fechamentos')] }

    app.get('/admin/unidades', leitura, listar)
    app.patch('/admin/unidades/:id', acesso, atualizar)
    app.post('/admin/sincronizacoes', acesso, solicitarSincronizacao)
}
