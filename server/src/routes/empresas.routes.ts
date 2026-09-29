import type { FastifyInstance } from 'fastify'
import { atualizar, criar, detalhe, listar, testarConexao } from '../controllers/empresas.controllers'
import { authenticate, exigirPerfil } from '../middlewares/auth.middlewares'

export async function empresasRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirPerfil('admin')] }

    app.get('/admin/empresas', acesso, listar)
    app.get('/admin/empresas/:id', acesso, detalhe)
    app.post('/admin/empresas', acesso, criar)
    app.patch('/admin/empresas/:id', acesso, atualizar)
    app.post(
        '/admin/empresas/:id/testar-conexao',
        { ...acesso, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
        testarConexao,
    )
}
