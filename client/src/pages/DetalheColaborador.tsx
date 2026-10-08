import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { GraficoDias, GraficoSemanas } from '../components/GraficoSemanas'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { Horas } from '../components/Horas'
import { IndicadorCurva } from '../components/IndicadorCurva'
import { SeloTempoReal } from '../components/SeloTempoReal'
import { api } from '../lib/api'
import { baixarCsv, imprimirComoPdf, minutosCsv, paraNomeArquivo, type CelulaCsv } from '../lib/exportar'
import {
  dataDoInstante,
  formatarData,
  formatarDataHora,
  formatarHora,
  formatarHoraOuData,
  formatarMinutos,
  hojeISO,
  iniciais,
  somarDias,
} from '../lib/formato'
import { useIntervaloDaUrl } from '../lib/intervalo'
import { useRecurso } from '../lib/useRecurso'
import type { ColaboradorDetalhe, DiaHistorico, Minutos, SemanaHistorico } from '../types/api'
import { TituloPagina } from '../components/TituloPagina'
import { PerfilIntervalo } from './PerfilIntervalo'
import { alertarFalha } from '../lib/alertas'

const LIMITE_HISTORICO = 26
/** Dias de histórico diário pedidos no tempo real (o server aceita 1..180). */
const DIAS_HISTORICO = 60
const PRIMEIRO_DIA = 'Primeiro dia registrado no período'
/** No CSV vai o máximo que a API devolve: 104 semanas (2 anos) ou 180 dias. */
const LIMITE_EXPORTACAO = 104
const DIAS_EXPORTACAO = 180

type Resumo = NonNullable<ColaboradorDetalhe['resumo']>

/** Fotografia: "em dd/mm/aaaa"; tempo real: "Atualizado às HH:MM de hoje". */
function referenciaResumo(resumo: Resumo, tempoReal: boolean) {
  if (resumo.fonte !== 'tempo_real') {
    // empresa em tempo real, mas este colaborador ainda não teve a vez dele na atualização ao vivo
    return tempoReal
      ? `Aguardando atualização ao vivo · dados de ${formatarData(resumo.data_referencia)}`
      : `em ${formatarData(resumo.data_referencia)}`
  }
  if (resumo.atualizado_em) {
    return dataDoInstante(resumo.atualizado_em) === hojeISO()
      ? `Atualizado às ${formatarHora(resumo.atualizado_em)} de hoje`
      : `Atualizado em ${formatarHoraOuData(resumo.atualizado_em, { comData: true })}`
  }
  return resumo.data_referencia === hojeISO() ? 'Dados até hoje' : `Dados até ${formatarData(resumo.data_referencia)}`
}

/** Valor do dia; null (primeiro dia registrado no período) aparece como "—". */
function HorasDia({ minutos, sinal }: { minutos: Minutos | null; sinal?: boolean }) {
  if (minutos === null) {
    return (
      <span className="texto-suave" title={PRIMEIRO_DIA}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{PRIMEIRO_DIA}</span>
      </span>
    )
  }
  return <Horas minutos={minutos} sinal={sinal} destacar={sinal} />
}

export function DetalheColaborador() {
  const { unidadeId, colaboradorId } = useParams()
  const location = useLocation()
  const { dados, erro, carregando, recarregar } = useRecurso(
    async (signal) => {
      const [colaborador, historico] = await Promise.all([
        api<ColaboradorDetalhe>(`/colaboradores/${colaboradorId}`, { signal }),
        api<SemanaHistorico[]>(`/colaboradores/${colaboradorId}/historico`, {
          signal,
          query: { limite: LIMITE_HISTORICO },
        }),
      ])
      // histórico por dia só existe para empresa em tempo real
      const diario =
        colaborador.modo_extracao === 'tempo_real'
          ? await api<DiaHistorico[]>(`/colaboradores/${colaboradorId}/historico-diario`, {
              signal,
              query: { dias: DIAS_HISTORICO },
            })
          : []
      return { colaborador, historico, diario }
    },
    `colaborador-${colaboradorId}`,
  )

  useEffect(() => {
    document.title = dados ? `${dados.colaborador.nome} Copiloto de Ponto` : 'Copiloto de Ponto'
  }, [dados])

  const origem = (location.state as { de?: string } | null)?.de
  // datas na URL: o filtro de período do perfil (mesmo do Dashboard e de Colaboradores)
  const periodo = useIntervaloDaUrl()

  if (carregando) return <Carregando texto="Carregando colaborador..." />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const { colaborador } = dados
  const tempoReal = colaborador.modo_extracao === 'tempo_real'
  const voltarPara = origem ?? `/unidades/${unidadeId ?? colaborador.unidade.id}`
  const aoVivo = colaborador.resumo?.fonte === 'tempo_real'
  const hoje = hojeISO()
  const intervalo = periodo.escolhido ??
    (colaborador.resumo
      ? { de: colaborador.resumo.periodo_inicio, ate: colaborador.resumo.data_referencia }
      : { de: somarDias(hoje, -29), ate: hoje })

  return (
    <section className="pagina">
      {/* o título fica na barra do topo, que não sai na impressão */}
      <div className="so-impressao impressao-cabecalho">
        <p className="impressao-titulo">Histórico de horas — {colaborador.nome}</p>
        <p>
          {[colaborador.unidade.nome, colaborador.funcao].filter(Boolean).join(' · ')} · Exportado em{' '}
          {formatarDataHora(new Date().toISOString())} · Copiloto de Ponto
        </p>
      </div>

      <TituloPagina>Colaborador</TituloPagina>

      <header className="dash-card perfil-topo">
        <div className="perfil-barra nao-imprimir">
          <Link to={voltarPara} className="voltar">
            <span aria-hidden="true">←</span> Voltar para {colaborador.unidade.nome}
          </Link>
          <div className="perfil-acoes">
            <Link to={`/batidas?colaborador=${colaborador.id}`} className="btn-secondary perfil-acao">
              Ver no log de batidas
            </Link>
            <ExportarHistorico colaborador={colaborador} />
          </div>
        </div>

        <div className="perfil-identidade">
          <span className="avatar perfil-avatar" aria-hidden="true">
            {iniciais(colaborador.nome)}
          </span>
          <div className="perfil-identidade-texto">
            <h2 className="perfil-nome">
              {colaborador.nome}
              {colaborador.ativo === false && <span className="badge badge-neutral badge-titulo">Inativo</span>}
            </h2>
            <p className="perfil-cargo">{[colaborador.funcao, colaborador.unidade.nome].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        {colaborador.resumo && (
          <div className="perfil-banco">
            <span className="perfil-banco-rotulo">Banco acumulado atual</span>
            <Horas minutos={colaborador.resumo.saldo_min} sinal destacar className="perfil-banco-valor" />
            <span className="perfil-banco-ref">
              {aoVivo && (
                <>
                  <SeloTempoReal />{' '}
                </>
              )}
              {referenciaResumo(colaborador.resumo, tempoReal)}
            </span>
            {colaborador.fora_da_curva && (
              <IndicadorCurva
                valor={colaborador.fora_da_curva}
                limite={colaborador.fora_da_curva === 'positivo' ? colaborador.limites.alerta_pos : colaborador.limites.alerta_neg}
                pilula
              />
            )}
            <span className="perfil-banco-pagas">
              Pagas no período: <Horas minutos={colaborador.resumo.pagas_min} className="forte" />
            </span>
          </div>
        )}
      </header>

      <div className="perfil-filtro nao-imprimir">
        <FiltroPeriodo escolhido={periodo.escolhido} de={periodo.deParam} ate={periodo.ateParam} onMudar={periodo.mudar} />
      </div>

      <PerfilIntervalo
        colaboradorId={colaborador.id}
        intervalo={intervalo}
        historico={
          tempoReal ? (
            <HistoricoTempoReal nome={colaborador.nome} diario={dados.diario} historico={dados.historico} />
          ) : (
            <HistoricoSemanal nome={colaborador.nome} historico={dados.historico} />
          )
        }
      />
    </section>
  )
}

/* ---------- Exportar histórico (CSV e PDF) ---------- */

const COLUNAS_PERIODO = ['Extras no período', 'Negativas no período', 'Pagas no período', 'Banco no período', 'Saldo acumulado']

const valoresPeriodo = (item: SemanaHistorico | DiaHistorico): CelulaCsv[] => [
  minutosCsv(item.extra_periodo),
  minutosCsv(item.negativa_periodo),
  minutosCsv(item.pagas_periodo),
  minutosCsv(item.banco_periodo),
  minutosCsv(item.saldo_total),
]

/** Linhas do CSV: identificação do colaborador e, depois, o histórico (mais recente primeiro). */
function linhasCsv(colaborador: ColaboradorDetalhe, historico: SemanaHistorico[], diario: DiaHistorico[]): CelulaCsv[][] {
  const identificacao: CelulaCsv[][] = [
    ['Colaborador', colaborador.nome],
    ['Unidade', colaborador.unidade.nome],
    ['Função', colaborador.funcao ?? ''],
    ['Exportado em', formatarDataHora(new Date().toISOString())],
    ['Horas em HH:MM; valores negativos com "-"'],
    [],
  ]
  const recentes = [...historico].sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))

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
    ]
  }

  // tempo real: histórico por dia e, abaixo, os fechamentos do mês (registro oficial)
  const dias = [...diario].sort((a, b) => b.dia.localeCompare(a.dia))
  const fechamentos = recentes.filter((item) => item.semana_fechamento_mes)
  return [
    ...identificacao,
    ['Histórico diário'],
    ['Dia', 'Início do período', 'Unidade', 'Extras do dia', 'Negativas do dia', 'Pagas do dia', 'Banco do dia',
      ...COLUNAS_PERIODO, 'Atualizado em'],
    ...dias.map((dia) => [
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
  ]
}

function ExportarHistorico({ colaborador }: { colaborador: ColaboradorDetalhe }) {
  const [gerando, setGerando] = useState(false)

  async function baixar() {
    setGerando(true)
    try {
      const [historico, diario] = await Promise.all([
        api<SemanaHistorico[]>(`/colaboradores/${colaborador.id}/historico`, { query: { limite: LIMITE_EXPORTACAO } }),
        colaborador.modo_extracao === 'tempo_real'
          ? api<DiaHistorico[]>(`/colaboradores/${colaborador.id}/historico-diario`, { query: { dias: DIAS_EXPORTACAO } })
          : Promise.resolve([]),
      ])
      baixarCsv(`historico-${paraNomeArquivo(colaborador.nome)}-${hojeISO()}.csv`, linhasCsv(colaborador, historico, diario))
    } catch (err) {
      alertarFalha(err, 'Não foi possível gerar o arquivo.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="exportar nao-imprimir">
      <button type="button" className="btn-secondary" onClick={baixar} disabled={gerando}>
        {gerando ? 'Gerando CSV...' : 'Baixar CSV'}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => imprimirComoPdf(`Histórico - ${colaborador.nome}`)}
        title="Abre a impressão do navegador; escolha “Salvar como PDF”"
      >
        Salvar PDF
      </button>
    </div>
  )
}

/* ---------- Modo semanal: fotografias semanais ---------- */

function HistoricoSemanal({ nome, historico }: { nome: string; historico: SemanaHistorico[] }) {
  const recentes = [...historico].sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))
  const cronologico = [...recentes].reverse()
  const ultima = recentes[0]
  const anterior = recentes[1]

  if (recentes.length === 0) {
    return (
      <EstadoVazio titulo="Ainda não há histórico para este colaborador">
        <p>Os dados aparecem aqui depois da próxima atualização.</p>
      </EstadoVazio>
    )
  }

  return (
    <>
      {cronologico.length > 1 && (
        <div className="card">
          <h2>Evolução do saldo por semana</h2>
          <p className="sr-only">
            {anterior
              ? `Saldo passou de ${formatarMinutos(anterior.saldo_total, { sinal: true })} para ${formatarMinutos(ultima.saldo_total, { sinal: true })} na última semana.`
              : ''}{' '}
            Os valores estão na tabela abaixo.
          </p>
          <GraficoSemanas semanas={cronologico} />
        </div>
      )}

      <div className="card card-tabela">
        <h2 className="card-tabela-titulo">Histórico semanal</h2>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Histórico semanal de horas de {nome}</caption>
            <thead>
              <tr>
                <th scope="col">Referência</th>
                <th scope="col" className="num">
                  Extras
                </th>
                <th scope="col" className="num">
                  Negativas
                </th>
                <th scope="col" className="num">
                  Pagas
                </th>
                <th scope="col" className="num">
                  Banco semana
                </th>
                <th scope="col" className="num">
                  Saldo acum.
                </th>
              </tr>
            </thead>
            <tbody>
              {recentes.map((semana) => (
                <tr key={semana.fechamento_id}>
                  <th scope="row">
                    {formatarData(semana.data_referencia)}
                    {semana.semana_fechamento_mes && <span className="badge badge-neutral badge-mini">mês</span>}
                  </th>
                  <td className="num">
                    <Horas minutos={semana.extra_semana} />
                  </td>
                  <td className="num">
                    <Horas minutos={semana.negativa_semana} />
                  </td>
                  <td className="num">
                    <Horas minutos={semana.pagas_semana} />
                  </td>
                  <td className="num">
                    <Horas minutos={semana.banco_semana} sinal destacar />
                  </td>
                  <td className="num">
                    <Horas minutos={semana.saldo_total} sinal destacar className="forte" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ---------- Modo tempo real: histórico por dia + fechamentos do mês ---------- */

interface PropsTempoReal {
  nome: string
  diario: DiaHistorico[]
  historico: SemanaHistorico[]
}

function HistoricoTempoReal({ nome, diario, historico }: PropsTempoReal) {
  const hoje = hojeISO()
  const recentes = [...diario].sort((a, b) => b.dia.localeCompare(a.dia))
  const cronologico = [...recentes].reverse()
  const ultimo = recentes[0]
  const anterior = recentes[1]
  // do /historico, no tempo real só interessam os registros oficiais (fechamento do mês)
  const fechamentos = historico
    .filter((item) => item.semana_fechamento_mes)
    .sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))

  return (
    <>
      {recentes.length === 0 ? (
        <EstadoVazio titulo="Ainda não há histórico diário para este colaborador">
          <p>O histórico diário começa a ser gravado a partir de agora, a cada atualização ao vivo.</p>
        </EstadoVazio>
      ) : (
        <>
          {cronologico.length > 1 && (
            <div className="card">
              <h2>Evolução do saldo por dia</h2>
              <p className="sr-only">
                {anterior
                  ? `Saldo passou de ${formatarMinutos(anterior.saldo_total, { sinal: true })} para ${formatarMinutos(ultimo.saldo_total, { sinal: true })} no último dia registrado.`
                  : ''}{' '}
                Os valores estão na tabela abaixo.
              </p>
              <GraficoDias dias={cronologico} />
            </div>
          )}

          <div className="card card-tabela">
            <h2 className="card-tabela-titulo">Histórico diário</h2>
            <p className="card-tabela-sub">
              Gravado a cada atualização ao vivo. Os valores do dia são a diferença para o dia anterior registrado no mesmo
              período.
            </p>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Histórico diário de horas de {nome}</caption>
                <thead>
                  <tr>
                    <th scope="col">Dia</th>
                    <th scope="col" className="num">
                      Extras do dia
                    </th>
                    <th scope="col" className="num">
                      Negativas do dia
                    </th>
                    <th scope="col" className="num">
                      Banco do dia
                    </th>
                    <th scope="col" className="num">
                      Saldo acum.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((dia) => (
                    <tr key={dia.dia}>
                      <th scope="row" title={`Atualizado em ${formatarDataHora(dia.atualizado_em)}`}>
                        {formatarData(dia.dia)}
                        {dia.dia === hoje && <span className="badge badge-neutral badge-mini">hoje</span>}
                      </th>
                      <td className="num">
                        <HorasDia minutos={dia.extra_dia} />
                      </td>
                      <td className="num">
                        <HorasDia minutos={dia.negativa_dia} />
                      </td>
                      <td className="num">
                        <HorasDia minutos={dia.banco_dia} sinal />
                      </td>
                      <td className="num">
                        <Horas minutos={dia.saldo_total} sinal destacar className="forte" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card card-tabela">
        <h2 className="card-tabela-titulo">Fechamentos do mês</h2>
        <p className="card-tabela-sub">
          Registro oficial gravado no dia do fechamento; o saldo dele passa para o mês seguinte.
        </p>
        {fechamentos.length === 0 ? (
          <p className="card-tabela-sub">Nenhum fechamento do mês gravado ainda para este colaborador.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Fechamentos do mês de {nome}</caption>
              <thead>
                <tr>
                  <th scope="col">Fechamento</th>
                  <th scope="col" className="num">
                    Extras no período
                  </th>
                  <th scope="col" className="num">
                    Negativas no período
                  </th>
                  <th scope="col" className="num">
                    Saldo acum.
                  </th>
                </tr>
              </thead>
              <tbody>
                {fechamentos.map((fechamento) => (
                  <tr key={fechamento.fechamento_id}>
                    <th scope="row" title={`Período de ${formatarData(fechamento.periodo_inicio)} a ${formatarData(fechamento.data_referencia)}`}>
                      {formatarData(fechamento.data_referencia)}
                    </th>
                    <td className="num">
                      <Horas minutos={fechamento.extra_periodo} />
                    </td>
                    <td className="num">
                      <Horas minutos={fechamento.negativa_periodo} />
                    </td>
                    <td className="num">
                      <Horas minutos={fechamento.saldo_total} sinal destacar className="forte" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
