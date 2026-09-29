import { SecullumError, type GanchosChamada } from './tipos'

export type OpcoesRequisicao = {
    rota: string
    timeoutMs: number
    tentativas: number
    backoffMs: number
    ganchos?: GanchosChamada
}

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function retryAfterMs(res: Response) {
    const valor = res.headers.get('retry-after')
    if (!valor) return undefined
    const segundos = Number(valor)
    if (!Number.isNaN(segundos)) return segundos * 1000
    const data = Date.parse(valor)
    return Number.isNaN(data) ? undefined : Math.max(0, data - Date.now())
}

async function lerCorpo(res: Response): Promise<unknown> {
    const texto = await res.text()
    if (!texto) return null
    try {
        return JSON.parse(texto)
    } catch {
        return texto
    }
}

function mensagemDoCorpo(corpo: unknown): string | null {
    if (!corpo) return null
    if (typeof corpo === 'string') return corpo.slice(0, 300)
    if (Array.isArray(corpo)) {
        const msgs = corpo.map(e => (e && typeof e === 'object' ? (e.Message ?? e.message) : null)).filter(Boolean)
        return msgs.length ? msgs.join('; ') : null
    }
    if (typeof corpo === 'object') {
        const o = corpo as Record<string, unknown>
        return String(o.error_description ?? o.detail ?? o.title ?? o.error ?? o.Message ?? o.message ?? '') || null
    }
    return null
}

function erroDaResposta(res: Response, corpo: unknown, rota: string) {
    const msg = mensagemDoCorpo(corpo) ?? `HTTP ${res.status}`
    const texto = `Secullum ${rota}: ${msg}`
    if (res.status === 401 || res.status === 403) return new SecullumError(texto, 'auth', res.status, corpo)
    if (res.status === 429 || /limite de requisi|requisi[çc][õo]es por hora|too many requests/i.test(msg)) {
        return new SecullumError(texto, 'rate_limit', res.status, corpo, retryAfterMs(res))
    }
    if (res.status === 404) return new SecullumError(texto, 'nao_encontrado', res.status, corpo)
    if (res.status >= 500) return new SecullumError(texto, 'servidor', res.status, corpo)
    return new SecullumError(texto, 'validacao', res.status, corpo)
}

export async function requisitar(url: string, init: RequestInit, opcoes: OpcoesRequisicao): Promise<unknown> {
    let ultimoErro: SecullumError | null = null

    for (let tentativa = 1; tentativa <= opcoes.tentativas; tentativa++) {
        await opcoes.ganchos?.antes?.(opcoes.rota)
        const inicio = Date.now()
        let status: number | null = null
        try {
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opcoes.timeoutMs) })
            status = res.status
            const corpo = await lerCorpo(res)
            if (res.ok) return corpo
            ultimoErro = erroDaResposta(res, corpo, opcoes.rota)
        } catch (err) {
            const nome = (err as Error).name
            const motivo = nome === 'TimeoutError' || nome === 'AbortError' ? 'tempo esgotado' : (err as Error).message
            ultimoErro = new SecullumError(`Secullum ${opcoes.rota}: ${motivo}`, 'rede')
        } finally {
            await opcoes.ganchos?.depois?.(opcoes.rota, status, Date.now() - inicio)
        }

        const podeRepetir = ultimoErro.tipo === 'servidor' || ultimoErro.tipo === 'rede'
            || (ultimoErro.tipo === 'rate_limit' && (ultimoErro.retryAfterMs ?? Infinity) <= 30000)
        if (!podeRepetir || tentativa === opcoes.tentativas) break

        const espera = ultimoErro.retryAfterMs ?? opcoes.backoffMs * 4 ** (tentativa - 1)
        await esperar(espera + Math.floor(Math.random() * opcoes.backoffMs * 0.2))
    }

    throw ultimoErro
}
