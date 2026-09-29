import { env } from '../../config/env'
import { obterToken } from './auth'
import { requisitar } from './http'
import { SecullumError, type CredenciaisSecullum, type OpcoesCliente } from './tipos'

export const ROTA_TOTAIS = 'Calcular/SomenteTotais'
const ROTAS_POST_SOMENTE_LEITURA = new Set(['Calcular', ROTA_TOTAIS])

export type ClienteSecullum = {
    get(rota: string, query?: Record<string, string>): Promise<unknown>
    calcular(rota: 'Calcular' | typeof ROTA_TOTAIS, corpo: Record<string, unknown>): Promise<unknown>
}

export function criarClienteSecullum(credenciais: CredenciaisSecullum, opcoes: OpcoesCliente = {}): ClienteSecullum {
    const chaveToken = `empresa:${credenciais.empresaId}:${credenciais.usuario}`
    const base = env.SECULLUM_API_URL.replace(/\/+$/, '')

    async function chamar(metodo: 'GET' | 'POST', rota: string, query?: Record<string, string>, corpo?: unknown) {
        if (metodo !== 'GET' && !ROTAS_POST_SOMENTE_LEITURA.has(rota)) {
            throw new Error(`Cliente Secullum é somente leitura: ${metodo} ${rota} bloqueado.`)
        }

        const qs = query ? `?${new URLSearchParams(query).toString()}` : ''
        const url = `${base}/${rota}${qs}`

        let tokenObtido = false
        const executar = async (forcarToken: boolean) => {
            const token = await obterToken(chaveToken, credenciais.usuario, credenciais.senha, forcarToken)
            tokenObtido = true
            const headers: Record<string, string> = {
                Authorization: `Bearer ${token}`,
                secullumidbancoselecionado: credenciais.bancoId,
                'Accept-Language': 'pt-BR',
                Accept: 'application/json',
            }
            if (metodo === 'POST') headers['Content-Type'] = 'application/json; charset=utf-8'

            return requisitar(
                url,
                { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) },
                {
                    rota,
                    timeoutMs: opcoes.timeoutMs ?? (metodo === 'POST' ? 60000 : 30000),
                    tentativas: opcoes.tentativas ?? 3,
                    backoffMs: opcoes.backoffMs ?? 2000,
                    ganchos: opcoes.ganchos,
                },
            )
        }

        try {
            return await executar(false)
        } catch (err) {
            if (!(err instanceof SecullumError) || err.tipo !== 'auth' || !tokenObtido) throw err
            return executar(true)
        }
    }

    return {
        get: (rota, query) => chamar('GET', rota, query),
        calcular: (rota, corpo) => chamar('POST', rota, undefined, corpo),
    }
}
