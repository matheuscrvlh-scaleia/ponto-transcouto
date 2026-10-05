import { formatarQuando } from '../../lib/formato'
import { pausaPorCota } from '../../lib/mensagens'
import type { ExecucaoResumo, FechamentoAdmin, TipoCiclo } from '../../types/api'

type Base = Pick<FechamentoAdmin, 'status' | 'gatilho_em' | 'proxima_tentativa_em'> & {
  ultima_execucao?: FechamentoAdmin['ultima_execucao']
}

/** Folga antes de chamar de "atrasado": o worker passa a cada minuto. */
const TOLERANCIA_MS = 5 * 60_000

function futuro(iso: string | null) {
  return iso != null && new Date(iso).getTime() > Date.now()
}

/** Pendente com retomada já marcada para depois (cota da FriPonto ou nova tentativa após falha). */
export function aguardandoRetomada(fechamento: Base) {
  return fechamento.status === 'pendente' && futuro(fechamento.proxima_tentativa_em)
}

/** Pausado porque a cota da FriPonto acabou: não é erro, retoma sozinho em `proxima_tentativa_em`. */
export function pausadoPorCota(fechamento: Base) {
  return aguardandoRetomada(fechamento) && pausaPorCota(fechamento.ultima_execucao?.mensagem_erro)
}

/**
 * Pendente que o worker já deveria ter pegado: passou do gatilho (e da retomada marcada, se houver).
 * Quem está esperando a cota voltar não está atrasado.
 */
export function estaAtrasado(fechamento: Base) {
  if (fechamento.status !== 'pendente' || aguardandoRetomada(fechamento)) return false
  const inicio = Math.max(
    new Date(fechamento.gatilho_em).getTime(),
    fechamento.proxima_tentativa_em ? new Date(fechamento.proxima_tentativa_em).getTime() : 0,
  )
  return inicio + TOLERANCIA_MS < Date.now()
}

/** Agrupamento usado nos filtros e nos contadores da tela. */
export type Situacao = 'publicado' | 'andamento' | 'pendente' | 'atencao' | 'cancelado'

export const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: 'publicado', rotulo: 'Publicados' },
  { valor: 'andamento', rotulo: 'Em andamento' },
  { valor: 'pendente', rotulo: 'Agendados' },
  { valor: 'atencao', rotulo: 'Precisam de atenção' },
]

export function situacaoDo(fechamento: FechamentoAdmin): Situacao {
  if (fechamento.status === 'sucesso') return 'publicado'
  // pausado pela cota (ou esperando nova tentativa) já começou: conta como em andamento
  if (fechamento.status === 'processando' || (aguardandoRetomada(fechamento) && fechamento.ultima_execucao)) return 'andamento'
  if (fechamento.status === 'falhou' || estaAtrasado(fechamento)) return 'atencao'
  if (fechamento.status === 'cancelado') return 'cancelado'
  return 'pendente'
}

export const NOME_TIPO: Record<TipoCiclo, string> = {
  semanal: 'Semanal',
  fechamento_mes: 'Fechamento do mês',
}

/** "Hoje às 12:59" — início de uma execução, com a primeira letra maiúscula (abre a célula). */
export function inicioExecucao(execucao: Pick<ExecucaoResumo, 'iniciado_em'>) {
  const texto = formatarQuando(execucao.iniciado_em)
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)
}
