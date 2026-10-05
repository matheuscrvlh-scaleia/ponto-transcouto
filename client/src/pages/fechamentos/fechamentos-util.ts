import type { FechamentoAdmin, TipoCiclo } from '../../types/api'

/** Pendente com gatilho já passado: o worker deveria ter pegado. */
export function estaAtrasado(fechamento: Pick<FechamentoAdmin, 'status' | 'gatilho_em'>) {
  return fechamento.status === 'pendente' && new Date(fechamento.gatilho_em).getTime() < Date.now()
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
  if (fechamento.status === 'processando') return 'andamento'
  if (fechamento.status === 'falhou' || estaAtrasado(fechamento)) return 'atencao'
  if (fechamento.status === 'cancelado') return 'cancelado'
  return 'pendente'
}

export const NOME_TIPO: Record<TipoCiclo, string> = {
  semanal: 'Semanal',
  fechamento_mes: 'Fechamento do mês',
}
