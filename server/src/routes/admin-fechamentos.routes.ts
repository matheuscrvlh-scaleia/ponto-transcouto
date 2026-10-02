import type { FastifyInstance } from 'fastify'
import {
    ajustarGatilho,
    cotaSecullum,
    detalhe,
    listar,
    publicar,
    reprocessar,
} from '../controllers/admin-fechamentos.controllers'
import { authenticate, exigirPerfil, exigirTela } from '../middlewares/auth.middlewares'

export async function adminFechamentosRoutes(app: FastifyInstance) {
    const leitura = { preHandler: [authenticate, exigirTela('fechamentos')] }
    const acesso = { preHandler: [authenticate, exigirPerfil('admin')] }

    app.get('/admin/fechamentos', leitura, listar)
    app.get('/admin/fechamentos/:id', leitura, detalhe)
    app.post('/admin/fechamentos/:id/reprocessar', acesso, reprocessar)
    app.post('/admin/fechamentos/:id/publicar', acesso, publicar)
    app.patch('/admin/ciclos/:id/gatilho', acesso, ajustarGatilho)
    app.get('/admin/cota-secullum', leitura, cotaSecullum)
}
