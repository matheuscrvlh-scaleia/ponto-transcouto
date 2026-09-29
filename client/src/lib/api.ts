import type { ErroApi } from '../types/api'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1'
const CHAVE_TOKEN = 'copiloto.token'

export class ApiError extends Error {
  status: number
  campos?: ErroApi['campos']
  detalhes?: unknown

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

type Opcoes = Omit<RequestInit, 'body'> & { json?: unknown; query?: Record<string, string | number | undefined> }

export async function api<T>(caminho: string, { json, query, headers, ...init }: Opcoes = {}): Promise<T> {
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
    throw new ApiError(0, null)
  }

  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null)

  if (resposta.status === 401 && token) {
    sessao.definir(null)
    aoExpirar()
  }
  if (!resposta.ok) throw new ApiError(resposta.status, corpo)

  return corpo as T
}
