import { useState } from 'react'
import type { Limites, LinhaDashboard, Minutos } from '../types/api'

interface Faixa {
  rotulo: string
  descricao: string
  teste: (saldo: Minutos) => boolean
}

/** 600 → "10h"; 450 → "7h30". */
function horasCurtas(min: Minutos) {
  const abs = Math.abs(Math.round(min))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function montarFaixas({ alerta_neg: neg, alerta_pos: pos }: Limites): Faixa[] {
  const meiaNeg = Math.round(neg / 2)
  const meiaPos = Math.round(pos / 2)
  return [
    {
      rotulo: `≤ −${horasCurtas(neg)}`,
      descricao: `Saldo de −${horasCurtas(neg)} ou menos (abaixo do limite)`,
      teste: (s) => s <= -neg,
    },
    {
      rotulo: `−${horasCurtas(neg)} a −${horasCurtas(meiaNeg)}`,
      descricao: `Saldo entre −${horasCurtas(neg)} e −${horasCurtas(meiaNeg)}`,
      teste: (s) => s > -neg && s <= -meiaNeg,
    },
    {
      rotulo: `−${horasCurtas(meiaNeg)} a 0`,
      descricao: `Saldo negativo menor que ${horasCurtas(meiaNeg)}`,
      teste: (s) => s > -meiaNeg && s < 0,
    },
    { rotulo: 'Zerado', descricao: 'Saldo zerado', teste: (s) => s === 0 },
    {
      rotulo: `0 a +${horasCurtas(meiaPos)}`,
      descricao: `Saldo positivo menor que ${horasCurtas(meiaPos)}`,
      teste: (s) => s > 0 && s < meiaPos,
    },
    {
      rotulo: `+${horasCurtas(meiaPos)} a +${horasCurtas(pos)}`,
      descricao: `Saldo entre +${horasCurtas(meiaPos)} e +${horasCurtas(pos)}`,
      teste: (s) => s >= meiaPos && s < pos,
    },
    {
      rotulo: `≥ +${horasCurtas(pos)}`,
      descricao: `Saldo de +${horasCurtas(pos)} ou mais (acima do limite)`,
      teste: (s) => s >= pos,
    },
  ]
}

/**
 * Distribuição dos colaboradores por faixa de saldo do banco (faixas derivadas dos limites
 * de alerta da unidade). A faixa ativa — a mais numerosa, ou a apontada — fica sólida.
 */
export function GraficoFaixas({ linhas, limites }: { linhas: LinhaDashboard[]; limites: Limites }) {
  const [apontada, setApontada] = useState<number | null>(null)

  const faixas = montarFaixas(limites)
  const contagens = faixas.map((faixa) => linhas.filter((linha) => faixa.teste(linha.saldo_min)).length)
  const maximo = Math.max(...contagens, 1)
  const moda = contagens.indexOf(Math.max(...contagens))
  const ativa = apontada ?? moda
  const total = linhas.length
  const percentual = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  return (
    <div className="faixas" onMouseLeave={() => setApontada(null)}>
      <ul className="faixas-colunas">
        {faixas.map((faixa, i) => {
          const n = contagens[i]
          const altura = n === 0 ? 4 : Math.max(10, (n / maximo) * 100)
          return (
            <li key={faixa.rotulo}>
              <button
                type="button"
                className={i === ativa ? 'faixa ativa' : 'faixa'}
                aria-label={`${faixa.descricao}: ${n} ${n === 1 ? 'colaborador' : 'colaboradores'}`}
                onMouseEnter={() => setApontada(i)}
                onFocus={() => setApontada(i)}
                onBlur={() => setApontada(null)}
                onClick={() => setApontada(i)}
              >
                <span className="faixa-trilho">
                  <span className={n === 0 ? 'faixa-barra vazia' : 'faixa-barra'} style={{ height: `${altura}%` }}>
                    {i === ativa && (
                      <span className="faixa-bolha" aria-hidden="true">
                        {n}
                      </span>
                    )}
                  </span>
                </span>
                <span className="faixa-rotulo" aria-hidden="true">
                  {faixa.rotulo}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="grafico-legenda">
        {faixas[ativa].descricao}: <strong>{contagens[ativa]}</strong>{' '}
        {contagens[ativa] === 1 ? 'colaborador' : 'colaboradores'} ({percentual(contagens[ativa])}%)
      </p>
    </div>
  )
}
