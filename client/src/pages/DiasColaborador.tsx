import { useState } from 'react'
import { Horas } from '../components/Horas'
import { api } from '../lib/api'
import { formatarData, formatarMinutos } from '../lib/formato'
import { useRecurso } from '../lib/useRecurso'
import type { DataISO, DiasColaborador as Resposta } from '../types/api'

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function diaDaSemana(data: DataISO) {
  const [a, m, d] = data.split('-').map(Number)
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

interface Props {
  colaboradorId: number
  de: DataISO
  ate: DataISO
}

/** Linha aberta em Colaboradores: as horas de cada dia do intervalo, somando o total da linha. */
export function DiasColaborador({ colaboradorId, de, ate }: Props) {
  const [todosOsDias, setTodosOsDias] = useState(false)
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<Resposta>(`/colaboradores/${colaboradorId}/dias`, { signal, query: { de, ate } }),
    `dias-${colaboradorId}-${de}-${ate}`,
  )

  if (carregando) return <p className="dias-colab-nota">Carregando os dias…</p>
  if (erro || !dados) {
    return (
      <p className="dias-colab-nota">
        Não foi possível carregar os dias.{' '}
        <button type="button" className="btn-link" onClick={recarregar}>
          Tentar de novo
        </button>
      </p>
    )
  }

  const intervalo = `${formatarData(de, { ano: false })} a ${formatarData(ate, { ano: false })}`
  if (dados.dias.length === 0) {
    return (
      <p className="dias-colab-nota">
        Ainda não há horas por dia de {intervalo}. Elas passam a ser gravadas a partir da próxima coleta da FriPonto.
      </p>
    )
  }

  const comHoras = dados.dias.filter((d) => d.extra_min > 0 || d.negativa_min > 0)
  const visiveis = todosOsDias ? dados.dias : comHoras
  const extra = dados.dias.reduce((soma, d) => soma + d.extra_min, 0)
  const negativa = dados.dias.reduce((soma, d) => soma + d.negativa_min, 0)
  const { extra_dia: limiteExtra, negativa_dia: limiteNegativa } = dados.limites
  const limites = [
    limiteExtra > 0 ? `extras acima de ${formatarMinutos(limiteExtra)}` : null,
    limiteNegativa > 0 ? `negativas acima de ${formatarMinutos(limiteNegativa)}` : null,
  ].filter(Boolean)

  return (
    <div className="dias-colab">
      <div className="dias-colab-topo">
        <span>
          Dia a dia de {intervalo}
          {limites.length > 0 && <> · limite diário: {limites.join(' ou ')}</>}
        </span>
        <button type="button" className="btn-link" onClick={() => setTodosOsDias((atual) => !atual)}>
          {todosOsDias ? 'Só dias com horas' : `Ver todos os ${dados.dias.length} dias`}
        </button>
      </div>

      {visiveis.length === 0 ? (
        <p className="dias-colab-nota">Nenhum dia com extras ou negativas em {intervalo}.</p>
      ) : (
        <table className="dias-colab-tabela">
          <caption className="sr-only">Horas por dia de {intervalo}</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Marcações</th>
              <th scope="col" className="num">
                Extras
              </th>
              <th scope="col" className="num">
                Negativas
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((d) => (
              <tr key={d.dia} className={d.extra_acima || d.negativa_acima ? 'dia-acima' : undefined}>
                <th scope="row">
                  <span className="dias-colab-semana">{diaDaSemana(d.dia)}</span> {formatarData(d.dia, { ano: false })}
                  {(d.extra_acima || d.negativa_acima) && <span className="selo-limite-dia">acima do limite</span>}
                </th>
                <td className="dias-colab-marcacoes">{d.marcacoes.length ? d.marcacoes.join(' · ') : '—'}</td>
                <td className={d.extra_acima ? 'num forte' : 'num'}>
                  {d.extra_min ? <Horas minutos={d.extra_min} /> : <span className="dias-colab-zero">—</span>}
                </td>
                <td className={d.negativa_acima ? 'num forte' : 'num'}>
                  {d.negativa_min ? <Horas minutos={d.negativa_min} /> : <span className="dias-colab-zero">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total de {intervalo}
              </th>
              <td className="num">
                <Horas minutos={extra} />
              </td>
              <td className="num">
                <Horas minutos={negativa} />
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
