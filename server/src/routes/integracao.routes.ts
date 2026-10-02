import type { FastifyInstance } from 'fastify'
import {
    atividade,
    atualizarTempoReal,
    execucoes,
    forcarSincronizacao,
    historico,
    pedirCadastros,
    pedirDados,
    previaDados,
    status,
} from '../controllers/integracao.controllers'
import { authenticate, exigirTela } from '../middlewares/auth.middlewares'

/** Integração FriPonto: quem tem a tela Integração no grupo de permissão (cada um no seu escopo de unidades). */
export async function integracaoRoutes(app: FastifyInstance) {
    const acesso = { preHandler: [authenticate, exigirTela('integracao')] }
    // pedidos consomem a cota da Secullum: limita repetição
    const pedido = { ...acesso, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }

    app.get('/integracao/status', acesso, status)
    // indicador "sincronizando" e alertas de erro (consultado pelo app inteiro)
    app.get('/integracao/atividade', { preHandler: authenticate }, atividade)
    app.post('/integracao/cadastros', pedido, pedirCadastros)
    app.get('/integracao/dados/previa', acesso, previaDados)
    app.post('/integracao/dados', pedido, pedirDados)
    app.post('/integracao/tempo-real/atualizar', pedido, atualizarTempoReal)
    // tela Atualização dos dados: cadastros, batidas e tempo real de uma vez
    app.post('/integracao/sincronizar', { ...pedido, preHandler: [authenticate, exigirTela('atualizacao')] }, forcarSincronizacao)
    app.get('/integracao/execucoes', acesso, execucoes)
    app.get('/integracao/historico', acesso, historico)
}
