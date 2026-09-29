import type { FastifyInstance } from 'fastify'
import { obter, salvar } from '../controllers/admin-mapeamento.controllers'
import { authenticate, exigirPerfil } from '../middlewares/auth.middlewares'

export async function adminMapeamentoRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirPerfil('admin')] }

    app.get('/admin/mapeamento-colunas', acesso, obter)
    app.put('/admin/mapeamento-colunas', acesso, salvar)
}
