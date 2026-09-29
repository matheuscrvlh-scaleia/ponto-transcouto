import type { FastifyInstance } from 'fastify'
import { atualizar, calendario, obter } from '../controllers/configuracoes.controllers'
import { authenticate, exigirPerfil } from '../middlewares/auth.middlewares'

export async function configuracoesRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirPerfil('admin', 'rh')] }

    app.get('/configuracoes', acesso, obter)
    app.patch('/configuracoes', acesso, atualizar)
    app.get('/admin/calendario', acesso, calendario)
}
