import { colunaDeBatida } from '../integrations/secullum/parser'
import type { TotaisSecullum } from '../integrations/secullum/tipos'
import { somarPorCampo, type ItemMapeamento } from './calculo-horas.service'

export type HorasDoDia = {
    dia: string
    extra: number
    negativa: number
    /** Entradas e saídas do dia, na ordem das colunas ("09:33", "15:00", ...). */
    marcacoes: string[]
}

/** Extras e negativas de cada dia pelo mesmo mapeamento de colunas dos totais: a soma dos dias bate com o período. */
export function horasPorDia(dados: TotaisSecullum, mapeamento: ItemMapeamento[]): HorasDoDia[] {
    return (dados.dias ?? []).map(({ dia, valores }) => {
        const soma = somarPorCampo({ colunas: dados.colunas, totais: valores }, mapeamento)
        const marcacoes = dados.colunas.flatMap((coluna, i) =>
            colunaDeBatida(coluna) && valores[i].trim() ? [valores[i].trim()] : [],
        )
        return { dia, extra: soma.extra, negativa: soma.negativa, marcacoes }
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
