import { colunaDeBatida, horaSecullumParaMinutos } from '../integrations/secullum/parser'
import type { TotaisSecullum } from '../integrations/secullum/tipos'
import { minutosParaHoras } from '../utils/minutos'
import type { ItemMapeamento } from './calculo-horas.service'

/*
 * A FriPonto põe o intervalo pré-assinalado (ex.: 15:00 e 16:00) em colunas fixas do dia, mesmo quando o
 * colaborador bateu o intervalo de verdade. As batidas chegam fora de ordem (10:30, 15:00, 16:00, 12:55, ...)
 * e os pares viram "virada de noite": 24h de extra num dia normal. Aqui o dia é refeito antes de gravar:
 * com batida real de intervalo, o pré-assinalado sai; as batidas são ordenadas e as extras e negativas do dia
 * mudam pela diferença entre o trabalhado certo e o que a FriPonto calculou.
 */

const HORARIO = /^\d{1,2}:\d{2}$/
const minutos = (hora: string) => {
    const [h, m] = hora.split(':').map(Number)
    return h * 60 + m
}

/** Trabalhado pelos pares em sequência; saída antes da entrada é virada de noite. */
export function trabalhadoDosPares(horarios: string[]) {
    let total = 0
    for (let i = 0; i + 1 < horarios.length; i += 2) total += (minutos(horarios[i + 1]) - minutos(horarios[i]) + 1440) % 1440
    return total
}

/**
 * Batidas que contam no dia: sem o pré-assinalado quando há batida real de intervalo (4 ou mais reais, em par),
 * em ordem de horário a partir da primeira batida (o que vem antes dela é do dia seguinte: turno da noite).
 */
export function batidasQueContam(horarios: string[], preAssinaladas: string[]) {
    const pre = [...preAssinaladas]
    const reais = horarios.filter(h => {
        const i = pre.indexOf(h)
        if (i < 0) return true
        pre.splice(i, 1)
        return false
    })
    const base = reais.length >= 4 && reais.length % 2 === 0 ? reais : horarios
    if (base.length === 0) return base
    const inicio = minutos(base[0])
    return [...base].sort((a, b) => ((minutos(a) - inicio + 1440) % 1440) - ((minutos(b) - inicio + 1440) % 1440))
}

const chave = (coluna: string) => coluna.trim().toLowerCase()

/**
 * Dias com batida fora de ordem ou pré-assinalado sobrando refeitos, e os totais do período ajustados pela mesma
 * diferença. Dia ímpar, sem coluna de extra ou negativa, ou já certo fica como a FriPonto mandou.
 */
export function corrigirDias(dados: TotaisSecullum, preAssinaladas: Map<string, string[]>, mapeamento: ItemMapeamento[]) {
    if (!dados.dias?.length) return { dados, corrigidos: [] as string[] }

    const campo = new Map(mapeamento.map(m => [chave(m.coluna_secullum), m.campo]))
    const indicesDe = (alvo: 'extra' | 'negativa') => dados.colunas.flatMap((c, i) => (campo.get(chave(c)) === alvo ? [i] : []))
    const iExtra = indicesDe('extra')
    const iNegativa = indicesDe('negativa')
    const iBatidas = dados.colunas.flatMap((c, i) => (colunaDeBatida(c) ? [i] : []))
    if (iExtra.length === 0 || iNegativa.length === 0) return { dados, corrigidos: [] }

    const ajusteTotais = new Map<number, number>()
    const corrigidos: string[] = []
    const dias = dados.dias.map(d => {
        try {
            return corrigirDia(d)
        } catch {
            return d // valor fora do formato: o dia fica como veio e a coleta trata o erro como antes
        }
    })

    function corrigirDia(d: NonNullable<TotaisSecullum['dias']>[number]) {
        const horarios = iBatidas.map(i => d.valores[i].trim()).filter(Boolean)
        // atalho: dia ímpar fica com o cálculo da FriPonto (não dá para saber como ela parou o par)
        if (horarios.length === 0 || horarios.length % 2 === 1 || !horarios.every(h => HORARIO.test(h))) return d
        const certas = batidasQueContam(horarios, preAssinaladas.get(d.dia) ?? [])
        if (certas.length % 2 === 1 || certas.join() === horarios.join()) return d

        const valores = [...d.valores]
        const soma = (indices: number[]) => indices.reduce((s, i) => s + Math.abs(horaSecullumParaMinutos(valores[i])), 0)
        // atalho: a diferença vai inteira para extra ou negativa, sem tolerância, adicional noturno ou 50%/100%
        const saldo = soma(iExtra) - soma(iNegativa) + trabalhadoDosPares(certas) - trabalhadoDosPares(horarios)
        const maior = (indices: number[]) => indices.reduce((m, i) => (soma([i]) > soma([m]) ? i : m), indices[0])
        const destinoExtra = maior(iExtra)
        const destinoNegativa = maior(iNegativa)
        const ajustes: Array<[number, number]> = []
        for (const i of [...iExtra, ...iNegativa]) {
            const novo = i === destinoExtra ? Math.max(saldo, 0) : i === destinoNegativa ? Math.max(-saldo, 0) : 0
            const antigo = soma([i])
            if (novo === antigo) continue
            ajustes.push([i, novo - antigo])
            valores[i] = novo === 0 ? '' : minutosParaHoras(novo)
        }
        for (const [i, diferenca] of ajustes) ajusteTotais.set(i, (ajusteTotais.get(i) ?? 0) + diferenca)
        iBatidas.forEach((i, n) => (valores[i] = certas[n] ?? ''))
        corrigidos.push(d.dia)
        return { ...d, valores }
    }

    const totais = dados.totais.map((t, i) =>
        ajusteTotais.has(i) ? minutosParaHoras(Math.abs(horaSecullumParaMinutos(t)) + ajusteTotais.get(i)!) : t,
    )
    return { dados: { ...dados, totais, dias }, corrigidos }
}
