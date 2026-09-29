import { env } from '../../config/env'
import { requisitar } from './http'
import { normalizarChaves } from './normalizar'
import { SecullumError, type BancoSecullumCompleto, type TokenSecullum } from './tipos'

export type BancoSecullum = {
    id: string
    nome: string
}

const CLIENT_ID_PONTO_WEB = '3'
const MARGEM_RENOVACAO_MS = 5 * 60 * 1000
const cacheTokens = new Map<string, TokenSecullum>()

const urlAuth = (rota: string) => `${env.SECULLUM_AUTH_URL.replace(/\/+$/, '')}/${rota}`

export async function solicitarToken(usuario: string, senha: string): Promise<TokenSecullum> {
    const corpo = new URLSearchParams({
        grant_type: 'password',
        username: usuario,
        password: senha,
        client_id: CLIENT_ID_PONTO_WEB,
    })

    let resposta: unknown
    try {
        resposta = await requisitar(
            urlAuth('Token'),
            { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo.toString() },
            { rota: 'Token', timeoutMs: 30000, tentativas: 2, backoffMs: 1000 },
        )
    } catch (err) {
        if (err instanceof SecullumError && err.tipo === 'validacao') {
            throw new SecullumError('Secullum: usuário ou senha inválidos.', 'auth', err.status, err.detalhes)
        }
        throw err
    }

    const dados = normalizarChaves(resposta)
    if (typeof dados.access_token !== 'string' || !dados.access_token) {
        const descricao = dados.error_description ?? dados.error ?? 'resposta sem access_token'
        throw new SecullumError(`Secullum: falha na autenticação (${descricao}).`, 'auth')
    }

    const expiraEmSegundos = Number(dados.expires_in) || 3600
    return { accessToken: dados.access_token, expiraEm: Date.now() + expiraEmSegundos * 1000 }
}

export async function obterToken(chave: string, usuario: string, senha: string, forcar = false) {
    const emCache = cacheTokens.get(chave)
    if (!forcar && emCache && emCache.expiraEm - Date.now() > MARGEM_RENOVACAO_MS) return emCache.accessToken

    const token = await solicitarToken(usuario, senha)
    cacheTokens.set(chave, token)
    return token.accessToken
}

export function descartarToken(chave?: string) {
    if (chave === undefined) cacheTokens.clear()
    else cacheTokens.delete(chave)
}

export async function listarBancosDoToken(accessToken: string): Promise<BancoSecullumCompleto[]> {
    const resposta = await requisitar(
        urlAuth('ContasSecullumExterno/ListarBancos/'),
        { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
        { rota: 'ListarBancos', timeoutMs: 30000, tentativas: 2, backoffMs: 1000 },
    )
    if (!Array.isArray(resposta)) throw new SecullumError('Secullum ListarBancos: resposta inesperada.', 'formato')

    return resposta
        .map(normalizarChaves)
        .filter(b => String(b.clienteid ?? CLIENT_ID_PONTO_WEB) === CLIENT_ID_PONTO_WEB)
        .map(b => ({
            id: String(b.id),
            identificador: b.identificador ? String(b.identificador) : null,
            clienteId: String(b.clienteid ?? CLIENT_ID_PONTO_WEB),
            nome: String(b.nome ?? ''),
        }))
}

export async function listarBancos(usuario: string, senha: string): Promise<BancoSecullum[]> {
    const token = await solicitarToken(usuario, senha)
    const bancos = await listarBancosDoToken(token.accessToken)
    return bancos.map(b => ({ id: b.id, nome: b.nome }))
}
