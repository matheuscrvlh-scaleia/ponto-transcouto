import { datasDoPeriodo, hojeISO, PERIODOS_RAPIDOS, periodoRapidoDe, type PeriodoRapido } from '../lib/formato'
import type { Intervalo } from '../lib/intervalo'
import type { DataISO } from '../types/api'

interface Props {
  escolhido: Intervalo | null
  /** Datas como estão na URL (uma pode faltar). */
  de: DataISO | undefined
  ate: DataISO | undefined
  onMudar: (novo: Partial<Intervalo>) => void
}

/** Seleção rápida (hoje, ontem, esta semana, este mês) + De/Até. Sem datas, vale o período atual. */
export function FiltroPeriodo({ escolhido, de, ate, onMudar }: Props) {
  const hoje = hojeISO()
  const rapido = escolhido ? periodoRapidoDe(escolhido.de, escolhido.ate, hoje) : null

  return (
    <div className="colab-periodo" role="group" aria-label="Intervalo de datas">
      <label className="colab-campo">
        <span>Período</span>
        <select
          value={rapido ?? (escolhido ? 'livre' : '')}
          onChange={(event) => {
            const valor = event.target.value
            if (valor === '') onMudar({})
            else if (valor !== 'livre') onMudar(datasDoPeriodo(valor as PeriodoRapido, hoje))
          }}
        >
          <option value="">Período atual</option>
          {PERIODOS_RAPIDOS.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
          {/* datas escolhidas à mão: só aparece enquanto não batem com nenhuma seleção rápida */}
          {escolhido && !rapido && <option value="livre">Personalizado</option>}
        </select>
      </label>
      <label className="colab-campo">
        <span>De</span>
        <input
          type="date"
          value={escolhido?.de ?? ''}
          max={escolhido?.ate ?? hoje}
          onChange={(event) => onMudar({ de: event.target.value || undefined, ate })}
        />
      </label>
      <label className="colab-campo">
        <span>Até</span>
        <input
          type="date"
          value={escolhido?.ate ?? ''}
          min={escolhido?.de}
          max={hoje}
          onChange={(event) => onMudar({ de, ate: event.target.value || undefined })}
        />
      </label>
    </div>
  )
}
