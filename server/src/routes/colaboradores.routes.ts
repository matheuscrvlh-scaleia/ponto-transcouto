import type { FastifyInstance } from 'fastify'
import { detalhe, historico, historicoDiario } from '../controllers/colaboradores.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

export async function colaboradoresRoutes(app: FastifyInstance) {
    // detalhe do colaborador: aberto a partir do Dashboard, de Colaboradores e de Batidas
    const acesso = { preHandler: [authenticate, exigirTela('dashboard', 'colaboradores', 'batidas')] }
    app.get('/colaboradores/:id', acesso, detalhe)
    app.get('/colaboradores/:id/historico', acesso, historico)
    app.get('/colaboradores/:id/historico-diario', acesso, historicoDiario)
}
