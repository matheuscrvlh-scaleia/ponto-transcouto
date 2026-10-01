import type { FastifyInstance } from 'fastify'
import { adminFechamentosRoutes } from './admin-fechamentos.routes'
import { adminMapeamentoRoutes } from './admin-mapeamento.routes'
import { adminUnidadesRoutes } from './admin-unidades.routes'
import { authRoutes } from './auth.routes'
import { clientesRoutes } from './clientes.routes'
import { colaboradoresRoutes } from './colaboradores.routes'
import { configuracoesRoutes } from './configuracoes.routes'
import { empresasRoutes } from './empresas.routes'
import { equipeRoutes } from './equipe.routes'
import { healthRoutes } from './health.routes'
import { unidadesRoutes } from './unidades.routes'

export async function routes(app: FastifyInstance) {
    await app.register(healthRoutes)
    await app.register(authRoutes)
    await app.register(unidadesRoutes)
    await app.register(colaboradoresRoutes)
    await app.register(clientesRoutes)
    await app.register(equipeRoutes)
    await app.register(adminUnidadesRoutes)
    await app.register(configuracoesRoutes)
    await app.register(adminMapeamentoRoutes)
    await app.register(adminFechamentosRoutes)
    await app.register(empresasRoutes)
}
