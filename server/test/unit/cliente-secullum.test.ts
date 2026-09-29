import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { descartarToken, listarBancos } from '../../src/integrations/secullum/auth'
import { criarClienteSecullum } from '../../src/integrations/secullum/cliente'
import { SecullumError } from '../../src/integrations/secullum/tipos'

const json = (status: number, corpo?: unknown, headers: Record<string, string> = {}) =>
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers })

const credenciais = { empresaId: 99, usuario: 'u@teste', senha: 's', bancoId: '123' }
let urls: string[]

function mockFetch(responder: (url: string, init?: RequestInit) => Response) {
    vi.stubGlobal('fetch', vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
        urls.push(String(entrada))
        return responder(String(entrada), init)
    }))
}

beforeEach(() => {
    urls = []
    descartarToken()
})

afterEach(() => vi.unstubAllGlobals())

describe('cliente Secullum', () => {
    it('listarBancos usa password grant client_id=3 e filtra Ponto Web', async () => {
        let corpoToken = ''
        mockFetch((url, init) => {
            if (url.endsWith('/Token')) {
                corpoToken = String(init?.body)
                return json(200, { access_token: 'tk', expires_in: 3600 })
            }
            return json(200, [
                { id: 7, identificador: 'abc', clienteId: '3', nome: 'Transcouto' },
                { id: 8, identificador: 'def', clienteId: '1', nome: 'Outro produto' },
            ])
        })

        expect(await listarBancos('u@teste', 'segredo')).toEqual([{ id: '7', nome: 'Transcouto' }])
        expect(new URLSearchParams(corpoToken).get('grant_type')).toBe('password')
        expect(new URLSearchParams(corpoToken).get('client_id')).toBe('3')
        expect(urls[1]).toMatch(/ContasSecullumExterno\/ListarBancos\/$/)
    })

    it('senha inválida vira erro de auth sem nova tentativa de login', async () => {
        mockFetch(() => json(400, { error: 'invalid_grant', error_description: 'usuário ou senha incorretos' }))
        await expect(listarBancos('u', 'x')).rejects.toMatchObject({ tipo: 'auth' })
        expect(urls).toHaveLength(1)
    })

    it('reautentica uma vez em 401 e reaproveita o token em cache', async () => {
        let tokens = 0
        let dados = 0
        mockFetch(url => {
            if (url.endsWith('/Token')) return json(200, { access_token: `t${++tokens}`, expires_in: 3600 })
            return ++dados === 1 ? json(401) : json(200, [])
        })

        const cliente = criarClienteSecullum(credenciais, { backoffMs: 1 })
        await cliente.get('Empresas')
        await cliente.get('Funcionarios')
        expect(tokens).toBe(2)
        expect(dados).toBe(3)
    })

    it('401 persistente é erro de auth', async () => {
        mockFetch(url => (url.endsWith('/Token') ? json(200, { access_token: 't', expires_in: 3600 }) : json(401)))
        await expect(criarClienteSecullum(credenciais).get('Empresas')).rejects.toMatchObject({ tipo: 'auth' })
    })

    it('repete 5xx e 429 curto com backoff; 400 não repete', async () => {
        let n = 0
        mockFetch(url => {
            if (url.endsWith('/Token')) return json(200, { access_token: 't', expires_in: 3600 })
            n++
            if (n === 1) return json(502)
            if (n === 2) return json(429, undefined, { 'Retry-After': '0' })
            return json(200, { Colunas: ['Data'], Totais: [''] })
        })
        const cliente = criarClienteSecullum(credenciais, { backoffMs: 1 })
        await expect(cliente.calcular('Calcular/SomenteTotais', { FuncionarioCpf: '1' })).resolves.toBeTruthy()
        expect(n).toBe(3)

        n = 0
        mockFetch(url => {
            if (url.endsWith('/Token')) return json(200, { access_token: 't', expires_in: 3600 })
            n++
            return json(400, [{ Property: 'FuncionarioCpf', Message: 'Funcionário não encontrado' }])
        })
        const erro = await cliente.calcular('Calcular/SomenteTotais', { FuncionarioCpf: '1' }).catch((e: SecullumError) => e)
        expect(erro).toBeInstanceOf(SecullumError)
        expect(erro).toMatchObject({ tipo: 'validacao', status: 400 })
        expect((erro as SecullumError).message).toMatch(/não encontrado/)
        expect(n).toBe(1)
    })

    it('é somente leitura: POST fora de Calcular* é bloqueado antes de sair', async () => {
        mockFetch(() => json(200, {}))
        const cliente = criarClienteSecullum(credenciais)
        await expect(cliente.calcular('CartaoPonto/Manual' as 'Calcular', {})).rejects.toThrow(/somente leitura/)
        expect(urls).toHaveLength(0)
    })
})
