import { IconeCheck } from '../../components/Icones'
import { formatarMinutos } from '../../lib/formato'
import type { Limites, Minutos } from '../../types/api'
import './detalhe.css'

export type TipoEstado = 'acima' | 'abaixo' | 'dentro'

/** Onde o saldo está em relação aos limites do banco (mesma regra do alerta: no limite já conta como fora). */
function estadoDoLimite(saldo: Minutos, { alerta_pos, alerta_neg }: Limites): { tipo: TipoEstado; texto: string } {
  if (saldo >= alerta_pos) {
    return { tipo: 'acima', texto: `${formatarMinutos(saldo - alerta_pos)} acima do limite de +${formatarMinutos(alerta_pos)}` }
  }
  if (saldo <= -alerta_neg) {
    return { tipo: 'abaixo', texto: `${formatarMinutos(-saldo - alerta_neg)} abaixo do limite de −${formatarMinutos(alerta_neg)}` }
  }
  if (saldo > 0) {
    return { tipo: 'dentro', texto: `Dentro do limite · faltam ${formatarMinutos(alerta_pos - saldo)} para +${formatarMinutos(alerta_pos)}` }
  }
  if (saldo < 0) {
    return { tipo: 'dentro', texto: `Dentro do limite · faltam ${formatarMinutos(alerta_neg + saldo)} para −${formatarMinutos(alerta_neg)}` }
  }
  return { tipo: 'dentro', texto: 'Dentro do limite · banco zerado' }
}

function IconeEstado({ tipo }: { tipo: TipoEstado }) {
  if (tipo === 'dentro') return <IconeCheck tamanho={14} />
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d={tipo === 'acima' ? 'M5 1 9.5 9h-9L5 1Z' : 'M5 9 .5 1h9L5 9Z'} fill="currentColor" />
    </svg>
  )
}

/** Régua com o saldo entre o limite negativo e o positivo; fora deles a faixa fica tingida. */
function MedidorLimite({ saldo, limites, tipo }: { saldo: Minutos; limites: Limites; tipo: TipoEstado }) {
  const { alerta_pos: pos, alerta_neg: neg } = limites
  const folga = (pos + neg) * 0.18
  const min = Math.min(-neg - folga, saldo - folga / 2)
  const max = Math.max(pos + folga, saldo + folga / 2)
  const pct = (valor: number) => ((valor - min) / (max - min)) * 100

  return (
    <div className="dc-medidor" aria-hidden="true">
      <div className="dc-medidor-trilho">
        <span className="dc-medidor-zona dc-medidor-zona-neg" style={{ left: 0, width: `${pct(-neg)}%` }} />
        <span className="dc-medidor-zona dc-medidor-zona-pos" style={{ left: `${pct(pos)}%`, right: 0 }} />
      </div>
      <span className={`dc-medidor-marca dc-estado-${tipo}`} style={{ left: `${pct(saldo)}%` }} />
      <div className="dc-medidor-escala">
        <span style={{ left: `${pct(-neg)}%` }}>{`−${formatarMinutos(neg)}`}</span>
        <span style={{ left: `${pct(0)}%` }}>0</span>
        <span style={{ left: `${pct(pos)}%` }}>{`+${formatarMinutos(pos)}`}</span>
      </div>
    </div>
  )
}

/**
 * Estado do banco em relação aos limites: uma frase ("11:27 acima do limite de +10:00", "faltam 08:33 para ...")
 * e a régua com o saldo entre o limite negativo e o positivo.
 */
export function EstadoDoBanco({ saldo, limites }: { saldo: Minutos; limites: Limites }) {
  const estado = estadoDoLimite(saldo, limites)
  return (
    <div className="dc-estado-banco">
      <p className={`dc-estado dc-estado-${estado.tipo}`}>
        <IconeEstado tipo={estado.tipo} />
        {estado.texto}
      </p>
      <MedidorLimite saldo={saldo} limites={limites} tipo={estado.tipo} />
    </div>
  )
}
