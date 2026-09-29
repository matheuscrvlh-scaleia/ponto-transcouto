export type ForaDaCurva = 'positivo' | 'negativo' | null

export type Limites = {
    alerta_pos: number
    alerta_neg: number
}

export const LIMITES_PADRAO: Limites = { alerta_pos: 600, alerta_neg: 600 }

export function foraDaCurva(saldo: number, limites: Limites): ForaDaCurva {
    if (saldo >= limites.alerta_pos) return 'positivo'
    if (saldo <= -limites.alerta_neg) return 'negativo'
    return null
}
