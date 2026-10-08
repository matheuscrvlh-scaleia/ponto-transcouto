import { useState } from 'react'
import { api } from '../../lib/api'
import { alertarFalha } from '../../lib/alertas'
import { baixarCsv, imprimirComoPdf, minutosCsv, paraNomeArquivo, type CelulaCsv } from '../../lib/exportar'
import { formatarData, formatarDataHora, hojeISO, somarDias } from '../../lib/formato'
import { analisarDia } from '../../lib/historico-dias'
import type { ColaboradorDetalhe, DiaHistorico, DiasDetalhe, SemanaHistorico } from '../../types/api'

/** No CSV vai o máximo que a API devolve: 104 semanas (2 anos) ou 180 dias. */
const LIMITE_EXPORTACAO = 104
const DIAS_EXPORTACAO = 180

const COLUNAS_PERIODO = ['Extras no período', 'Negativas no período', 'Pagas no período', 'Banco no período', 'Saldo acumulado']

const valoresPeriodo = (item: SemanaHistorico | DiaHistorico): CelulaCsv[] => [
  minutosCsv(item.extra_periodo),
  minutosCsv(item.negativa_periodo),
  minutosCsv(item.pagas_periodo),
  minutosCsv(item.banco_periodo),
  minutosCsv(item.saldo_total),
]

/** Um dia por linha: batidas usadas no cálculo, o que o dia teve de extra e negativa e se passou do limite diário. */
function linhasDosDias(detalhe: DiasDetalhe): CelulaCsv[][] {
  const dias = [...detalhe.dias].sort((a, b) => b.dia.localeCompare(a.dia))
  return [
    [],
    ['Horas de cada dia'],
    [
      `Limite diário: extras acima de ${minutosCsv(detalhe.limites.extra_dia) || '00:00'}, negativas acima de ${minutosCsv(detalhe.limites.negativa_dia) || '00:00'} (00:00 = sem limite)`,
    ],
    ['Dia', 'Batidas usadas no cálculo', 'Situação', 'Trabalhadas pelas batidas', 'Extra do dia', 'Negativa do dia', 'Acima do limite diário', 'Conferir'],
    ...dias.map((bruto) => {
      const dia = analisarDia(bruto)
      return [
        formatarData(dia.dia),
        dia.marcacoes.map((m) => m.hora).join(' '),
        dia.situacao ?? '',
        dia.temCalculo ? minutosCsv(dia.trabalhado) : '',
        dia.temCalculo ? minutosCsv(dia.extra) : '',
        dia.temCalculo ? minutosCsv(dia.negativa) : '',
        dia.extraAcima || dia.negativaAcima ? 'Sim' : 'Não',
        dia.avisos.join(' '),
      ]
    }),
  ]
}

/** Linhas do CSV: identificação do colaborador e, depois, o histórico (mais recente primeiro) e os dias. */
function linhasCsv(
  colaborador: ColaboradorDetalhe,
  historico: SemanaHistorico[],
  diario: DiaHistorico[],
  detalhe: DiasDetalhe | null,
): CelulaCsv[][] {
  const identificacao: CelulaCsv[][] = [
    ['Colaborador', colaborador.nome],
    ['Unidade', colaborador.unidade.nome],
    ['Função', colaborador.funcao ?? ''],
    ['Exportado em', formatarDataHora(new Date().toISOString())],
    ['Horas em HH:MM; valores negativos com "-"'],
    [],
  ]
  const recentes = [...historico].sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))
  const dias = detalhe ? linhasDosDias(detalhe) : []

  if (colaborador.modo_extracao !== 'tempo_real') {
    return [
      ...identificacao,
      ['Referência', 'Início do período', 'Fechamento do mês', 'Unidade', 'Extras na semana', 'Negativas na semana',
        'Pagas na semana', 'Banco na semana', ...COLUNAS_PERIODO],
      ...recentes.map((semana) => [
        formatarData(semana.data_referencia),
        formatarData(semana.periodo_inicio),
        semana.semana_fechamento_mes ? 'Sim' : 'Não',
        semana.unidade.nome,
        minutosCsv(semana.extra_semana),
        minutosCsv(semana.negativa_semana),
        minutosCsv(semana.pagas_semana),
        minutosCsv(semana.banco_semana),
        ...valoresPeriodo(semana),
      ]),
      ...dias,
    ]
  }

  // tempo real: histórico por dia e, abaixo, os fechamentos do mês (registro oficial)
  const diasGravados = [...diario].sort((a, b) => b.dia.localeCompare(a.dia))
  const fechamentos = recentes.filter((item) => item.semana_fechamento_mes)
  return [
    ...identificacao,
    ['Histórico diário'],
    ['Dia', 'Início do período', 'Unidade', 'Extras do dia', 'Negativas do dia', 'Pagas do dia', 'Banco do dia',
      ...COLUNAS_PERIODO, 'Atualizado em'],
    ...diasGravados.map((dia) => [
      formatarData(dia.dia),
      formatarData(dia.periodo_inicio),
      dia.unidade.nome,
      minutosCsv(dia.extra_dia),
      minutosCsv(dia.negativa_dia),
      minutosCsv(dia.pagas_dia),
      minutosCsv(dia.banco_dia),
      ...valoresPeriodo(dia),
      formatarDataHora(dia.atualizado_em),
    ]),
    [],
    ['Fechamentos do mês'],
    ['Fechamento', 'Início do período', 'Unidade', ...COLUNAS_PERIODO],
    ...fechamentos.map((item) => [
      formatarData(item.data_referencia),
      formatarData(item.periodo_inicio),
      item.unidade.nome,
      ...valoresPeriodo(item),
    ]),
    ...dias,
  ]
}

/** Ações da página: baixar o histórico em CSV ou abrir a impressão do navegador para salvar em PDF. */
export function ExportarHistorico({ colaborador }: { colaborador: ColaboradorDetalhe }) {
  const [gerando, setGerando] = useState(false)

  async function baixar() {
    setGerando(true)
    try {
      const hoje = hojeISO()
      const [historico, diario, detalhe] = await Promise.all([
        api<SemanaHistorico[]>(`/colaboradores/${colaborador.id}/historico`, { query: { limite: LIMITE_EXPORTACAO } }),
        colaborador.modo_extracao === 'tempo_real'
          ? api<DiaHistorico[]>(`/colaboradores/${colaborador.id}/historico-diario`, { query: { dias: DIAS_EXPORTACAO } })
          : Promise.resolve([]),
        // o detalhe por dia é um complemento: se falhar, o CSV sai só com o histórico
        api<DiasDetalhe>(`/colaboradores/${colaborador.id}/dias-detalhe`, {
          query: { de: somarDias(hoje, -(DIAS_EXPORTACAO - 1)), ate: hoje },
          silencioso: true,
        }).catch(() => null),
      ])
      baixarCsv(`historico-${paraNomeArquivo(colaborador.nome)}-${hoje}.csv`, linhasCsv(colaborador, historico, diario, detalhe))
    } catch (err) {
      alertarFalha(err, 'Não foi possível gerar o arquivo.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <>
      <button type="button" className="dc-botao" onClick={baixar} disabled={gerando}>
        {gerando ? 'Gerando CSV...' : 'Baixar CSV'}
      </button>
      <button
        type="button"
        className="dc-botao"
        onClick={() => imprimirComoPdf(`Histórico - ${colaborador.nome}`)}
        title="Abre a impressão do navegador; escolha “Salvar como PDF”"
      >
        Salvar PDF
      </button>
    </>
  )
}
