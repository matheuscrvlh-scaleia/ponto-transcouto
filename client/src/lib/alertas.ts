/* Alertas de erro do app inteiro (aparecem no canto inferior esquerdo, em <CentralAlertas />).
   Qualquer parte do código pode chamar alertarErro; a central só desenha. */

export interface Alerta {
  id: number
  titulo: string
  mensagem: string
}

type Ouvinte = (alerta: Alerta) => void

/** O mesmo alerta (mesma chave) não se repete dentro deste intervalo. */
const JANELA_REPETICAO_MS = 10_000

const ouvintes = new Set<Ouvinte>()
const ultimosPorChave = new Map<string, number>()
let proximoId = 1

export function alertarErro({ titulo = 'Algo deu errado', mensagem, chave }: { titulo?: string; mensagem: string; chave?: string }) {
  const agora = Date.now()
  const k = chave ?? `${titulo}|${mensagem}`
  if (agora - (ultimosPorChave.get(k) ?? 0) < JANELA_REPETICAO_MS) return
  ultimosPorChave.set(k, agora)

  const alerta = { id: proximoId++, titulo, mensagem }
  ouvintes.forEach((ouvinte) => ouvinte(alerta))
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
