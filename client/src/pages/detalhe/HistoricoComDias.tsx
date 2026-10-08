import { useMemo } from 'react'
import { Carregando } from '../../components/Estados'
import { api } from '../../lib/api'
import { hojeISO, somarDias } from '../../lib/formato'
import { pontosDoGrafico, secoesSemanais, secoesTempoReal } from '../../lib/historico-dias'
import { useRecurso } from '../../lib/useRecurso'
import type { ColaboradorDetalhe, DiaHistorico, DiasDetalhe, SemanaHistorico } from '../../types/api'
import { HistoricoDias } from './HistoricoDias'

/** O servidor aceita intervalos de até 400 dias. */
const MAX_DIAS = 399
/** Sem fechamento nenhum, olha só o último mês. */
const DIAS_SEM_HISTORICO = 30

interface Props {
  colaborador: ColaboradorDetalhe
  /** Fechamentos (semanas) do colaborador, como vêm de GET /colaboradores/:id/historico. */
  historico: SemanaHistorico[]
  /** Histórico por dia do tempo real (vazio no modo semanal). */
  diario: DiaHistorico[]
}

/**
 * Histórico do colaborador com o detalhe de cada dia: busca as horas e as batidas por dia de todo o período do
 * histórico e monta as semanas (ou os períodos, no tempo real) com os dias dentro.
 */
export function HistoricoComDias({ colaborador, historico, diario }: Props) {
  const tempoReal = colaborador.modo_extracao === 'tempo_real'
  const hoje = hojeISO()
  const maisAntigo = [...historico.map((h) => h.periodo_inicio), ...diario.map((d) => d.periodo_inicio)].sort()[0]
  const limiteInferior = somarDias(hoje, -MAX_DIAS)
  const de = maisAntigo ? (maisAntigo < limiteInferior ? limiteInferior : maisAntigo) : somarDias(hoje, -DIAS_SEM_HISTORICO)

  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) =>
      api<DiasDetalhe>(`/colaboradores/${colaborador.id}/dias-detalhe`, { signal, query: { de, ate: hoje }, silencioso: true }),
    `historico-dias-${colaborador.id}-${de}-${hoje}`,
  )

  const dias = useMemo(() => dados?.dias ?? [], [dados])
  const secoes = useMemo(
    () => (tempoReal ? secoesTempoReal(diario, historico, dias) : secoesSemanais(historico, dias, hoje)),
    [tempoReal, diario, historico, dias, hoje],
  )
  const grafico = useMemo(() => pontosDoGrafico(secoes, historico, diario), [secoes, historico, diario])

  if (carregando) return <Carregando texto="Carregando o histórico..." />

  return (
    <HistoricoDias
      nome={colaborador.nome}
      tempoReal={tempoReal}
      secoes={secoes}
      grafico={grafico}
      limitesBanco={{ pos: colaborador.limites.alerta_pos, neg: colaborador.limites.alerta_neg }}
      limitesDia={dados?.limites ?? { extra_dia: 0, negativa_dia: 0 }}
      fechamentos={historico}
      detalheDisponivel={!erro}
      onTentarDeNovo={recarregar}
    />
  )
}
