import { describe, expect, it, vi } from 'vitest'
import { lerTotais } from '../../src/integrations/secullum/parser'
import { diasOuNada, horasPorDia } from '../../src/services/horas-dia.service'
import type { ItemMapeamento } from '../../src/services/calculo-horas.service'

// formato real da Calcular completa (FriPonto da Transcouto, colunas resumidas)
const resposta = {
    Colunas: ['Data', 'Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2', 'Normais', 'Faltas', 'Extras', 'DSR', 'ExNot', 'Refeição'],
    Linhas: [
        { Key: '2026-09-27T00:00:00', Value: ['27/09/2026 - Dom', null, null, null, null, '', '', '', '07:20', '', ''] },
        { Key: '2026-09-28T00:00:00', Value: ['28/09/2026 - Seg', '09:33', '15:00', '16:00', '21:25', '08:48', '', '02:04', '', '00:25', '0'] },
        { Key: '2026-09-29T00:00:00', Value: ['29/09/2026 - Ter', '08:00', '12:00', null, null, '04:00', '04:48', '', '', '', '0'] },
    ],
    Totais: ['', '', '', '', '', '12:48', '04:48', '02:04', '07:20', '00:25', '0'],
}

const mapeamento: ItemMapeamento[] = [
    { coluna_secullum: 'Extras', campo: 'extra' },
    { coluna_secullum: 'ExNot', campo: 'extra' },
    { coluna_secullum: 'Faltas', campo: 'negativa' },
    { coluna_secullum: 'Normais', campo: 'ignorar' },
    { coluna_secullum: 'DSR', campo: 'ignorar' },
    { coluna_secullum: 'Refeição', campo: 'ignorar' },
]

describe('horasPorDia', () => {
    it('soma extras e negativas de cada dia pelo mapeamento e guarda as marcações', () => {
        expect(horasPorDia(lerTotais(resposta), mapeamento)).toEqual([
            { dia: '2026-09-27', extra: 0, negativa: 0, marcacoes: [] },
            { dia: '2026-09-28', extra: 149, negativa: 0, marcacoes: ['09:33', '15:00', '16:00', '21:25'] },
            { dia: '2026-09-29', extra: 0, negativa: 288, marcacoes: ['08:00', '12:00'] },
        ])
    })

    it('resposta sem linhas (SomenteTotais) não tem dias', () => {
        expect(horasPorDia(lerTotais({ Colunas: resposta.Colunas, Totais: resposta.Totais }), mapeamento)).toEqual([])
    })

    it('dia fora do formato não derruba a coleta: avisa e volta sem dias', () => {
        const dados = lerTotais(resposta)
        dados.dias![1].valores[7] = '2,5'
        const avisar = vi.fn()
        expect(diasOuNada(dados, mapeamento, avisar)).toEqual([])
        expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/^horas por dia não gravadas: Formato de horas/))
    })
})
