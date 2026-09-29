import { describe, expect, it } from 'vitest'
import { decidirPublicacao, MAX_TENTATIVAS_FECHAMENTO } from '../../src/services/publicacao.service'

const base = { totalColaboradores: 3, comRegistro: 3, tentativas: 1, erroFatal: false }

describe('decidirPublicacao', () => {
    it('publica quando todos têm registro', () => {
        expect(decidirPublicacao(base)).toEqual({ status: 'sucesso' })
    })

    it('cancela unidade sem colaborador elegível em vez de publicar vazio', () => {
        expect(decidirPublicacao({ ...base, totalColaboradores: 0, comRegistro: 0 })).toEqual({ status: 'cancelado' })
    })

    it('incompleto volta para a fila com backoff até o limite de tentativas', () => {
        const agora = new Date('2026-09-29T12:00:00Z')
        const decisao = decidirPublicacao({ ...base, comRegistro: 2 }, agora)
        expect(decisao).toEqual({ status: 'pendente', proximaTentativaEm: new Date(agora.getTime() + 5 * 60 * 1000) })
        expect(decidirPublicacao({ ...base, comRegistro: 2, tentativas: MAX_TENTATIVAS_FECHAMENTO })).toEqual({ status: 'falhou' })
    })

    it('erro fatal falha mesmo sem colaboradores', () => {
        expect(decidirPublicacao({ ...base, totalColaboradores: 0, comRegistro: 0, erroFatal: true })).toEqual({ status: 'falhou' })
    })
})
