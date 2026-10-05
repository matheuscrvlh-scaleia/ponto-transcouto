import { describe, expect, it } from 'vitest'
import { cotaLiberaEm, previsaoTermino } from '../../src/services/previsao.service'

const agora = new Date('2026-10-05T15:00:00Z')
const minutos = (m: number) => new Date(agora.getTime() + m * 60_000)

describe('previsaoTermino', () => {
    it('com cota livre, só o ritmo do worker conta', () => {
        expect(previsaoTermino({ restantes: 10, limitePorHora: 90, chamadasRecentes: [], agora, msPorChamada: 1000 }))
            .toEqual(new Date(agora.getTime() + 10_000))
    })

    it('com a cota cheia, cada chamada espera a mais antiga da janela completar 1 h', () => {
        // 3 chamadas há 50, 40 e 30 min, limite 3: as próximas 3 saem aos +10, +20 e +30 min
        const recentes = [minutos(-50), minutos(-40), minutos(-30)]
        expect(previsaoTermino({ restantes: 3, limitePorHora: 3, chamadasRecentes: recentes, agora, msPorChamada: 0 }))
            .toEqual(minutos(30))
    })

    it('passa de uma hora quando faltam mais chamadas que a cota', () => {
        // limite 2, cota livre: 2 agora, 2 uma hora depois, a 5ª duas horas depois
        expect(previsaoTermino({ restantes: 5, limitePorHora: 2, chamadasRecentes: [], agora, msPorChamada: 0 }))
            .toEqual(minutos(120))
    })

    it('nada restante termina agora; sem cota, sem previsão', () => {
        expect(previsaoTermino({ restantes: 0, limitePorHora: 90, chamadasRecentes: [], agora })).toEqual(agora)
        expect(previsaoTermino({ restantes: 5, limitePorHora: 0, chamadasRecentes: [], agora })).toBeNull()
    })
})

describe('cotaLiberaEm', () => {
    it('é a mais antiga da janela + 1 h, só com a cota cheia', () => {
        expect(cotaLiberaEm([minutos(-50)], 2)).toBeNull()
        expect(cotaLiberaEm([minutos(-50), minutos(-20)], 2)).toEqual(minutos(10))
    })
})
