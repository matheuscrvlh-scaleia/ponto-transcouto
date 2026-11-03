import { describe, expect, it } from 'vitest'
import type { ItemMapeamento } from '../../src/services/calculo-horas.service'
import { batidasQueContam, corrigirDias } from '../../src/services/correcao-batidas.service'

const mapeamento: ItemMapeamento[] = [
    { coluna_secullum: 'Normais', campo: 'ignorar' },
    { coluna_secullum: 'Ex50%', campo: 'extra' },
    { coluna_secullum: 'Ex100%', campo: 'extra' },
    { coluna_secullum: 'Faltas', campo: 'negativa' },
]
const batidas = ['Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2', 'Entrada 3', 'Saída 3']
const colunas = ['Data', ...batidas, 'Normais', 'Ex50%', 'Ex100%', 'Faltas']
const dia = (data: string, marcacoes: string[], ex50: string, faltas = '') => ({
    dia: data,
    valores: [data, ...batidas.map((_, i) => marcacoes[i] ?? ''), '08:48', ex50, '', faltas],
})

describe('batidasQueContam', () => {
    it('com intervalo real, tira o pré-assinalado e ordena', () => {
        expect(batidasQueContam(['10:30', '15:00', '16:00', '12:55', '13:58', '21:46'], ['15:00', '16:00']))
            .toEqual(['10:30', '12:55', '13:58', '21:46'])
    })

    it('sem intervalo real, o pré-assinalado fica', () => {
        expect(batidasQueContam(['08:00', '15:00', '16:00', '14:50'], ['15:00', '16:00'])).toEqual(['08:00', '14:50', '15:00', '16:00'])
    })

    it('turno da noite: o que vem antes da primeira batida é do dia seguinte', () => {
        expect(batidasQueContam(['22:00', '02:00', '03:00', '06:00'], [])).toEqual(['22:00', '02:00', '03:00', '06:00'])
    })
})

describe('corrigirDias', () => {
    it('refaz o dia com o pré-assinalado fora de ordem e ajusta os totais', () => {
        // FriPonto: (10:30–15:00) + (16:00–12:55, virada de noite) + (13:58–21:46) = 33:13, 24:25 de extra
        const dados = {
            colunas,
            totais: ['', '', '', '', '', '', '', '17:36', '25:00', '', '00:20'],
            dias: [
                dia('2026-10-26', ['10:30', '15:00', '16:00', '12:55', '13:58', '21:46'], '24:25'),
                dia('2026-10-27', ['11:00', '13:00', '14:00', '20:08'], '00:35', '00:20'),
            ],
        }
        const { dados: certo, corrigidos } = corrigirDias(dados, new Map([['2026-10-26', ['15:00', '16:00']]]), mapeamento)

        expect(corrigidos).toEqual(['2026-10-26'])
        // certo: (10:30–12:55) + (13:58–21:46) = 10:13, 1:25 de extra
        expect(certo.dias![0].valores.slice(1, 7)).toEqual(['10:30', '12:55', '13:58', '21:46', '', ''])
        expect(certo.dias![0].valores.slice(8)).toEqual(['01:25', '', ''])
        expect(certo.dias![1]).toBe(dados.dias[1])
        expect(certo.totais.slice(8)).toEqual(['02:00', '', '00:20'])
    })

    it('batida fora de ordem sem pré-assinalado: ordena e a diferença vira falta', () => {
        // FriPonto: (06:23–14:14) + (13:12–15:00) = 9:39; certo: (06:23–13:12) + (14:14–15:00) = 7:35
        const totais = ['', '', '', '', '', '', '', '08:48', '01:20', '', '']
        const dados = { colunas, totais, dias: [dia('2026-10-06', ['06:23', '14:14', '13:12', '15:00'], '01:20')] }
        const { dados: certo } = corrigirDias(dados, new Map(), mapeamento)
        // 2:04 a menos: 1:20 de extra viram 0:44 de falta
        expect(certo.dias![0].valores.slice(8)).toEqual(['', '', '00:44'])
        expect(certo.totais.slice(8)).toEqual(['00:00', '', '00:44'])
    })

    it('dia em ordem, ímpar ou sem pré-assinalado sobrando fica como veio', () => {
        const dados = {
            colunas,
            totais: colunas.map(() => ''),
            dias: [dia('2026-10-20', ['11:08', '12:00', '13:01', '20:30'], '', '00:27'), dia('2026-10-21', ['08:00', '12:00', '11:00'], '')],
        }
        const { dados: certo, corrigidos } = corrigirDias(dados, new Map(), mapeamento)
        expect(corrigidos).toEqual([])
        expect(certo).toEqual(dados)
    })
})
