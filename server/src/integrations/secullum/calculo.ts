import { ROTA_CALCULO, type ClienteSecullum } from './cliente'
import { lerTotais } from './parser'
import type { FiltroCalculo, TotaisSecullum } from './tipos'

/** Totais do período e as horas de cada dia, numa chamada só. */
export async function calcularPeriodo(cliente: ClienteSecullum, filtro: FiltroCalculo): Promise<TotaisSecullum> {
    const resposta = await cliente.calcular(ROTA_CALCULO, {
        FuncionarioCpf: filtro.cpf,
        DataInicial: filtro.dataInicial,
        DataFinal: filtro.dataFinal,
    })
    return lerTotais(resposta)
}
