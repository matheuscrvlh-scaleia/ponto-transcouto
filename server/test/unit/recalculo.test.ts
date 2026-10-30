import { describe, expect, it } from 'vitest'
import type { ItemMapeamento, RegraPagas } from '../../src/services/calculo-horas.service'
import {
    recalcularHistorico,
    regraDaConfiguracao,
    type DiaGravado,
    type RegistroAoVivo,
    type RegistroGravado,
} from '../../src/services/recalculo.service'

const mapeamento: ItemMapeamento[] = [
    { coluna_secullum: 'Normais', campo: 'ignorar' },
    { coluna_secullum: 'Ex50%', campo: 'extra' },
    { coluna_secullum: 'Faltas', campo: 'negativa' },
]
const colunas = ['Data', 'Normais', 'Ex50%', 'Faltas']
const dados = (extras: string, faltas = '00:00') => ({ colunas, totais: ['', '176:00', extras, faltas] })

const semTeto: RegraPagas = { origem: 'teto', teto_minutos: 0, periodicidade: 'mensal' }
const teto10h: RegraPagas = { origem: 'teto', teto_minutos: 600, periodicidade: 'mensal' }

let proximoId = 1
function registro(parcial: Partial<RegistroGravado> & Pick<RegistroGravado, 'periodo_inicio' | 'data_referencia' | 'dados'>): RegistroGravado {
    return {
        id: String(proximoId++),
        colaborador_id: 7,
        fechamento_id: proximoId,
        publicado: true,
        dados_desde: null,
        // valores gravados antes do recálculo (só usados quando o registro não pode ser recalculado)
        extra_periodo: 0,
        negativa_periodo: 0,
        pagas_periodo: 0,
        banco_periodo: 0,
        ...parcial,
    }
}

function recalcular(registros: RegistroGravado[], regra: RegraPagas, extras: { aoVivo?: RegistroAoVivo[], dias?: DiaGravado[] } = {}) {
    return recalcularHistorico({ registros, aoVivo: extras.aoVivo ?? [], dias: extras.dias ?? [], mapeamento, regra })
}

const saldoDe = (resultado: ReturnType<typeof recalcular>, id: number | string) =>
    resultado.registros.find(r => r.id === id)?.valores.saldo_banco_total

describe('recalcularHistorico', () => {
    // agosto: 20h extras e 5h faltas; setembro: 15h extras e 10h faltas
    const agosto = () => registro({ periodo_inicio: '2026-08-26', data_referencia: '2026-09-25', dados: dados('20:00', '05:00') })
    const setembro = () => registro({ periodo_inicio: '2026-09-26', data_referencia: '2026-10-13', dados: dados('15:00', '10:00') })

    it('aplica a regra atual a todos os períodos, inclusive o saldo herdado', () => {
        const a = agosto()
        const s = setembro()

        const comTeto = recalcular([s, a], teto10h)
        // agosto: saldo 15h, 10h pagas, +5h no banco; setembro: saldo 5h, tudo pago, herda +5h
        expect(saldoDe(comTeto, a.id)).toBe(300)
        expect(saldoDe(comTeto, s.id)).toBe(300)

        const tudoNoBanco = recalcular([a, s], semTeto)
        // agosto: 20h − 5h = +15h; setembro: +15h + 15h − 10h = +20h
        expect(saldoDe(tudoNoBanco, a.id)).toBe(900)
        expect(saldoDe(tudoNoBanco, s.id)).toBe(1200)
        expect(tudoNoBanco.falhas).toEqual([])
    })

    it('semana usa o registro anterior do mesmo período como base', () => {
        const semana1 = registro({ periodo_inicio: '2026-09-26', data_referencia: '2026-10-06', dados: dados('04:00') })
        const semana2 = registro({ periodo_inicio: '2026-09-26', data_referencia: '2026-10-13', dados: dados('09:00') })
        const resultado = recalcular([semana1, semana2], { origem: 'teto', teto_minutos: 180, periodicidade: 'semanal' })

        const v = resultado.registros.find(r => r.id === semana2.id)!.valores
        expect(v.base_semana_registro_id).toBe(semana1.id)
        expect(v.extra_semana).toBe(300)
        // semana 1: 3h pagas; semana 2: +3h de teto sobre as 5h novas
        expect(v.pagas_periodo).toBe(360)
    })

    it('fechamento não publicado é recalculado, mas não serve de base', () => {
        const a = agosto()
        const naFila = registro({ periodo_inicio: '2026-08-26', data_referencia: '2026-09-30', dados: dados('40:00'), publicado: false })
        const s = setembro()
        const resultado = recalcular([a, naFila, s], semTeto)

        expect(saldoDe(resultado, naFila.id)).toBe(40 * 60)
        // setembro herda agosto (+15h), não o registro na fila
        expect(saldoDe(resultado, s.id)).toBe(1200)
    })

    it('registro que a regra atual não calcula fica como estava e continua como base', () => {
        const a = registro({
            periodo_inicio: '2026-08-26',
            data_referencia: '2026-09-25',
            dados: { colunas: [...colunas, 'Nova'], totais: ['', '176:00', '20:00', '05:00', '01:00'] },
            banco_periodo: 300,
            negativa_periodo: 300,
        })
        const s = setembro()
        const resultado = recalcular([a, s], semTeto)

        expect(resultado.registros.map(r => r.id)).toEqual([s.id])
        expect(resultado.falhas).toEqual([
            { colaborador_id: 7, referencia: '2026-09-25', mensagem: 'Coluna não mapeada: Nova' },
        ])
        // herda o banco gravado (+5h, já sem as negativas); setembro: +5h + 15h − 10h
        expect(saldoDe(resultado, s.id)).toBe(600)
    })

    it('recalcula o valor ao vivo e o histórico diário sobre as bases recalculadas', () => {
        const a = agosto()
        const aoVivo: RegistroAoVivo = {
            colaborador_id: 7, periodo_inicio: '2026-09-26', dados_ate: '2026-10-15', dados_desde: null, dados: dados('15:00', '10:00'),
        }
        const dia: DiaGravado = {
            colaborador_id: 7,
            dia: '2026-10-14',
            periodo_inicio: '2026-09-26',
            extra_periodo: 900,
            negativa_periodo: 600,
            pagas_periodo: 900,
            saldo_banco_total: -1000,
        }
        const resultado = recalcular([a], teto10h, { aoVivo: [aoVivo], dias: [dia] })

        // agosto com teto: +5h; período atual: saldo 15h − 10h = 5h, tudo pago
        expect(resultado.aoVivo[0].valores.saldo_banco_total).toBe(300)
        expect(resultado.dias[0].valores).toMatchObject({ pagas_periodo: 300, banco_periodo: 0, saldo_banco_total: 300 })
    })

    it('congelar dados passados: registro com só os dias novos soma à base recalculada', () => {
        const semana1 = registro({ periodo_inicio: '2026-09-26', data_referencia: '2026-10-06', dados_desde: '2026-09-26', dados: dados('04:00') })
        const semana2 = registro({ periodo_inicio: '2026-09-26', data_referencia: '2026-10-13', dados_desde: '2026-10-07', dados: dados('05:00', '01:00') })
        const aoVivo: RegistroAoVivo = {
            colaborador_id: 7, periodo_inicio: '2026-09-26', dados_ate: '2026-10-15', dados_desde: '2026-10-14', dados: dados('02:00'),
        }
        const resultado = recalcular([semana2, semana1], { origem: 'teto', teto_minutos: 180, periodicidade: 'semanal' }, { aoVivo: [aoVivo] })

        const v = resultado.registros.find(r => r.id === semana2.id)!.valores
        // semana 1: 4h, 3h pagas; semana 2: +5h e 1h de falta = 4h de saldo novo (3h pagas pelo teto)
        expect(v).toMatchObject({
            extra_periodo: 540, negativa_periodo: 60, pagas_periodo: 360, banco_periodo: 120,
            extra_semana: 300, base_semana_registro_id: semana1.id,
        })
        // ao vivo: os 2h de 14 e 15/10 sobre a semana 2 (teto da semana: 2h pagas)
        expect(resultado.aoVivo[0].valores).toMatchObject({ extra_periodo: 660, pagas_periodo: 480, banco_periodo: 120 })
    })

    it('cada colaborador tem a sua cadeia', () => {
        const ana = registro({ colaborador_id: 1, periodo_inicio: '2026-08-26', data_referencia: '2026-09-25', dados: dados('10:00') })
        const bruno = registro({ colaborador_id: 2, periodo_inicio: '2026-09-26', data_referencia: '2026-10-13', dados: dados('00:00') })
        const resultado = recalcular([ana, bruno], semTeto)
        expect(saldoDe(resultado, bruno.id)).toBe(0)
    })
})

describe('regraDaConfiguracao', () => {
    it('teto só vale com origem teto', () => {
        expect(regraDaConfiguracao({ origem_horas_pagas: 'teto', teto_horas_pagas_minutos: 2400, teto_periodicidade: 'mensal' }))
            .toEqual({ origem: 'teto', teto_minutos: 2400, periodicidade: 'mensal' })
        expect(regraDaConfiguracao({ origem_horas_pagas: 'coluna_secullum', teto_horas_pagas_minutos: 2400, teto_periodicidade: 'mensal' }))
            .toEqual({ origem: 'coluna_secullum', teto_minutos: null, periodicidade: null })
    })
})
