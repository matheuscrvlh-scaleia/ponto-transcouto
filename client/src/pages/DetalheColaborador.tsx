import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { GraficoSemanas } from '../components/GraficoSemanas'
import { Horas } from '../components/Horas'
import { IndicadorCurva } from '../components/IndicadorCurva'
import { api } from '../lib/api'
import { formatarData, formatarMinutos } from '../lib/formato'
import { useRecurso } from '../lib/useRecurso'
import type { ColaboradorDetalhe, SemanaHistorico } from '../types/api'

const LIMITE_HISTORICO = 26

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
      return { colaborador, historico }
    },
    `colaborador-${colaboradorId}`,
  )

  useEffect(() => {
    document.title = dados ? `${dados.colaborador.nome} — Copiloto de Ponto` : 'Copiloto de Ponto'
  }, [dados])

  const origem = (location.state as { de?: string } | null)?.de

  if (carregando) return <Carregando texto="Carregando colaborador..." />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const { colaborador } = dados
  const recentes = [...dados.historico].sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))
  const cronologico = [...recentes].reverse()
  const voltarPara = origem ?? `/unidades/${unidadeId ?? colaborador.unidade.id}`
  const ultima = recentes[0]
  const anterior = recentes[1]

  return (
    <section className="pagina">
      <Link to={voltarPara} className="voltar">
        <span aria-hidden="true">←</span> Voltar para {colaborador.unidade.nome}
      </Link>

      <header className="detalhe-header">
        <div>
          <h1>
            {colaborador.nome}
            {colaborador.ativo === false && <span className="badge badge-neutral badge-titulo">Inativo</span>}
          </h1>
          <p className="pagina-sub">{[colaborador.unidade.nome, colaborador.funcao].filter(Boolean).join(' · ')}</p>
        </div>
        {colaborador.resumo && (
          <div className="detalhe-saldo">
            <span className="detalhe-saldo-rotulo">Banco acumulado atual</span>
            <Horas minutos={colaborador.resumo.saldo_min} sinal destacar className="detalhe-saldo-valor" />
            <span className="detalhe-saldo-ref">
              em {formatarData(colaborador.resumo.data_referencia)}
              {colaborador.fora_da_curva && (
                <>
                  {' '}
                  <IndicadorCurva
                    valor={colaborador.fora_da_curva}
                    limite={
                      colaborador.fora_da_curva === 'positivo'
                        ? colaborador.limites.alerta_pos
                        : colaborador.limites.alerta_neg
                    }
                  />
                </>
              )}
            </span>
          </div>
        )}
      </header>

      {colaborador.resumo && (
        <dl className="kpis kpis-3">
          <div className="kpi">
            <dt>Extras no período</dt>
            <dd>
              <Horas minutos={colaborador.resumo.extra_min} />
            </dd>
          </div>
          <div className="kpi">
            <dt>Negativas no período</dt>
            <dd>
              <Horas minutos={colaborador.resumo.negativa_min} />
            </dd>
          </div>
          <div className="kpi">
            <dt>Pagas no período</dt>
            <dd>
              <Horas minutos={colaborador.resumo.pagas_min} />
            </dd>
          </div>
        </dl>
      )}

      {recentes.length === 0 ? (
        <EstadoVazio titulo="Ainda não há fechamentos para este colaborador">
          <p>Os dados aparecem aqui depois da próxima atualização semanal.</p>
        </EstadoVazio>
      ) : (
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
                <caption className="sr-only">Histórico semanal de horas de {colaborador.nome}</caption>
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
      )}
    </section>
  )
}
