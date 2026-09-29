import { describe, expect, it } from 'vitest'
import { proximosCiclos, type CicloPrevisto, type ConfigCalendario } from '../../src/services/calendario.service'

const config: ConfigCalendario = {
    dia_semana_extracao: 3,
    hora_extracao: '06:00:00',
    dia_fechamento_mes: 25,
    dias_apos_fechamento_mes: 2,
    fuso_horario: 'America/Sao_Paulo',
}

const resumo = (c: CicloPrevisto) => `${c.tipo} ${c.periodo_inicio} ${c.data_referencia} ${c.gatilho_em.toISOString()}`
const diasEntre = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000
const diaSemanaUtc = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()

function ciclosEntre(cfg: ConfigCalendario, inicio: string, fim: string) {
    return proximosCiclos(cfg, new Date(inicio), 200).filter(c => c.gatilho_em < new Date(fim))
}

describe('proximosCiclos', () => {
    it('gera a régua de outubro/2026 (fechamento no domingo 25/10)', () => {
        const ciclos = ciclosEntre(config, '2026-09-27T09:00:00Z', '2026-11-12T00:00:00Z')
        expect(ciclos.map(resumo)).toEqual([
            'fechamento_mes 2026-08-26 2026-09-25 2026-09-27T09:00:00.000Z',
            'semanal 2026-09-26 2026-10-06 2026-10-07T09:00:00.000Z',
            'semanal 2026-09-26 2026-10-13 2026-10-14T09:00:00.000Z',
            'semanal 2026-09-26 2026-10-20 2026-10-21T09:00:00.000Z',
            'fechamento_mes 2026-09-26 2026-10-25 2026-10-27T09:00:00.000Z',
            'semanal 2026-10-26 2026-11-03 2026-11-04T09:00:00.000Z',
            'semanal 2026-10-26 2026-11-10 2026-11-11T09:00:00.000Z',
        ])
    })

    it('respeita aPartirDe (inclusive) e a quantidade', () => {
        const ciclos = proximosCiclos(config, new Date('2026-10-07T09:00:00Z'), 2)
        expect(ciclos.map(c => c.data_referencia)).toEqual(['2026-10-06', '2026-10-13'])
        expect(proximosCiclos(config, new Date('2026-10-07T09:00:01Z'), 1)[0].data_referencia).toBe('2026-10-13')
        expect(proximosCiclos(config, new Date(), 0)).toEqual([])
    })

    it('dia 25 numa terça (ago/2026): a quarta 26/08 vira fechamento em 27/08', () => {
        const ciclos = ciclosEntre(config, '2026-08-15T00:00:00Z', '2026-09-03T00:00:00Z')
        expect(ciclos.map(resumo)).toEqual([
            'semanal 2026-07-26 2026-08-18 2026-08-19T09:00:00.000Z',
            'fechamento_mes 2026-07-26 2026-08-25 2026-08-27T09:00:00.000Z',
            'semanal 2026-08-26 2026-09-01 2026-09-02T09:00:00.000Z',
        ])
    })

    it('dia 25 numa quarta (nov/2026): a quarta 25/11 roda normal e o fechamento sai na sexta 27/11', () => {
        const ciclos = ciclosEntre(config, '2026-11-20T00:00:00Z', '2026-12-10T00:00:00Z')
        expect(ciclos.map(resumo)).toEqual([
            'semanal 2026-10-26 2026-11-24 2026-11-25T09:00:00.000Z',
            'fechamento_mes 2026-10-26 2026-11-25 2026-11-27T09:00:00.000Z',
            'semanal 2026-11-26 2026-12-08 2026-12-09T09:00:00.000Z',
        ])
    })

    it('dia 25 numa sexta (set/2026): quarta 23/09 normal, quarta 30/09 vira fechamento no domingo 27/09', () => {
        const ciclos = ciclosEntre(config, '2026-09-20T00:00:00Z', '2026-10-01T00:00:00Z')
        expect(ciclos.map(resumo)).toEqual([
            'semanal 2026-08-26 2026-09-22 2026-09-23T09:00:00.000Z',
            'fechamento_mes 2026-08-26 2026-09-25 2026-09-27T09:00:00.000Z',
        ])
    })

    it('virada de ano: fechamento de dez/2026 e período 26/12 → 25/01', () => {
        const ciclos = ciclosEntre(config, '2026-12-20T00:00:00Z', '2027-02-01T00:00:00Z')
        expect(ciclos.map(resumo)).toEqual([
            'semanal 2026-11-26 2026-12-22 2026-12-23T09:00:00.000Z',
            'fechamento_mes 2026-11-26 2026-12-25 2026-12-27T09:00:00.000Z',
            'semanal 2026-12-26 2027-01-05 2027-01-06T09:00:00.000Z',
            'semanal 2026-12-26 2027-01-12 2027-01-13T09:00:00.000Z',
            'semanal 2026-12-26 2027-01-19 2027-01-20T09:00:00.000Z',
            'fechamento_mes 2026-12-26 2027-01-25 2027-01-27T09:00:00.000Z',
        ])
    })

    it('2026–2027: um fechamento por mês, dia 25 em todos os dias da semana, invariantes da tabela ciclos', () => {
        const ciclos = ciclosEntre(config, '2026-01-01T00:00:00Z', '2028-01-01T00:00:00Z')
        const fechamentos = ciclos.filter(c => c.tipo === 'fechamento_mes')
        expect(fechamentos).toHaveLength(24)
        expect(new Set(fechamentos.map(c => diaSemanaUtc(c.data_referencia))).size).toBe(7)

        for (const c of fechamentos) {
            expect(c.data_referencia.slice(8)).toBe('25')
            const gatilho = new Date(Date.parse(`${c.data_referencia}T09:00:00Z`) + 2 * 86400000)
            expect(c.gatilho_em.toISOString()).toBe(gatilho.toISOString())
        }

        for (const c of ciclos) {
            expect(c.periodo_inicio.slice(8)).toBe('26')
            expect(diasEntre(c.periodo_inicio, c.data_referencia)).toBeGreaterThanOrEqual(0)
            expect(diasEntre(c.periodo_inicio, c.data_referencia)).toBeLessThanOrEqual(30)
            if (c.tipo === 'semanal') {
                expect(c.gatilho_em.getUTCDay()).toBe(3)
                expect(c.gatilho_em.getUTCHours()).toBe(9)
                expect(diasEntre(c.data_referencia, c.gatilho_em.toISOString().slice(0, 10))).toBe(1)
                const dia = Number(c.data_referencia.slice(8))
                expect(dia >= 25 && dia <= 31).toBe(false)
            }
        }

        const referencias = ciclos.map(c => c.data_referencia)
        expect(new Set(referencias).size).toBe(referencias.length)
        for (let i = 1; i < ciclos.length; i++) expect(ciclos[i].gatilho_em >= ciclos[i - 1].gatilho_em).toBe(true)
    })

    it('dia de fechamento 28 com fevereiro não bissexto', () => {
        const cfg = { ...config, dia_fechamento_mes: 28, dias_apos_fechamento_mes: 0 }
        const ciclos = ciclosEntre(cfg, '2027-02-20T00:00:00Z', '2027-03-15T00:00:00Z')
        expect(ciclos.map(resumo)).toEqual([
            'semanal 2027-01-29 2027-02-23 2027-02-24T09:00:00.000Z',
            'fechamento_mes 2027-01-29 2027-02-28 2027-02-28T09:00:00.000Z',
            'semanal 2027-03-01 2027-03-09 2027-03-10T09:00:00.000Z',
        ])
    })

    it('converte a hora local do fuso, inclusive com horário de verão', () => {
        const ny = { ...config, fuso_horario: 'America/New_York', hora_extracao: '06:30' }
        const [out, nov] = [
            proximosCiclos(ny, new Date('2026-10-06T00:00:00Z'), 1)[0],
            proximosCiclos(ny, new Date('2026-11-03T00:00:00Z'), 1)[0],
        ]
        expect(out.gatilho_em.toISOString()).toBe('2026-10-07T10:30:00.000Z')
        expect(nov.gatilho_em.toISOString()).toBe('2026-11-04T11:30:00.000Z')
    })

    it('usa a data local (não UTC) para decidir o dia', () => {
        const ciclos = proximosCiclos(config, new Date('2026-10-07T02:00:00Z'), 1)
        expect(ciclos[0].gatilho_em.toISOString()).toBe('2026-10-07T09:00:00.000Z')
    })
})
