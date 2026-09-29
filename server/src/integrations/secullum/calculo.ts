import { ROTA_TOTAIS, type ClienteSecullum } from './cliente'
import { lerTotais } from './parser'
import type { FiltroCalculo, TotaisSecullum } from './tipos'

export async function calcularTotais(cliente: ClienteSecullum, filtro: FiltroCalculo): Promise<TotaisSecullum> {
    const resposta = await cliente.calcular(ROTA_TOTAIS, {
        FuncionarioCpf: filtro.cpf,
        DataInicial: filtro.dataInicial,
        DataFinal: filtro.dataFinal,
    })
    return lerTotais(resposta)
}
