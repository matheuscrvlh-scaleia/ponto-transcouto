import { useEffect, useRef, useState } from 'react'
import { formatarData, formatarMinutos } from '../lib/formato'
import type { DataISO, DiaHistorico, Minutos, SemanaHistorico } from '../types/api'

const LARGURA_PADRAO = 640
const ALTURA = 200
const MARGEM = { topo: 16, direita: 12, base: 28, esquerda: 52 }

function passoEixo(maximo: number) {
  const horas = Math.max(1, Math.ceil(maximo / 60))
  const passos = [1, 2, 5, 10, 20, 50, 100, 200, 500]
  return (passos.find((passo) => horas / passo <= 4) ?? 1000) * 60
}

interface Ponto {
  chave: string | number
  data: DataISO
  saldo: Minutos
  /** Texto entre parênteses na legenda (ex.: "semana +02:00"). */
  detalhe: string
  /** Ponto que pede conferência: a barra sai na cor de aviso. */
  conferir?: boolean
}

/** Limites do banco (alerta positivo e negativo, em minutos positivos): viram linhas tracejadas. */
export interface LimitesSaldo {
  pos: Minutos
  neg: Minutos
}

/** Saldo acumulado por ponto (barras divergentes a partir do zero). `pontos` em ordem cronológica. */
export function GraficoSaldo({
  pontos,
  larguraMaxBarra,
  limites,
}: {
  pontos: Ponto[]
  larguraMaxBarra: number
  limites?: LimitesSaldo
}) {
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

  // a escala também cobre os limites, para as linhas tracejadas aparecerem mesmo com o saldo longe delas
  const valores = [...pontos.map((ponto) => ponto.saldo), ...(limites ? [limites.pos, -limites.neg] : [])]
  const passo = passoEixo(Math.max(...valores.map(Math.abs), 60))
  const max = Math.max(passo, Math.ceil(Math.max(...valores, 0) / passo) * passo)
  const min = Math.min(0, Math.floor(Math.min(...valores, 0) / passo) * passo)

  const areaAltura = ALTURA - MARGEM.topo - MARGEM.base
  const areaLargura = largura - MARGEM.esquerda - MARGEM.direita
  const y = (valor: number) => MARGEM.topo + ((max - valor) / (max - min)) * areaAltura
  const faixa = areaLargura / pontos.length
  const larguraBarra = Math.max(1, Math.min(larguraMaxBarra, faixa - 2))
  const x = (i: number) => MARGEM.esquerda + faixa * i + (faixa - larguraBarra) / 2

  const ticks: number[] = []
  for (let v = min; v <= max; v += passo) ticks.push(v)

  const cadaRotulo = Math.ceil(pontos.length / Math.max(2, Math.floor(areaLargura / 48)))
  const pontoAtivo = ativo !== null ? pontos[ativo] : null

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

        {limites &&
          [
            { valor: limites.pos, rotulo: 'limite' },
            { valor: -limites.neg, rotulo: 'limite' },
          ].map(({ valor, rotulo }) => (
            <g key={valor}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(valor)} y2={y(valor)} className="grafico-limite" />
              <text
                x={largura - MARGEM.direita - 2}
                y={y(valor) + (valor > 0 ? -4 : 12)}
                textAnchor="end"
                className="grafico-limite-rotulo"
              >
                {rotulo} {valor > 0 ? '+' : '−'}
                {formatarMinutos(Math.abs(valor))}
              </text>
            </g>
          ))}

        {pontos.map((ponto, i) => {
          const valor = ponto.saldo
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
            <g key={ponto.chave}>
              {altura > 0 && (
                <path
                  d={caminho}
                  className={ponto.conferir ? 'grafico-barra-conferir' : positivo ? 'grafico-barra-pos' : 'grafico-barra-neg'}
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
              {i % cadaRotulo === (pontos.length - 1) % cadaRotulo && (
                <text x={x0 + larguraBarra / 2} y={ALTURA - 8} textAnchor="middle" className="grafico-eixo">
                  {formatarData(ponto.data, { ano: false })}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <p className="grafico-legenda" aria-hidden="true">
        {pontoAtivo
          ? `${formatarData(pontoAtivo.data)}: saldo ${formatarMinutos(pontoAtivo.saldo, { sinal: true })} (${pontoAtivo.detalhe})`
          : 'Passe o mouse ou toque numa barra para ver o valor.'}
      </p>
    </div>
  )
}

/** Saldo acumulado por semana (fotografias). `semanas` em ordem cronológica. */
export function GraficoSemanas({ semanas, limites }: { semanas: SemanaHistorico[]; limites?: LimitesSaldo }) {
  const pontos = semanas.map((semana) => ({
    chave: semana.fechamento_id,
    data: semana.data_referencia,
    saldo: semana.saldo_total,
    detalhe: `semana ${formatarMinutos(semana.banco_semana, { sinal: true })}`,
  }))
  return <GraficoSaldo pontos={pontos} larguraMaxBarra={28} limites={limites} />
}

/** Saldo acumulado por dia (tempo real). `dias` em ordem cronológica. */
export function GraficoDias({ dias, limites }: { dias: DiaHistorico[]; limites?: LimitesSaldo }) {
  const pontos = dias.map((dia) => ({
    chave: dia.dia,
    data: dia.dia,
    saldo: dia.saldo_total,
    detalhe:
      dia.banco_dia === null
        ? 'primeiro dia registrado no período'
        : `banco do dia ${formatarMinutos(dia.banco_dia, { sinal: true })}`,
  }))
  return <GraficoSaldo pontos={pontos} larguraMaxBarra={18} limites={limites} />
}
