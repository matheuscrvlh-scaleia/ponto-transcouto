import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Carregando, ErroCarregamento } from '../components/Estados'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { Horas } from '../components/Horas'
import { SeloTempoReal } from '../components/SeloTempoReal'
import { api } from '../lib/api'
import {
  dataDoInstante,
  formatarData,
  formatarDataHora,
  formatarHora,
  formatarHoraOuData,
  hojeISO,
  iniciais,
  somarDias,
} from '../lib/formato'
import { useIntervaloDaUrl } from '../lib/intervalo'
import { useRecurso } from '../lib/useRecurso'
import type { ColaboradorDetalhe, DiaHistorico, SemanaHistorico } from '../types/api'
import { TituloPagina } from '../components/TituloPagina'
import { PerfilIntervalo } from './PerfilIntervalo'
import { EstadoDoBanco } from './detalhe/EstadoDoBanco'
import { ExportarHistorico } from './detalhe/ExportarHistorico'
import { HistoricoComDias } from './detalhe/HistoricoComDias'

const LIMITE_HISTORICO = 26
/** Dias de histórico diário pedidos no tempo real (o server aceita 1..180). */
const DIAS_HISTORICO = 60

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

      <header className="dash-card pc-topo">
        <div className="pc-barra nao-imprimir">
          <Link to={voltarPara} className="voltar">
            <span aria-hidden="true">←</span> Voltar para {colaborador.unidade.nome}
          </Link>
          <div className="pc-acoes">
            <Link to={`/batidas?colaborador=${colaborador.id}`} className="btn-secondary pc-acao">
              Ver no log de batidas
            </Link>
            <ExportarHistorico colaborador={colaborador} />
          </div>
        </div>

        <div className="pc-identidade">
          <span className="avatar pc-avatar" aria-hidden="true">
            {iniciais(colaborador.nome)}
          </span>
          <div className="pc-identidade-texto">
            <h2 className="pc-nome">
              {colaborador.nome}
              {colaborador.ativo === false && <span className="badge badge-neutral badge-titulo">Inativo</span>}
            </h2>
            <p className="pc-cargo">{[colaborador.funcao, colaborador.unidade.nome].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        {colaborador.resumo && (
          <div className="pc-banco">
            <div className="pc-banco-saldo">
              <span className="pc-banco-rotulo">Saldo do período</span>
              <Horas minutos={colaborador.resumo.saldo_periodo_min} sinal destacar className="pc-banco-valor" />
              <span className="pc-banco-ref">
                {aoVivo && (
                  <>
                    <SeloTempoReal />{' '}
                  </>
                )}
                {referenciaResumo(colaborador.resumo, tempoReal)}
              </span>
            </div>
            <div className="pc-banco-estado">
              <EstadoDoBanco saldo={colaborador.resumo.saldo_periodo_min} limites={colaborador.limites} />
            </div>
            <div className="pc-banco-pagas">
              {/* o acumulado herda os períodos anteriores: só aparece aqui, não no painel */}
              <span className="pc-banco-rotulo">Banco acumulado</span>
              <Horas minutos={colaborador.resumo.saldo_min} sinal className="pc-banco-pagas-valor" />
              <span className="pc-banco-rotulo pc-banco-rotulo-seguinte">Pagas no período</span>
              <Horas minutos={colaborador.resumo.pagas_min} className="pc-banco-pagas-valor" />
            </div>
          </div>
        )}
      </header>

      <div className="pc-filtro nao-imprimir">
        <FiltroPeriodo
          escolhido={periodo.escolhido}
          atual={intervalo}
          de={periodo.deParam}
          ate={periodo.ateParam}
          onMudar={periodo.mudar}
        />
      </div>

      <PerfilIntervalo
        colaboradorId={colaborador.id}
        intervalo={intervalo}
        historico={<HistoricoComDias colaborador={colaborador} historico={dados.historico} diario={dados.diario} />}
      />
    </section>
  )
}
