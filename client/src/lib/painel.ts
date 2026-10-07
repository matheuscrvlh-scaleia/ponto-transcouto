import { useEffect } from 'react'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { api } from './api'
import { dataDoInstante, formatarData, formatarHoraOuData, hojeISO } from './formato'
import { useRecurso } from './useRecurso'
import type { DashboardUnidade, DataHoraISO, DataISO, FiltroDashboard, TempoRealDashboard } from '../types/api'

/* Dados do painel de banco de horas, usados pelo Dashboard e pela tela de Colaboradores. */

/** Linha da lista; no painel consolidado vem também com a unidade e os limites dela. */
export type LinhaPainel = DashboardUnidade['colaboradores'][number]

const MAX_POR_PAGINA = 500
/** No tempo real o painel se atualiza sozinho de tempos em tempos (mantendo filtros e rolagem). */
const INTERVALO_TEMPO_REAL_MS = 5 * 60_000

export const ORDEM_PADRAO = 'saldo_min.desc'

export const SEM_TEMPO_REAL: TempoRealDashboard = {
  ativo: false,
  colaboradores_ao_vivo: 0,
  atualizado_de: null,
  atualizado_ate: null,
  dados_ate: null,
}

/** Painel de uma unidade ou, sem `unidadeId`, consolidado de todas as unidades do usuário. */
export function usePainel(unidadeId: string | undefined) {
  const consolidado = !unidadeId
  const { query: empresaQuery } = useEmpresaAdmin()
  const recurso = useRecurso(
    (signal) =>
      api<DashboardUnidade>(consolidado ? '/dashboard' : `/unidades/${unidadeId}/dashboard`, {
        signal,
        // consolidado: a equipe vê só a empresa escolhida na barra lateral (sem escolha = todas)
        query: { por_pagina: MAX_POR_PAGINA, ...(consolidado ? empresaQuery : {}) },
      }),
    `dashboard-${unidadeId ?? `todas-${empresaQuery.empresa_id ?? 'todas'}`}`,
  )

  // tempo real: busca de novo de tempos em tempos (os dados atuais continuam na tela)
  const { recarregar } = recurso
  const tempoRealAtivo = Boolean(recurso.dados?.tempo_real?.ativo)
  useEffect(() => {
    if (!tempoRealAtivo) return
    const timer = window.setInterval(recarregar, INTERVALO_TEMPO_REAL_MS)
    return () => window.clearInterval(timer)
  }, [tempoRealAtivo, recarregar])

  return recurso
}

/** Tela de Colaboradores da unidade (ou de todas), já com filtro e ordem. */
export function caminhoColaboradores(
  unidadeId?: number | string | null,
  {
    filtro = 'todos',
    ordem = ORDEM_PADRAO,
    intervalo,
  }: {
    /** 'limite': passou do limite diário (filtro só da tela de Colaboradores) */
    filtro?: FiltroDashboard | 'limite'
    ordem?: string
    /** intervalo de datas escolhido no Dashboard: a lista abre com o mesmo */
    intervalo?: { de: DataISO; ate: DataISO } | null
  } = {},
) {
  const params = new URLSearchParams()
  if (filtro !== 'todos') params.set('filtro', filtro)
  if (ordem !== ORDEM_PADRAO) params.set('ordem', ordem)
  if (intervalo) {
    params.set('de', intervalo.de)
    params.set('ate', intervalo.ate)
  }
  const base = unidadeId ? `/unidades/${unidadeId}/colaboradores` : '/colaboradores'
  return params.size ? `${base}?${params}` : base
}

/** Data dos dados ao vivo: "hoje" ou "dd/mm/aaaa". */
export function textoAte(data: DataISO | null) {
  if (!data) return 'hoje'
  return data === hojeISO() ? 'hoje' : formatarData(data)
}

/** "atualizados entre 09:12 e 10:47" / "atualizados às 10:47" (com a data quando não é hoje). */
export function textoAtualizados(de: DataHoraISO | null, ate: DataHoraISO | null) {
  const inicio = de ?? ate
  const fim = ate ?? de
  if (!inicio || !fim) return null
  const hoje = hojeISO()
  const comData = dataDoInstante(inicio) !== hoje || dataDoInstante(fim) !== hoje
  const a = formatarHoraOuData(inicio, { comData })
  const b = formatarHoraOuData(fim, { comData })
  return a === b ? `atualizados às ${a}` : `atualizados entre ${a} e ${b}`
}
