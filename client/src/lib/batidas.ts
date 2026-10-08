import type { Batida } from '../types/api'
import { formatarData } from './formato'

/* Marcações de ponto da FriPonto: rótulos usados no log de Batidas e no perfil do colaborador. */

/** Origem da marcação na FriPonto (FonteDados). */
export const ORIGENS: Record<number, string> = {
  0: 'Desconhecida',
  1: 'Relógio de ponto',
  2: 'Incluída manualmente',
  3: 'Pré-assinalada',
  4: 'Check-in',
  5: 'Central do Funcionário (web)',
  6: 'Aplicativo',
  7: 'Aplicativo (offline)',
  8: 'Integração externa',
}

export type Situacao = { rotulo: string; classe: 'original' | 'manual' | 'pre' | 'desconsiderada' }

export function situacaoDa(batida: Pick<Batida, 'tipo' | 'origem'>): Situacao {
  if (batida.tipo === 3) return { rotulo: 'Desconsiderada', classe: 'desconsiderada' }
  if (batida.tipo === 1 || batida.origem === 2) return { rotulo: 'Manual', classe: 'manual' }
  if (batida.tipo === 2) return { rotulo: 'Pré-assinalada', classe: 'pre' }
  return { rotulo: 'Original', classe: 'original' }
}

export const origemDa = (batida: Pick<Batida, 'origem'>) => ORIGENS[batida.origem] ?? `Origem ${batida.origem}`

/** "lançada em 01/10 às 09:12" — só quando a marcação entrou na FriPonto em outro dia ou horário. */
export function textoInclusao(batida: Pick<Batida, 'data' | 'hora' | 'incluida_em'>) {
  if (!batida.incluida_em) return null
  const [dia, horario = ''] = batida.incluida_em.split('T')
  const hora = horario.slice(0, 5)
  if (dia === batida.data && hora === batida.hora) return null
  return `lançada em ${formatarData(dia, { ano: false })} às ${hora}`
}
