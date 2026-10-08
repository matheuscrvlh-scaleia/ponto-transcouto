import { useState, type ReactNode } from 'react'
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

/** Busca os dias e calcula o que as duas versões (linhas da tabela e cartão) mostram. */
function useDias({ colaboradorId, de, ate }: Props) {
  const [todosOsDias, setTodosOsDias] = useState(false)
  const recurso = useRecurso(
    (signal) => api<Resposta>(`/colaboradores/${colaboradorId}/dias`, { signal, query: { de, ate } }),
    `dias-${colaboradorId}-${de}-${ate}`,
  )
  const dias = recurso.dados?.dias ?? []
  const comHoras = dias.filter((d) => d.extra_min > 0 || d.negativa_min > 0)
  const limites = recurso.dados?.limites
  const textoLimites = [
    limites?.extra_dia ? `extras acima de ${formatarMinutos(limites.extra_dia)}` : null,
    limites?.negativa_dia ? `negativas acima de ${formatarMinutos(limites.negativa_dia)}` : null,
  ].filter(Boolean)

  return {
    ...recurso,
    dias,
    visiveis: todosOsDias ? dias : comHoras,
    todosOsDias,
    alternarTodos: () => setTodosOsDias((atual) => !atual),
    extra: dias.reduce((soma, d) => soma + d.extra_min, 0),
    negativa: dias.reduce((soma, d) => soma + d.negativa_min, 0),
    intervalo: `${formatarData(de, { ano: false })} a ${formatarData(ate, { ano: false })}`,
    textoLimites: textoLimites.length ? ` · limite diário: ${textoLimites.join(' ou ')}` : '',
  }
}

const horasOuTraco = (minutos: number) => (minutos ? <Horas minutos={minutos} /> : <span className="dias-colab-zero">—</span>)

/**
 * Linha aberta em Colaboradores (computador): os dias viram linhas da própria tabela, com as extras
 * e negativas de cada dia embaixo das colunas Extras e Negativas, e o total no fim.
 */
export function DiasColaboradorLinhas({ comPagas, ...props }: Props & { comPagas: boolean }) {
  const d = useDias(props)
  // Nome | Saldo | Extras | Negativas | (Pagas) | Indicador
  const totalColunas = comPagas ? 6 : 5
  const linhaUnica = (conteudo: ReactNode) => (
    <tr className="linha-dias-nota">
      <td colSpan={totalColunas}>{conteudo}</td>
    </tr>
  )

  if (d.carregando) return linhaUnica('Carregando os dias…')
  if (d.erro || !d.dados) {
    return linhaUnica(
      <>
        Não foi possível carregar os dias.{' '}
        <button type="button" className="btn-link" onClick={d.recarregar}>
          Tentar de novo
        </button>
      </>,
    )
  }
  if (d.dias.length === 0) return linhaUnica(`Ainda não há horas por dia de ${d.intervalo}.`)

  return (
    <>
      <tr className="linha-dias-topo">
        <td colSpan={totalColunas}>
          <span>
            Dia a dia de {d.intervalo}
            {d.textoLimites}
          </span>
          <button type="button" className="btn-link" onClick={d.alternarTodos}>
            {d.todosOsDias ? 'Só dias com horas' : `Ver todos os ${d.dias.length} dias`}
          </button>
        </td>
      </tr>
      {d.visiveis.length === 0 && linhaUnica(`Nenhum dia com extras ou negativas em ${d.intervalo}.`)}
      {d.visiveis.map((dia) => {
        const acima = dia.extra_acima || dia.negativa_acima
        return (
          <tr key={dia.dia} className={acima ? 'linha-dia dia-acima' : 'linha-dia'}>
            <th scope="row" className="linha-dia-nome">
              <span className="linha-dia-data">
                <span className="dias-colab-semana">{diaDaSemana(dia.dia)}</span> {formatarData(dia.dia, { ano: false })}
              </span>
              <span className="linha-dia-marcacoes">{dia.marcacoes.length ? dia.marcacoes.join(' · ') : 'sem marcações'}</span>
            </th>
            <td />
            <td className={dia.extra_acima ? 'num forte' : 'num'}>{horasOuTraco(dia.extra_min)}</td>
            <td className={dia.negativa_acima ? 'num forte' : 'num'}>{horasOuTraco(dia.negativa_min)}</td>
            {comPagas && <td />}
            <td>{acima && <span className="selo-limite-dia">acima do limite</span>}</td>
          </tr>
        )
      })}
      <tr className="linha-dia-total">
        <th scope="row" className="linha-dia-nome">
          Total de {d.intervalo}
        </th>
        <td />
        <td className="num">
          <Horas minutos={d.extra} />
        </td>
        <td className="num">
          <Horas minutos={d.negativa} />
        </td>
        {comPagas && <td />}
        <td />
      </tr>
    </>
  )
}

/** Cartão aberto em Colaboradores (celular): tabela compacta com dia, extras e negativas. */
export function DiasColaborador(props: Props) {
  const d = useDias(props)

  if (d.carregando) return <p className="dias-colab-nota">Carregando os dias…</p>
  if (d.erro || !d.dados) {
    return (
      <p className="dias-colab-nota">
        Não foi possível carregar os dias.{' '}
        <button type="button" className="btn-link" onClick={d.recarregar}>
          Tentar de novo
        </button>
      </p>
    )
  }
  if (d.dias.length === 0) return <p className="dias-colab-nota">Ainda não há horas por dia de {d.intervalo}.</p>

  return (
    <div className="dias-colab">
      <div className="dias-colab-topo">
        <span>
          Dia a dia de {d.intervalo}
          {d.textoLimites}
        </span>
        <button type="button" className="btn-link" onClick={d.alternarTodos}>
          {d.todosOsDias ? 'Só dias com horas' : `Ver todos os ${d.dias.length} dias`}
        </button>
      </div>

      {d.visiveis.length === 0 ? (
        <p className="dias-colab-nota">Nenhum dia com extras ou negativas em {d.intervalo}.</p>
      ) : (
        <table className="dias-colab-tabela">
          <caption className="sr-only">Horas por dia de {d.intervalo}</caption>
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
            {d.visiveis.map((dia) => (
              <tr key={dia.dia} className={dia.extra_acima || dia.negativa_acima ? 'dia-acima' : undefined}>
                <th scope="row">
                  <span className="dias-colab-semana">{diaDaSemana(dia.dia)}</span> {formatarData(dia.dia, { ano: false })}
                  {(dia.extra_acima || dia.negativa_acima) && <span className="selo-limite-dia">acima do limite</span>}
                </th>
                <td className="dias-colab-marcacoes">{dia.marcacoes.length ? dia.marcacoes.join(' · ') : '—'}</td>
                <td className={dia.extra_acima ? 'num forte' : 'num'}>{horasOuTraco(dia.extra_min)}</td>
                <td className={dia.negativa_acima ? 'num forte' : 'num'}>{horasOuTraco(dia.negativa_min)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total de {d.intervalo}
              </th>
              <td className="num">
                <Horas minutos={d.extra} />
              </td>
              <td className="num">
                <Horas minutos={d.negativa} />
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
