import { describe, expect, it } from 'vitest'
import { horaSecullumParaMinutos, lerTotais, totaisPorColuna } from '../../src/integrations/secullum/parser'
import { SecullumError } from '../../src/integrations/secullum/tipos'

describe('horaSecullumParaMinutos', () => {
    it.each([
        ['08:48', 528],
        ['00:00', 0],
        ['', 0],
        ['  ', 0],
        ['125:30', 7530],
        ['1234:05', 74045],
        ['-03:15', -195],
        ['03:15-', -195],
        ['-00:30', -30],
        ['+02:00', 120],
    ])('"%s" → %i', (entrada, esperado) => {
        expect(horaSecullumParaMinutos(entrada)).toBe(esperado)
    })

    it.each(['8,80', '08:75', 'abc', '08h30', '8.5'])('recusa formato desconhecido "%s"', entrada => {
        expect(() => horaSecullumParaMinutos(entrada)).toThrow(SecullumError)
    })
})

describe('lerTotais', () => {
    it('aceita PascalCase e camelCase e mantém a posição', () => {
        const pascal = lerTotais({ Colunas: ['Data', 'Normais', 'Ex50%'], Totais: ['', '176:00', '12:30'] })
        const camel = lerTotais({ colunas: ['Data', 'Normais', 'Ex50%'], totais: ['', '176:00', '12:30'] })
        expect(pascal).toEqual({ colunas: ['Data', 'Normais', 'Ex50%'], totais: ['', '176:00', '12:30'] })
        expect(camel).toEqual(pascal)
    })

    it('ignora Linhas e converte nulos em vazio', () => {
        const dados = lerTotais({ Colunas: ['Data', ' BSaldo '], Linhas: [{ Key: 'x', Value: [] }], Totais: [null, '-10:00'] })
        expect(dados).toEqual({ colunas: ['Data', 'BSaldo'], totais: ['', '-10:00'] })
    })

    it('recusa resposta sem Totais ou com tamanhos diferentes', () => {
        expect(() => lerTotais({ Colunas: ['Data'] })).toThrow(SecullumError)
        expect(() => lerTotais({ Colunas: ['Data', 'Normais'], Totais: [''] })).toThrow(/2 colunas e 1 totais/)
    })

    it('totaisPorColuna descarta a coluna Data', () => {
        const mapa = totaisPorColuna({ colunas: ['Data', 'Normais', 'Faltas'], totais: ['', '08:00', '01:00'] })
        expect([...mapa.entries()]).toEqual([['Normais', '08:00'], ['Faltas', '01:00']])
    })
})

describe('resposta real da FriPonto (Transcouto)', () => {
    const resposta = {
        Colunas: ['Data', 'Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2', 'Entrada 3', 'Saída 3', 'Entrada 4', 'Saída 4', 'Entrada 5', 'Saída 5', 'Normais', 'Faltas', 'Ex50%', 'Ex100%', 'DSR', 'DSR.Deb', 'Not.', 'ExNot', 'Ajuste', 'Abono2', 'Abono3', 'Abono4', 'Atras.', 'Adian.', 'Folga', 'Carga', 'JustPa.', 'T+/-', 'ExInt', 'Not.Tot.', 'Refeição'],
        Totais: ['', '', '', '', '', '', '', '', '', '', '', '191:18', '02:18', '00:10', '00:00', '29:20', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '193:36', '', '00:00', '00:00', '00:00', '0'],
    }

    it('ignora colunas de batida e mantém as de horas', () => {
        const colunas = [...totaisPorColuna(lerTotais(resposta)).keys()]
        expect(colunas).not.toContain('Entrada 1')
        expect(colunas).not.toContain('Saída 5')
        expect(colunas).toContain('Ex50%')
        expect(colunas).toHaveLength(21)
    })
})
