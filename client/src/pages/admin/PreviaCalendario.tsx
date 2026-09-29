import { useState } from 'react'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento } from '../../components/Estados'
import { api } from '../../lib/api'
import { formatarData, formatarDiaSemana } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { CicloCalendario } from '../../types/api'
import { ModalGatilho, type CicloParaAjuste } from './ModalGatilho'

interface Props {
  /** Muda quando a régua foi alterada, para recarregar a prévia. */
  versao?: string | number
  podeAjustar?: boolean
  onAjustado?: () => void
}

export function PreviaCalendario({ versao = 0, podeAjustar = false, onAjustado }: Props) {
  const { empresaId, query } = useEmpresaSelecionada()
  const [ajustando, setAjustando] = useState<CicloParaAjuste | null>(null)
  const [agora] = useState(() => Date.now())
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<CicloCalendario[]>('/admin/calendario', { signal, query: { ...query, meses: 2 } }),
    `calendario-${empresaId}-${versao}`,
  )

  return (
    <section className="card card-tabela" aria-labelledby="titulo-calendario">
      <div className="card-tabela-titulo">
        <h2 id="titulo-calendario">Próximos fechamentos</h2>
        <p className="texto-suave">Datas em que a extração será disparada (próximos 2 meses, horário de Brasília).</p>
      </div>
      {carregando && <Carregando texto="Calculando calendário..." />}
      {erro && <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />}
      {dados && dados.length === 0 && <p className="texto-suave card-tabela-titulo">Nenhum fechamento previsto.</p>}
      {dados && dados.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Calendário de fechamentos previstos</caption>
            <thead>
              <tr>
                <th scope="col">Gatilho</th>
                <th scope="col">Dados até</th>
                <th scope="col">Tipo</th>
                <th scope="col">Situação</th>
                {podeAjustar && (
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {dados.map((ciclo) => (
                <tr key={`${ciclo.data_referencia}-${ciclo.tipo}`}>
                  <td>
                    {formatarDiaSemana(ciclo.gatilho_em)}
                    {ciclo.ajustado && (
                      <span className="celula-sub">Regra: {formatarDiaSemana(ciclo.gatilho_previsto_em)}</span>
                    )}
                  </td>
                  <td>
                    {formatarData(ciclo.periodo_inicio, { ano: false })} a {formatarData(ciclo.data_referencia, { ano: false })}
                  </td>
                  <td>{ciclo.tipo === 'fechamento_mes' ? <span className="badge badge-alerta">Fechamento do mês</span> : 'Semanal'}</td>
                  <td>
                    {ciclo.ajustado ? (
                      <span className="badge badge-alerta">Ajustado</span>
                    ) : ciclo.ciclo_id ? (
                      <span className="badge">Agendado</span>
                    ) : (
                      <span className="badge badge-neutral">Previsto</span>
                    )}
                  </td>
                  {podeAjustar && (
                    <td className="table-actions">
                      {ciclo.ciclo_id && new Date(ciclo.gatilho_em).getTime() > agora && (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() =>
                            setAjustando({
                              ciclo_id: ciclo.ciclo_id as number,
                              titulo: `dados até ${formatarData(ciclo.data_referencia, { ano: false })}`,
                              tipo: ciclo.tipo,
                              data_referencia: ciclo.data_referencia,
                              gatilho_em: ciclo.gatilho_em,
                              gatilho_previsto_em: ciclo.gatilho_previsto_em,
                            })
                          }
                        >
                          Ajustar gatilho
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ajustando && (
        <ModalGatilho
          ciclo={ajustando}
          onFechar={() => setAjustando(null)}
          onSalvo={() => {
            setAjustando(null)
            recarregar()
            onAjustado?.()
          }}
        />
      )}
    </section>
  )
}
