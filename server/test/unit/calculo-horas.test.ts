import { describe, expect, it } from 'vitest'
import {
    calcularHoras,
    mensagensErroMapeamento,
    type EntradaCalculoHoras,
    type ItemMapeamento,
    type RegraPagas,
} from '../../src/services/calculo-horas.service'

const mapeamento: ItemMapeamento[] = [
    { coluna_secullum: 'Normais', campo: 'ignorar' },
    { coluna_secullum: 'Ex50%', campo: 'extra' },
    { coluna_secullum: 'Ex100%', campo: 'extra' },
    { coluna_secullum: 'Faltas', campo: 'negativa' },
    { coluna_secullum: 'Atras.', campo: 'negativa' },
]

const colunas = ['Data', 'Normais', 'Ex50%', 'Ex100%', 'Faltas', 'Atras.']
const dados = (ex50: string, ex100 = '00:00', faltas = '00:00', atrasos = '00:00') =>
    ({ colunas, totais: ['', '176:00', ex50, ex100, faltas, atrasos] })

const tetoMensal: RegraPagas = { origem: 'teto', teto_minutos: 600, periodicidade: 'mensal' }
const tetoSemanal: RegraPagas = { origem: 'teto', teto_minutos: 120, periodicidade: 'semanal' }

function calcular(parcial: Partial<EntradaCalculoHoras>) {
    const resultado = calcularHoras({
        dados: dados('00:00'),
        mapeamento,
        regra: tetoMensal,
        anterior: null,
        saldoPeriodosAnteriores: 0,
        ...parcial,
    })
    if (!resultado.ok) throw new Error(mensagensErroMapeamento(resultado.erro).join('; '))
    return resultado.valores
}

describe('calcularHoras', () => {
    it('soma colunas de extra/negativa e aplica teto mensal', () => {
        const v = calcular({ dados: dados('12:30', '02:00', '08:00', '-00:45') })
        expect(v).toMatchObject({
            extra_periodo: 870,
            negativa_periodo: 525,
            pagas_periodo: 600,
            banco_periodo: 270,
            extra_semana: 870,
            banco_semana: 270,
            saldo_banco_total: 270 - 525,
            base_semana_registro_id: null,
        })
    })

    it('teto mensal acima das extras: tudo pago, banco zero', () => {
        const v = calcular({ dados: dados('05:00') })
        expect(v.pagas_periodo).toBe(300)
        expect(v.banco_periodo).toBe(0)
    })

    it('*_semana é a diferença para o registro anterior do mesmo período', () => {
        const anterior = { id: '41', extra_periodo: 870, negativa_periodo: 525, pagas_periodo: 600, banco_periodo: 270 }
        const v = calcular({ dados: dados('20:00', '02:00', '08:00', '00:45'), anterior })
        expect(v).toMatchObject({
            extra_periodo: 1320,
            pagas_periodo: 600,
            banco_periodo: 720,
            extra_semana: 450,
            negativa_semana: 0,
            pagas_semana: 0,
            banco_semana: 450,
            base_semana_registro_id: '41',
        })
    })

    it('correção retroativa gera *_semana negativo', () => {
        const anterior = { id: 7, extra_periodo: 600, negativa_periodo: 60, pagas_periodo: 600, banco_periodo: 0 }
        const v = calcular({ dados: dados('08:00'), anterior })
        expect(v.extra_semana).toBe(-120)
        expect(v.negativa_semana).toBe(-60)
        expect(v.pagas_semana).toBe(-120)
    })

    it('teto semanal: paga até o teto do que entrou na semana, acumulando o já pago', () => {
        const primeira = calcular({ regra: tetoSemanal, dados: dados('03:00') })
        expect(primeira).toMatchObject({ extra_periodo: 180, pagas_periodo: 120, banco_periodo: 60 })

        const segunda = calcular({
            regra: tetoSemanal,
            dados: dados('04:00'),
            anterior: { id: 1, extra_periodo: 180, negativa_periodo: 0, pagas_periodo: 120, banco_periodo: 60 },
        })
        expect(segunda).toMatchObject({ extra_periodo: 240, pagas_periodo: 180, banco_periodo: 60, pagas_semana: 60, banco_semana: 0 })
    })

    it('origem coluna_secullum usa a coluna "pagas"', () => {
        const map: ItemMapeamento[] = [...mapeamento, { coluna_secullum: 'ExPagas', campo: 'pagas' }]
        const v = calcular({
            mapeamento: map,
            regra: { origem: 'coluna_secullum', teto_minutos: null, periodicidade: null },
            dados: { colunas: [...colunas, 'ExPagas'], totais: ['', '176:00', '10:00', '00:00', '00:00', '00:00', '07:00'] },
        })
        expect(v).toMatchObject({ extra_periodo: 600, pagas_periodo: 420, banco_periodo: 180 })
    })

    it('saldo_banco_total usa a coluna mapeada quando existe (inclusive negativa e >24h)', () => {
        const map: ItemMapeamento[] = [...mapeamento, { coluna_secullum: 'BSaldo', campo: 'saldo_banco' }]
        const v = calcular({
            mapeamento: map,
            dados: { colunas: [...colunas, 'BSaldo'], totais: ['', '176:00', '01:00', '', '', '', '35:10-'] },
            saldoPeriodosAnteriores: 9999,
        })
        expect(v.saldo_banco_total).toBe(-2110)
    })

    it('sem coluna de saldo, acumula (banco − negativa) dos períodos anteriores + atual', () => {
        const v = calcular({ dados: dados('12:00', '00:00', '01:00'), saldoPeriodosAnteriores: -300 })
        expect(v.saldo_banco_total).toBe(-300 + 120 - 60)
    })

    it('sinaliza coluna nova não mapeada e coluna mapeada ausente', () => {
        const resultado = calcularHoras({
            dados: { colunas: ['Data', 'Normais', 'Ex50%', 'ExNot', 'Faltas', 'Atras.'], totais: ['', '', '', '', '', ''] },
            mapeamento,
            regra: tetoMensal,
            anterior: null,
            saldoPeriodosAnteriores: 0,
        })
        expect(resultado.ok).toBe(false)
        if (resultado.ok) return
        expect(resultado.erro.colunasNaoMapeadas).toEqual(['ExNot'])
        expect(resultado.erro.colunasAusentes).toEqual(['Ex100%'])
        expect(mensagensErroMapeamento(resultado.erro)).toContain('Coluna não mapeada: ExNot')
    })

    it('sem mapeamento nenhum, todas as colunas de horas são sinalizadas', () => {
        const resultado = calcularHoras({
            dados: dados('01:00'), mapeamento: [], regra: tetoMensal, anterior: null, saldoPeriodosAnteriores: 0,
        })
        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.erro.colunasNaoMapeadas).toEqual(['Normais', 'Ex50%', 'Ex100%', 'Faltas', 'Atras.'])
    })

    it('coluna_secullum sem coluna "pagas" mapeada é erro de mapeamento', () => {
        const resultado = calcularHoras({
            dados: dados('01:00'),
            mapeamento,
            regra: { origem: 'coluna_secullum', teto_minutos: null, periodicidade: null },
            anterior: null,
            saldoPeriodosAnteriores: 0,
        })
        expect(resultado.ok).toBe(false)
    })

    it('extra negativa é recusada (não gera número errado silencioso)', () => {
        expect(() => calcular({ dados: dados('-01:00') })).toThrow(/negativa/)
    })
})
