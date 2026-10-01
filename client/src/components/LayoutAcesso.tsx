import type { ReactNode } from 'react'
import './layout-acesso.css'

/* Layout das telas de acesso (login e troca de senha): painel decorativo
   à esquerda com o nome do sistema e formulário à direita, em tela cheia. */

/* ---------- Decoração do painel (puramente visual, aria-hidden) ---------- */

/** Forma orgânica centrada na origem (~100px de raio), base das curvas de nível. */
const FORMA_ORGANICA =
  'M10,-98 C62,-96 104,-52 92,0 C82,44 104,86 52,98 C4,108 -30,70 -70,72 C-108,74 -104,22 -96,-14 C-86,-60 -42,-100 10,-98Z'

const NIVEIS = [1, 0.82, 0.65, 0.5, 0.36, 0.22]

function CurvasDeNivel({ x, y, escala, giro }: { x: number; y: number; escala: number; giro: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      {NIVEIS.map((nivel, i) => (
        <path
          key={nivel}
          d={FORMA_ORGANICA}
          transform={`translate(${i * 5} ${i * -4}) rotate(${i * 12}) scale(${nivel})`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

function DecoracaoPainel() {
  return (
    <svg className="lg-deco" viewBox="0 0 560 600" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
      <path className="lg-deco-sombra" d="M250 0 H560 V210 C470 170 360 90 250 0Z" />
      <path className="lg-deco-luz" d="M0 90 C90 110 150 210 120 300 C95 380 30 410 0 420Z" />
      <path
        className="lg-deco-luz"
        d="M150 320 C150 215 255 165 340 200 C425 235 405 335 470 385 C540 440 565 525 525 600 H125 C70 520 150 430 150 320Z"
      />
      <g className="lg-deco-linhas">
        <CurvasDeNivel x={30} y={60} escala={1.7} giro={-20} />
        <CurvasDeNivel x={520} y={560} escala={1.55} giro={30} />
      </g>
    </svg>
  )
}

function Mais({ className }: { className: string }) {
  return (
    <svg className={`lg-orn ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2v20M2 12h20" />
    </svg>
  )
}

function Circulo({ className }: { className: string }) {
  return (
    <svg className={`lg-orn ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function GradePontos() {
  const pontos = []
  for (let linha = 0; linha < 7; linha++) {
    for (let coluna = 0; coluna < 3; coluna++) {
      pontos.push(<circle key={`${linha}-${coluna}`} cx={4 + coluna * 16} cy={4 + linha * 16} r="2.2" />)
    }
  }
  return (
    <svg className="lg-orn lg-orn-pontos" viewBox="0 0 40 104" aria-hidden="true" focusable="false">
      {pontos}
    </svg>
  )
}

/* ---------- Ícones dos campos ---------- */

export function IconeUsuario() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="8" r="4.2" />
      <path d="M3.8 20.2c.9-4 4.2-6.4 8.2-6.4s7.3 2.4 8.2 6.4a1 1 0 0 1-1 1.2H4.8a1 1 0 0 1-1-1.2Z" />
    </svg>
  )
}

export function IconeCadeado() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 2.5a5 5 0 0 0-5 5V10h-.5A2.5 2.5 0 0 0 4 12.5v7A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5v-7a2.5 2.5 0 0 0-2.5-2.5H17V7.5a5 5 0 0 0-5-5Zm-3 5a3 3 0 0 1 6 0V10H9V7.5Zm3 6.5a1.6 1.6 0 0 1 .8 3v1.8a.8.8 0 0 1-1.6 0V17a1.6 1.6 0 0 1 .8-3Z" />
    </svg>
  )
}

interface Props {
  /** Título grande do painel roxo (h1). */
  tituloPainel: string
  textoPainel: string
  /** Título do formulário (h2). */
  titulo: string
  subtitulo: ReactNode
  children: ReactNode
}

export function LayoutAcesso({ tituloPainel, textoPainel, titulo, subtitulo, children }: Props) {
  return (
    <main className="lg-page">
      <div className="lg-card">
        <section className="lg-painel" aria-labelledby="lg-painel-titulo">
          <DecoracaoPainel />
          <Mais className="lg-orn-mais-1" />
          <Mais className="lg-orn-mais-2" />
          <Circulo className="lg-orn-circulo-1" />
          <Circulo className="lg-orn-circulo-2" />
          <GradePontos />

          <div className="lg-boas-vindas">
            <p className="lg-sistema">
              <span className="lg-sistema-icone" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
              </span>
              Copiloto de Ponto
            </p>
            <h1 id="lg-painel-titulo">{tituloPainel}</h1>
            <p>{textoPainel}</p>
          </div>
        </section>

        <section className="lg-acesso" aria-labelledby="lg-form-titulo">
          <div className="lg-acesso-conteudo">
            <h2 id="lg-form-titulo" className="lg-titulo">
              {titulo}
            </h2>
            <p className="lg-subtitulo">{subtitulo}</p>
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}
