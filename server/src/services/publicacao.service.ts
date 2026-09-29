export const MAX_TENTATIVAS_FECHAMENTO = 5

export type SituacaoFechamento = {
    totalColaboradores: number
    comRegistro: number
    tentativas: number
    erroFatal: boolean
}

export type DecisaoPublicacao =
    | { status: 'sucesso' }
    | { status: 'cancelado' }
    | { status: 'pendente', proximaTentativaEm: Date }
    | { status: 'falhou' }

export function atrasoTentativaMs(tentativas: number) {
    return 5 * 60 * 1000 * 4 ** Math.max(tentativas - 1, 0)
}

// Unidade sem colaborador elegível não publica: um snapshot vazio esconderia o último fechamento no painel.
export function decidirPublicacao(s: SituacaoFechamento, agora = new Date()): DecisaoPublicacao {
    if (!s.erroFatal && s.totalColaboradores === 0) return { status: 'cancelado' }
    if (!s.erroFatal && s.comRegistro >= s.totalColaboradores) return { status: 'sucesso' }
    if (s.erroFatal || s.tentativas >= MAX_TENTATIVAS_FECHAMENTO) return { status: 'falhou' }
    return { status: 'pendente', proximaTentativaEm: new Date(agora.getTime() + atrasoTentativaMs(s.tentativas)) }
}
