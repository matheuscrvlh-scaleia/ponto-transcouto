import { formatarDuracao, formatarQuando } from './formato'

/* Mensagens que o worker grava nas execuções vêm com datas ISO em UTC e nomes internos da API
   (ex.: "Cota de Calcular esgotada; retoma em 2026-10-05T16:42:25.411Z."). Aqui viram texto de tela. */

const DATA_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g

export function mensagemAmigavel(mensagem: string): string {
  return mensagem
    .replace(/Cota de Calcular esgotada/gi, 'Cota da FriPonto esgotada')
    .replace(/;\s*retoma em/gi, '; retoma')
    .replace(/Nova tentativa em/gi, 'Nova tentativa')
    .replace(DATA_ISO, (iso) => (Number.isNaN(Date.parse(iso)) ? iso : formatarQuando(iso)))
}

/** A execução parou porque a cota da FriPonto acabou (não é erro: retoma sozinha). */
export function pausaPorCota(mensagem: string | null | undefined) {
  return Boolean(mensagem && /cota/i.test(mensagem))
}

/** Quanto uma execução de extração rodou: "durou 34 min", "pausou após 14s (cota)", "em andamento". */
export function textoDuracao(execucao: {
  iniciado_em: string
  finalizado_em: string | null
  status: string
  mensagem_erro: string | null
}) {
  if (!execucao.finalizado_em) return 'em andamento'
  const duracao = formatarDuracao(execucao.iniciado_em, execucao.finalizado_em)
  if (execucao.status === 'interrompida') {
    return pausaPorCota(execucao.mensagem_erro) ? `pausou após ${duracao} (cota)` : `parou após ${duracao}`
  }
  return `durou ${duracao}`
}
