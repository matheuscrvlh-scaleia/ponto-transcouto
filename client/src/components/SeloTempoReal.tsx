/** Selo "Tempo real" com um ponto pulsante discreto (parado com prefers-reduced-motion). */
export function SeloTempoReal({ titulo }: { titulo?: string }) {
  return (
    <span className="selo-tempo-real" title={titulo}>
      <span className="selo-tempo-real-ponto" aria-hidden="true" />
      Tempo real
    </span>
  )
}
