import type { FastifyInstance } from 'fastify'
import { atualizar, criar, excluir, listar } from '../controllers/permissoes.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

/** Grupos de permissão: quem tem a tela Permissões gerencia; quem tem Usuários só lista (para escolher o grupo). */
export async function permissoesRoutes(app: FastifyInstance) {
    const leitura = { preHandler: [authenticate, exigirTela('permissoes', 'usuarios')] }
    const gestao = { preHandler: [authenticate, exigirTela('permissoes')] }

    app.get('/permissoes/grupos', leitura, listar)
    app.post('/permissoes/grupos', gestao, criar)
    app.patch('/permissoes/grupos/:id', gestao, atualizar)
    app.delete('/permissoes/grupos/:id', gestao, excluir)
}
