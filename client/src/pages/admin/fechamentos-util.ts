import type { FechamentoAdmin } from '../../types/api'

/** Pendente com gatilho já passado: o worker deveria ter pegado. */
export function estaAtrasado(fechamento: Pick<FechamentoAdmin, 'status' | 'gatilho_em'>) {
  return fechamento.status === 'pendente' && new Date(fechamento.gatilho_em).getTime() < Date.now()
}
