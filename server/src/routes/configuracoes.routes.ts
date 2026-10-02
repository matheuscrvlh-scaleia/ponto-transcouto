import type { FastifyInstance } from 'fastify'
import { atualizar, calendario, obter } from '../controllers/configuracoes.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

export async function configuracoesRoutes(app: FastifyInstance) {
    // cada campo do PATCH ainda confere a tela dele (alertas x atualização) no controller
    const acesso = { preHandler: [authenticate, exigirTela('alertas', 'atualizacao', 'fechamentos')] }

    app.get('/configuracoes', acesso, obter)
    app.patch('/configuracoes', acesso, atualizar)
    app.get('/admin/calendario', acesso, calendario)
}
