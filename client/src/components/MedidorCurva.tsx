import { useId } from 'react'

interface Props {
  dentro: number
  acima: number
  abaixo: number
}

const RAIO = 88
const CENTRO_X = 110
const CENTRO_Y = 112
const ARCO = `M${CENTRO_X - RAIO} ${CENTRO_Y}A${RAIO} ${RAIO} 0 0 1 ${CENTRO_X + RAIO} ${CENTRO_Y}`
const VAO = 1.2

/** Meio anel com a proporção de colaboradores dentro, acima e abaixo da curva de saldo. */
export function MedidorCurva({ dentro, acima, abaixo }: Props) {
  const hachura = `hachura-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const total = dentro + acima + abaixo
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  const percentualDentro = Math.round(pct(dentro))

  const segmentos = [
    { chave: 'dentro', valor: dentro, rotulo: 'Dentro da curva' },
    { chave: 'acima', valor: acima, rotulo: 'Acima do limite' },
    { chave: 'abaixo', valor: abaixo, rotulo: 'Abaixo do limite' },
  ]
  const visiveis = segmentos.filter((s) => s.valor > 0).length

  let inicio = 0
  const arcos = segmentos.map((segmento) => {
    const tamanho = pct(segmento.valor)
    const desenho = { ...segmento, inicio, tamanho: visiveis > 1 ? Math.max(0, tamanho - VAO) : tamanho }
    inicio += tamanho
    return desenho
  })

  return (
    <div className="medidor">
      <div className="medidor-arco">
        <svg
          viewBox="0 0 220 124"
          role="img"
          aria-label={`${percentualDentro}% dos colaboradores dentro da curva: ${dentro} dentro, ${acima} acima e ${abaixo} abaixo do limite.`}
        >
          <defs>
            {/* textura no segmento "acima" para não depender só da cor (azul × roxo) */}
            <pattern id={hachura} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" className="medidor-hachura-fundo" />
              <line x1="1.5" y1="0" x2="1.5" y2="6" strokeWidth="3" className="medidor-hachura-linha" />
            </pattern>
          </defs>
          <path d={ARCO} pathLength={100} className="medidor-trilho" />
          {arcos.map(
            (arco) =>
              arco.valor > 0 && (
                <path
                  key={arco.chave}
                  d={ARCO}
                  pathLength={100}
                  className={`medidor-segmento medidor-${arco.chave}`}
                  strokeDasharray={`${arco.tamanho} 200`}
                  strokeDashoffset={-arco.inicio}
                  style={arco.chave === 'acima' ? { stroke: `url(#${hachura})` } : undefined}
                />
              ),
          )}
        </svg>
        <div className="medidor-centro" aria-hidden="true">
          <span className="medidor-valor">{percentualDentro}%</span>
          <span className="medidor-rotulo">dentro da curva</span>
        </div>
      </div>
      <ul className="medidor-legenda">
        {segmentos.map((segmento) => (
          <li key={segmento.chave}>
            <span className={`medidor-ponto medidor-${segmento.chave}`} aria-hidden="true" />
            <span className="medidor-legenda-rotulo">{segmento.rotulo}</span>
            <strong>{segmento.valor}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
