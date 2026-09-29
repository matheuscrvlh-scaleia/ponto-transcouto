import { useEffect, useRef, useState } from 'react'
import { formatarData, formatarMinutos } from '../lib/formato'
import type { SemanaHistorico } from '../types/api'

const LARGURA_PADRAO = 640
const ALTURA = 200
const MARGEM = { topo: 16, direita: 12, base: 28, esquerda: 52 }

function passoEixo(maximo: number) {
  const horas = Math.max(1, Math.ceil(maximo / 60))
  const passos = [1, 2, 5, 10, 20, 50, 100, 200, 500]
  return (passos.find((passo) => horas / passo <= 4) ?? 1000) * 60
}

/** Saldo acumulado por semana (barras divergentes a partir do zero). `semanas` em ordem cronológica. */
export function GraficoSemanas({ semanas }: { semanas: SemanaHistorico[] }) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(LARGURA_PADRAO)

  useEffect(() => {
    const el = container.current
    if (!el) return
    const observador = new ResizeObserver(([entrada]) => setLargura(Math.max(280, Math.round(entrada.contentRect.width))))
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  const valores = semanas.map((semana) => semana.saldo_total)
  const passo = passoEixo(Math.max(...valores.map(Math.abs), 60))
  const max = Math.max(passo, Math.ceil(Math.max(...valores, 0) / passo) * passo)
  const min = Math.min(0, Math.floor(Math.min(...valores, 0) / passo) * passo)

  const areaAltura = ALTURA - MARGEM.topo - MARGEM.base
  const areaLargura = largura - MARGEM.esquerda - MARGEM.direita
  const y = (valor: number) => MARGEM.topo + ((max - valor) / (max - min)) * areaAltura
  const faixa = areaLargura / semanas.length
  const larguraBarra = Math.min(28, faixa - 2)
  const x = (i: number) => MARGEM.esquerda + faixa * i + (faixa - larguraBarra) / 2

  const ticks: number[] = []
  for (let v = min; v <= max; v += passo) ticks.push(v)

  const cadaRotulo = Math.ceil(semanas.length / Math.max(2, Math.floor(areaLargura / 48)))
  const semanaAtiva = ativo !== null ? semanas[ativo] : null

  return (
    <div className="grafico" ref={container}>
      <svg viewBox={`0 0 ${largura} ${ALTURA}`} aria-hidden="true" onMouseLeave={() => setAtivo(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y(tick)}
              y2={y(tick)}
              className={tick === 0 ? 'grafico-zero' : 'grafico-grade'}
            />
            <text x={MARGEM.esquerda - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="grafico-eixo">
              {tick === 0 ? '0' : `${tick > 0 ? '+' : '−'}${Math.abs(tick) / 60}h`}
            </text>
          </g>
        ))}

        {semanas.map((semana, i) => {
          const valor = semana.saldo_total
          const topo = y(Math.max(valor, 0))
          const altura = Math.max(Math.abs(y(valor) - y(0)), valor === 0 ? 0 : 2)
          const raio = Math.min(4, larguraBarra / 2, altura)
          const positivo = valor >= 0
          const x0 = x(i)
          const x1 = x0 + larguraBarra
          const caminho = positivo
            ? `M${x0},${topo + altura}V${topo + raio}Q${x0},${topo} ${x0 + raio},${topo}H${x1 - raio}Q${x1},${topo} ${x1},${topo + raio}V${topo + altura}Z`
            : `M${x0},${topo}V${topo + altura - raio}Q${x0},${topo + altura} ${x0 + raio},${topo + altura}H${x1 - raio}Q${x1},${topo + altura} ${x1},${topo + altura - raio}V${topo}Z`

          return (
            <g key={semana.fechamento_id}>
              {altura > 0 && (
                <path
                  d={caminho}
                  className={positivo ? 'grafico-barra-pos' : 'grafico-barra-neg'}
                  opacity={ativo === null || ativo === i ? 1 : 0.45}
                />
              )}
              <rect
                x={MARGEM.esquerda + faixa * i}
                y={MARGEM.topo}
                width={faixa}
                height={areaAltura}
                fill="transparent"
                onMouseEnter={() => setAtivo(i)}
                onClick={() => setAtivo(i)}
              />
              {i % cadaRotulo === (semanas.length - 1) % cadaRotulo && (
                <text x={x0 + larguraBarra / 2} y={ALTURA - 8} textAnchor="middle" className="grafico-eixo">
                  {formatarData(semana.data_referencia, { ano: false })}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <p className="grafico-legenda" aria-hidden="true">
        {semanaAtiva
          ? `${formatarData(semanaAtiva.data_referencia)}: saldo ${formatarMinutos(semanaAtiva.saldo_total, { sinal: true })} (semana ${formatarMinutos(semanaAtiva.banco_semana, { sinal: true })})`
          : 'Passe o mouse ou toque numa barra para ver o valor.'}
      </p>
    </div>
  )
}
