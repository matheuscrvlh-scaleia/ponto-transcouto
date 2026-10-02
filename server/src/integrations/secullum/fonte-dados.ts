import type { ClienteSecullum } from './cliente'
import { cpfDaSecullum, dataIsoOuNula, normalizarChaves, numeroOuNulo, textoOuNulo } from './normalizar'
import { SecullumError, type MarcacaoSecullum } from './tipos'

/** A FonteDados/APartirDoId devolve no máximo isto por chamada (paginar pelo último Id). */
export const LIMITE_PAGINA_FONTE_DADOS = 5000

function horaOuNula(valor: unknown) {
    const texto = textoOuNulo(valor)
    const partes = texto ? /(?:^|T|\s)(\d{1,2})[:-](\d{2})(?::(\d{2}))?/.exec(texto) : null
    if (!partes || Number(partes[1]) > 23) return null
    return `${partes[1].padStart(2, '0')}:${partes[2]}${partes[3] ? `:${partes[3]}` : ''}`
}

function dataHoraOuNula(valor: unknown) {
    const texto = textoOuNulo(valor)
    if (!texto || texto.startsWith('0001-')) return null
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto) ? texto.slice(0, 19) : dataIsoOuNula(texto)
}

/** Marcações sem Id, data ou hora válidas são descartadas. */
export function lerMarcacoes(resposta: unknown, rota: string): MarcacaoSecullum[] {
    if (!Array.isArray(resposta)) throw new SecullumError(`Secullum ${rota}: resposta não é uma lista.`, 'formato')
    return resposta.flatMap(item => {
        const m = normalizarChaves(item)
        const id = numeroOuNulo(m.id)
        const data = dataIsoOuNula(m.data)
        const hora = horaOuNula(m.hora)
        if (id === null || !data || !hora) return []
        return [{
            id,
            funcionarioId: numeroOuNulo(m.funcionarioid),
            cpf: cpfDaSecullum(m.funcionariocpf),
            data,
            hora,
            tipo: numeroOuNulo(m.tipo) ?? 0,
            origem: numeroOuNulo(m.origem) ?? 0,
            equipamentoId: numeroOuNulo(m.equipamentoid),
            incluidaEm: dataHoraOuNula(m.datainclusao),
        }]
    })
}

/** Marcações com Id >= `aPartirDoId` (até LIMITE_PAGINA_FONTE_DADOS). */
export async function marcacoesAPartirDoId(cliente: ClienteSecullum, aPartirDoId: number) {
    const rota = 'FonteDados/APartirDoId'
    return lerMarcacoes(await cliente.get(rota, { fonteDadosId: String(aPartirDoId) }), rota)
}

/** Marcações de um intervalo de datas ('yyyy-MM-dd'), de todos os funcionários. */
export async function marcacoesDoPeriodo(cliente: ClienteSecullum, dataInicio: string, dataFim: string) {
    const rota = 'FonteDados'
    return lerMarcacoes(await cliente.get(rota, { dataInicio, dataFim }), rota)
}
