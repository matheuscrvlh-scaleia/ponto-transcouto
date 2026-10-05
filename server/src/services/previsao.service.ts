const MS_HORA = 3_600_000
/** Ritmo medido do worker entre uma chamada de cálculo e a próxima, quando há cota. */
export const MS_POR_CHAMADA = 4_000

/**
 * Quando terminam as `restantes` chamadas de cálculo, respeitando a cota da FriPonto
 * (no máximo `limitePorHora` chamadas em qualquer janela de 1 h). Simula chamada a chamada:
 * com a cota cheia, a próxima espera a mais antiga da janela completar 1 h.
 */
export function previsaoTermino(entrada: {
    restantes: number
    limitePorHora: number
    /** Chamadas de cálculo da última hora, da mais antiga para a mais recente. */
    chamadasRecentes: Date[]
    agora?: Date
    msPorChamada?: number
}): Date | null {
    const { restantes, limitePorHora, chamadasRecentes, agora = new Date(), msPorChamada = MS_POR_CHAMADA } = entrada
    if (restantes <= 0) return agora
    if (limitePorHora <= 0) return null

    const feitas = chamadasRecentes.map(d => d.getTime())
    let instante = agora.getTime()
    for (let i = 0; i < restantes; i++) {
        if (feitas.length >= limitePorHora) {
            instante = Math.max(instante, feitas[feitas.length - limitePorHora] + MS_HORA)
        }
        feitas.push(instante)
        instante += msPorChamada
    }
    return new Date(instante)
}

/** Quando a próxima vaga da cota fica livre (null = há vaga agora). */
export function cotaLiberaEm(chamadasRecentes: Date[], limitePorHora: number): Date | null {
    if (chamadasRecentes.length < limitePorHora) return null
    return new Date(chamadasRecentes[chamadasRecentes.length - limitePorHora].getTime() + MS_HORA)
}
