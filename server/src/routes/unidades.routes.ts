import type { FastifyInstance } from 'fastify'
import { totais as horasDiaTotais } from '../controllers/horas-dia.controllers'
import { dashboard, dashboardGeral, listar } from '../controllers/unidades.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

export async function unidadesRoutes(app: FastifyInstance) {
    app.get('/unidades', { preHandler: authenticate }, listar)
    // painel de banco de horas: telas Dashboard e Colaboradores
    const painel = { preHandler: [authenticate, exigirTela('dashboard', 'colaboradores')] }
    app.get('/dashboard', painel, dashboardGeral)
    app.get('/unidades/:id/dashboard', painel, dashboard)
    // extras e negativas num intervalo de datas (filtro de Colaboradores)
    app.get('/horas-dia', painel, horasDiaTotais)
}
