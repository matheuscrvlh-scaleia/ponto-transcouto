import { ApiError } from './api'

export function mensagemDeErro(erro: unknown, padrao = 'Não foi possível concluir a operação.'): string {
  return erro instanceof ApiError ? erro.message : padrao
}

/** Primeiro erro de cada campo devolvido pelo server (`campos` do 400). */
export function errosDeCampos(erro: unknown): Record<string, string> {
  if (!(erro instanceof ApiError) || !erro.campos) return {}
  const saida: Record<string, string> = {}
  for (const [campo, mensagens] of Object.entries(erro.campos)) {
    if (mensagens?.length) saida[campo] = mensagens[0]
  }
  return saida
}
