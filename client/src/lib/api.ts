import type { ErroApi } from '../types/api'
import { alertarErro, tituloDoErroApi } from './alertas'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1'
const CHAVE_TOKEN = 'copiloto.token'

export class ApiError extends Error {
  status: number
  campos?: ErroApi['campos']
  detalhes?: unknown
  /** A api() já mostrou este erro na central de alertas (sem conexão, erro do servidor). */
  alertado = false

  constructor(status: number, corpo: Partial<ErroApi> | null) {
    super(corpo?.error ?? mensagemPadrao(status))
    this.status = status
    this.campos = corpo?.campos
    this.detalhes = corpo?.detalhes
  }
}

function mensagemPadrao(status: number) {
  if (status === 0) return 'Não foi possível conectar ao servidor. Verifique sua conexão.'
  if (status === 404) return 'Registro não encontrado.'
  if (status === 429) return 'Muitas tentativas. Aguarde um momento e tente novamente.'
  return 'Erro inesperado. Tente novamente em instantes.'
}

function lerToken() {
  try {
    return window.sessionStorage.getItem(CHAVE_TOKEN)
  } catch {
    return null
  }
}

let token: string | null = lerToken()
let aoExpirar: () => void = () => {}

export const sessao = {
  obter: () => token,
  definir(novo: string | null) {
    token = novo
    try {
      if (novo) window.sessionStorage.setItem(CHAVE_TOKEN, novo)
      else window.sessionStorage.removeItem(CHAVE_TOKEN)
    } catch {
      /* armazenamento indisponível: token fica só em memória */
    }
  },
  aoExpirar(fn: () => void) {
    aoExpirar = fn
  },
}

type Opcoes = Omit<RequestInit, 'body'> & {
  json?: unknown
  query?: Record<string, string | number | undefined>
  /** Não mostra alerta de erro (ex.: consultas de fundo feitas de tempos em tempos). */
  silencioso?: boolean
}

/**
 * Erros que viram alerta no canto da tela sozinhos: sem conexão (qualquer chamada) e
 * erro do servidor em ações (POST, PATCH...). Erro ao carregar uma tela já aparece na
 * própria tela, e erros de validação aparecem no formulário.
 */
function alertarSeFor(erro: ApiError, metodo: string) {
  if (erro.status === 0 || (erro.status >= 500 && metodo !== 'GET')) {
    alertarErro({ titulo: tituloDoErroApi(erro.status), mensagem: erro.message })
    erro.alertado = true
  }
}

export async function api<T>(caminho: string, { json, query, headers, silencioso, ...init }: Opcoes = {}): Promise<T> {
  const metodo = (init.method ?? 'GET').toUpperCase()
  const cabecalhos = new Headers(headers)
  if (token) cabecalhos.set('Authorization', `Bearer ${token}`)
  if (json !== undefined) cabecalhos.set('Content-Type', 'application/json')

  let url = `${BASE}${caminho}`
  if (query) {
    const params = new URLSearchParams()
    for (const [chave, valor] of Object.entries(query)) {
      if (valor !== undefined && valor !== '') params.set(chave, String(valor))
    }
    if (params.size) url += `?${params}`
  }

  let resposta: Response
  try {
    resposta = await fetch(url, {
      ...init,
      headers: cabecalhos,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    })
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro
    const semConexao = new ApiError(0, null)
    if (!silencioso) alertarSeFor(semConexao, metodo)
    throw semConexao
  }

  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null)

  if (resposta.status === 401 && token) {
    sessao.definir(null)
    aoExpirar()
  }
  if (!resposta.ok) {
    const erro = new ApiError(resposta.status, corpo)
    if (!silencioso) alertarSeFor(erro, metodo)
    throw erro
  }

  return corpo as T
}
