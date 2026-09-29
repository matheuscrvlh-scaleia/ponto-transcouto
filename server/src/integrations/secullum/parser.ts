import { horasParaMinutos } from '../../utils/minutos'
import { normalizarChaves } from './normalizar'
import { SecullumError, type TotaisSecullum } from './tipos'

const COLUNAS_SEM_HORAS = new Set(['data', 'dia', 'datas'])
const COLUNA_DE_BATIDA = /^(entrada|sa[ií]da)\s*\d+$/i

export function colunaInformativa(coluna: string) {
    const nome = coluna.trim()
    return COLUNAS_SEM_HORAS.has(nome.toLowerCase()) || COLUNA_DE_BATIDA.test(nome)
}

export function lerTotais(resposta: unknown): TotaisSecullum {
    const dados = normalizarChaves(resposta)
    const colunas = dados.colunas
    const totais = dados.totais
    if (!Array.isArray(colunas) || !Array.isArray(totais)) {
        throw new SecullumError('Secullum Calcular: resposta sem Colunas/Totais.', 'formato')
    }
    if (colunas.length !== totais.length) {
        throw new SecullumError(`Secullum Calcular: ${colunas.length} colunas e ${totais.length} totais.`, 'formato')
    }
    return {
        colunas: colunas.map(c => String(c ?? '').trim()),
        totais: totais.map(t => (t === null || t === undefined ? '' : String(t))),
    }
}

// Aceita "08:48", "125:30", "-03:15", "03:15-" (sinal no fim) e vazio. Centesimal ("8,80") é recusado.
export function horaSecullumParaMinutos(valor: string) {
    const texto = (valor ?? '').trim()
    if (texto === '' || texto === '-' || texto === '--:--') return 0

    const partes = /^([+-])?(\d{1,5}):([0-5]\d)(-)?$/.exec(texto)
    if (!partes) throw new SecullumError(`Formato de horas não suportado: "${valor}"`, 'formato')

    const negativo = partes[1] === '-' || partes[4] === '-'
    return horasParaMinutos(`${negativo ? '-' : ''}${partes[2]}:${partes[3]}`)
}

export function totaisPorColuna(dados: TotaisSecullum) {
    const mapa = new Map<string, string>()
    dados.colunas.forEach((coluna, i) => {
        if (!colunaInformativa(coluna)) mapa.set(coluna.trim(), dados.totais[i] ?? '')
    })
    return mapa
}
