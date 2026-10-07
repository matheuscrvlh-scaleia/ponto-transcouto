import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { api } from './api'
import { formatarData, hojeISO } from './formato'
import type { LinhaPainel } from './painel'
import { useRecurso } from './useRecurso'
import type { DataISO, HorasNoIntervalo } from '../types/api'

/* Intervalo de datas do Dashboard e de Colaboradores: fica na URL (?de=&ate=), então
   os atalhos de um para o outro levam o mesmo intervalo. Sem datas, vale o período atual. */

export type Intervalo = { de: DataISO; ate: DataISO }

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
const lerData = (valor: string | null) => (valor && DATA_ISO.test(valor) ? valor : undefined)

/** Período atual de uma lista: do início mais recente até o dado mais recente entre as linhas. */
function periodoDasLinhas(linhas: LinhaPainel[]): Intervalo | null {
  if (linhas.length === 0) return null
  const maior = (campo: 'periodo_inicio' | 'dados_ate') =>
    linhas.reduce((max, l) => (l[campo] > max ? l[campo] : max), linhas[0][campo])
  return { de: maior('periodo_inicio'), ate: maior('dados_ate') }
}

export function textoDoIntervalo({ de, ate }: Intervalo) {
  return de === ate ? formatarData(de) : `${formatarData(de)} a ${formatarData(ate)}`
}

/**
 * Intervalo escolhido na URL e as horas somadas por colaborador nele (GET /horas-dia).
 * Sem intervalo escolhido, busca o período atual das linhas: serve para contar os dias acima do limite diário.
 */
export function useHorasNoIntervalo(unidadeId: string | undefined, linhas: LinhaPainel[] | undefined) {
  const [params, setParams] = useSearchParams()
  const { query: empresaQuery } = useEmpresaAdmin()
  const hoje = hojeISO()

  // uma data só vale para a ponta que falta (sem "até": até hoje)
  const deParam = lerData(params.get('de'))
  const ateParam = lerData(params.get('ate'))
  const escolhido: Intervalo | null =
    deParam || ateParam ? { de: deParam ?? ateParam!, ate: ateParam ?? (deParam! > hoje ? deParam! : hoje) } : null
  const periodoAtual = useMemo(() => periodoDasLinhas(linhas ?? []), [linhas])
  const intervalo = escolhido ?? periodoAtual

  const horas = useRecurso(
    (signal) =>
      intervalo
        ? api<HorasNoIntervalo>('/horas-dia', {
            signal,
            query: { ...intervalo, unidade_id: unidadeId ? Number(unidadeId) : undefined, ...(unidadeId ? {} : empresaQuery) },
          })
        : Promise.resolve(null),
    `horas-dia-${unidadeId ?? `todas-${empresaQuery.empresa_id ?? 'todas'}`}-${intervalo?.de}-${intervalo?.ate}`,
  )
  const porColaborador = useMemo(() => new Map((horas.dados?.colaboradores ?? []).map((c) => [c.id, c])), [horas.dados])

  /** Intervalo na URL; sem datas, volta ao período atual. */
  function mudar(novo: Partial<Intervalo>) {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        for (const chave of ['de', 'ate'] as const) {
          const valor = novo[chave]
          if (valor) proximo.set(chave, valor)
          else proximo.delete(chave)
        }
        return proximo
      },
      { replace: true },
    )
  }

  // dias gravados só até a última coleta: o fim do intervalo pode estar além
  const horasAte = horas.dados?.dados_ate ?? null
  const alemDosDados = Boolean(escolhido && !horas.carregando && (!horasAte || horasAte < escolhido.ate))

  return { escolhido, deParam, ateParam, horas, porColaborador, horasAte, alemDosDados, mudar }
}

/** Aviso de até onde há horas por dia, quando o intervalo vai além (texto para juntar a uma nota). */
export function textoAlemDosDados(horasAte: DataISO | null) {
  return horasAte
    ? ` Horas por dia gravadas até ${formatarData(horasAte)}: os dias depois disso entram na próxima coleta.`
    : ' Ainda não há horas por dia neste intervalo: elas são gravadas a partir da próxima coleta.'
}
