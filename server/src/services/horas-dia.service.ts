import { colunaDeBatida, colunaInformativa, horaSecullumParaMinutos } from '../integrations/secullum/parser'
import type { TotaisSecullum } from '../integrations/secullum/tipos'
import { somarPorCampo, type ItemMapeamento } from './calculo-horas.service'

/** Valor de cada coluna de horas do dia, como veio da FriPonto ("Ex50%": "01:45"); colunas vazias ficam de fora. */
export type ColunasDoDia = Record<string, string>

export type HorasDoDia = {
    dia: string
    extra: number
    negativa: number
    /** Entradas e saídas do dia, na ordem das colunas ("09:33", "15:00", ...). */
    marcacoes: string[]
    colunas: ColunasDoDia
}

/** Extras e negativas de cada dia pelo mesmo mapeamento de colunas dos totais: a soma dos dias bate com o período. */
export function horasPorDia(dados: TotaisSecullum, mapeamento: ItemMapeamento[]): HorasDoDia[] {
    return (dados.dias ?? []).map(({ dia, valores }) => {
        const soma = somarPorCampo({ colunas: dados.colunas, totais: valores }, mapeamento)
        const marcacoes = dados.colunas.flatMap((coluna, i) =>
            colunaDeBatida(coluna) && valores[i].trim() ? [valores[i].trim()] : [],
        )
        const colunas = Object.fromEntries(
            dados.colunas.flatMap((coluna, i) => (!colunaInformativa(coluna) && valores[i].trim() ? [[coluna.trim(), valores[i].trim()]] : [])),
        )
        return { dia, extra: soma.extra, negativa: soma.negativa, marcacoes, colunas }
    })
}

/** Dia fora do formato não derruba a coleta: os totais são gravados e os dias ficam para a próxima. */
export function diasOuNada(dados: TotaisSecullum, mapeamento: ItemMapeamento[], avisar: (mensagem: string) => void) {
    try {
        return horasPorDia(dados, mapeamento)
    } catch (err) {
        avisar(`horas por dia não gravadas: ${(err as Error).message}`)
        return []
    }
}

/** Extras e negativas de um dia já gravado, pelo mapeamento atual (recálculo). */
export function somarColunasDoDia(colunas: ColunasDoDia, mapeamento: ItemMapeamento[]) {
    const soma = somarPorCampo({ colunas: Object.keys(colunas), totais: Object.values(colunas) }, mapeamento)
    return { extra: soma.extra, negativa: soma.negativa }
}

export type ColunasPorCampo = {
    /** Colunas que somam nas extras e nas negativas, na ordem do mapeamento. */
    extra: string[]
    negativa: string[]
    /** As demais colunas de horas que vieram nos dias (ignoradas, pagas, saldo ou sem mapeamento). */
    fora: string[]
}

const chave = (coluna: string) => coluna.trim().toLowerCase()

/**
 * Colunas de horas dos dias em minutos, para a tela mostrar de onde vêm as extras e as negativas.
 * Valor que não é hora (ex.: "0" na Refeição) fica de fora; os nomes seguem como vieram da FriPonto.
 */
export function colunasEmMinutos(dias: ColunasDoDia[], mapeamento: ItemMapeamento[]) {
    // nome de cada coluna como apareceu primeiro: o mesmo em todos os dias
    const presentes = new Map<string, string>()
    const minutos = dias.map(colunas => {
        const dia: Record<string, number> = {}
        for (const [coluna, valor] of Object.entries(colunas)) {
            let valorMinutos: number
            try {
                valorMinutos = horaSecullumParaMinutos(valor)
            } catch {
                continue // não é hora
            }
            if (!presentes.has(chave(coluna))) presentes.set(chave(coluna), coluna)
            dia[presentes.get(chave(coluna))!] = valorMinutos
        }
        return dia
    })

    const doCampo = (campo: 'extra' | 'negativa') =>
        mapeamento.flatMap(m => (m.campo === campo && presentes.has(chave(m.coluna_secullum)) ? [presentes.get(chave(m.coluna_secullum))!] : []))
    const extra = doCampo('extra')
    const negativa = doCampo('negativa')
    const somam = new Set([...extra, ...negativa])
    const fora = [...presentes.values()].filter(c => !somam.has(c)).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    return { minutos, colunas: { extra, negativa, fora } satisfies ColunasPorCampo }
}
