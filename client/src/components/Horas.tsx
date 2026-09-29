import { formatarMinutos, minutosPorExtenso } from '../lib/formato'
import type { Minutos } from '../types/api'

interface Props {
  minutos: Minutos
  sinal?: boolean
  destacar?: boolean
  className?: string
}

/** Horas formatadas com leitura acessível; negativo sempre com sinal e cor. */
export function Horas({ minutos, sinal = false, destacar = false, className = '' }: Props) {
  const classes = ['horas', destacar && minutos < 0 && 'horas-negativa', destacar && minutos > 0 && 'horas-positiva', className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      <span aria-hidden="true">{formatarMinutos(minutos, { sinal })}</span>
      <span className="sr-only">{minutosPorExtenso(minutos)}</span>
    </span>
  )
}
