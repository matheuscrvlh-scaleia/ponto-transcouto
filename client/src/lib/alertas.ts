/* Alertas do app inteiro (notificações no canto inferior direito, em <CentralAlertas />).
   Qualquer parte do código pode chamar alertar/alertarErro; a central só desenha. */

import { ApiError } from './api'

export type TipoAlerta = 'sucesso' | 'erro' | 'aviso' | 'info'

export interface Alerta {
  id: number
  tipo: TipoAlerta
  titulo: string
  mensagem: string
}

type Ouvinte = (alerta: Alerta) => void

/** O mesmo alerta (mesma chave) não se repete dentro deste intervalo. */
const JANELA_REPETICAO_MS = 10_000

const TITULO_PADRAO: Record<TipoAlerta, string> = {
  sucesso: 'Tudo certo',
  erro: 'Algo deu errado',
  aviso: 'Atenção',
  info: 'Aviso',
}

const ouvintes = new Set<Ouvinte>()
const ultimosPorChave = new Map<string, number>()
let proximoId = 1

export function alertar({ tipo, titulo, mensagem, chave }: { tipo: TipoAlerta; titulo?: string; mensagem: string; chave?: string }) {
  const tituloFinal = titulo ?? TITULO_PADRAO[tipo]
  const agora = Date.now()
  const k = `${tipo}|${chave ?? `${tituloFinal}|${mensagem}`}`
  if (agora - (ultimosPorChave.get(k) ?? 0) < JANELA_REPETICAO_MS) return
  ultimosPorChave.set(k, agora)

  const alerta = { id: proximoId++, tipo, titulo: tituloFinal, mensagem }
  ouvintes.forEach((ouvinte) => ouvinte(alerta))
}

export function alertarSucesso(mensagem: string, titulo?: string) {
  alertar({ tipo: 'sucesso', titulo, mensagem })
}

export function alertarAviso(mensagem: string, titulo?: string) {
  alertar({ tipo: 'aviso', titulo, mensagem })
}

export function alertarInfo(mensagem: string, titulo?: string) {
  alertar({ tipo: 'info', titulo, mensagem })
}

export function alertarErro(entrada: string | { titulo?: string; mensagem: string; chave?: string }) {
  alertar({ tipo: 'erro', ...(typeof entrada === 'string' ? { mensagem: entrada } : entrada) })
}

/**
 * Alerta de uma ação que falhou (catch de um botão/formulário). Se a api() já alertou
 * esse erro sozinha (sem conexão, erro do servidor), não repete.
 */
export function alertarFalha(erro: unknown, padrao = 'Não foi possível concluir a operação.') {
  if (erro instanceof ApiError) {
    if (erro.alertado) return
    alertarErro({ titulo: tituloDoErroApi(erro.status), mensagem: erro.message })
    return
  }
  alertarErro({ mensagem: padrao })
}

export function ouvirAlertas(ouvinte: Ouvinte) {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/** Título padrão para um erro de API, pelo status HTTP. */
export function tituloDoErroApi(status: number) {
  if (status === 0) return 'Sem conexão com o servidor'
  if (status >= 500) return 'Erro no servidor'
  if (status === 429) return 'Muitas tentativas'
  if (status === 403) return 'Sem permissão'
  return 'Não foi possível concluir'
}
