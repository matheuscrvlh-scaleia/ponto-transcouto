import { formatarMinutos } from '../lib/formato'
import type { ForaDaCurva, Minutos } from '../types/api'

interface Props {
  valor: ForaDaCurva
  limite?: Minutos
  compacto?: boolean
}

export function IndicadorCurva({ valor, limite, compacto = false }: Props) {
  if (!valor) return null

  const positivo = valor === 'positivo'
  const texto = positivo ? 'Acima do limite' : 'Abaixo do limite'
  const dica = limite !== undefined ? `Limite configurado: ${positivo ? '' : '\u2212'}${formatarMinutos(limite)}` : undefined

  return (
    <span className={positivo ? 'curva curva-positiva' : 'curva curva-negativa'} title={dica}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d={positivo ? 'M5 1 9.5 9h-9L5 1Z' : 'M5 9 .5 1h9L5 9Z'} fill="currentColor" />
      </svg>
      {compacto ? <span className="sr-only">{texto}</span> : texto}
    </span>
  )
}
