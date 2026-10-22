import { horaSecullumParaMinutos, totaisPorColuna } from '../integrations/secullum/parser'
import type { TotaisSecullum } from '../integrations/secullum/tipos'

export type CampoMapeado = 'extra' | 'negativa' | 'pagas' | 'saldo_banco' | 'ignorar'

export type ItemMapeamento = {
    coluna_secullum: string
    campo: CampoMapeado
}

export type RegraPagas = {
    origem: 'teto' | 'coluna_secullum'
    teto_minutos: number | null
    periodicidade: 'semanal' | 'mensal' | null
}

export type RegistroBase = {
    id: number | string
    extra_periodo: number
    negativa_periodo: number
    pagas_periodo: number
    banco_periodo: number
}

export type EntradaCalculoHoras = {
    dados: TotaisSecullum
    mapeamento: ItemMapeamento[]
    regra: RegraPagas
    anterior: RegistroBase | null
    saldoPeriodosAnteriores: number
    /** Congelar dados passados: `dados` traz só os dias depois do `anterior`, e o período é o anterior mais eles. */
    somarAoAnterior?: boolean
}

export type ValoresRegistro = {
    extra_periodo: number
    negativa_periodo: number
    pagas_periodo: number
    banco_periodo: number
    extra_semana: number
    negativa_semana: number
    pagas_semana: number
    banco_semana: number
    saldo_banco_total: number
    base_semana_registro_id: number | string | null
}

export type ErroMapeamento = {
    colunasNaoMapeadas: string[]
    mensagens: string[]
}

export type ResultadoCalculoHoras =
    | { ok: true, valores: ValoresRegistro }
    | { ok: false, erro: ErroMapeamento }

const chave = (coluna: string) => coluna.trim().toLowerCase()
const PREFIXO_NAO_MAPEADA = 'Coluna não mapeada: '

export function validarMapeamento(dados: TotaisSecullum, mapeamento: ItemMapeamento[], regra: RegraPagas): ErroMapeamento | null {
    const recebidas = [...totaisPorColuna(dados).keys()]
    const mapeadas = new Map(mapeamento.map(m => [chave(m.coluna_secullum), m]))
    const recebidasChaves = new Set(recebidas.map(chave))

    // coluna mapeada que não veio conta como zero: unidades da mesma empresa podem ter cálculos com colunas diferentes
    const colunasNaoMapeadas = recebidas.filter(c => !mapeadas.has(chave(c)))

    const mensagens: string[] = []
    const temCampo = (campo: CampoMapeado) => mapeamento.some(m => m.campo === campo && recebidasChaves.has(chave(m.coluna_secullum)))
    if (!temCampo('extra')) mensagens.push('Nenhuma coluna mapeada como "extra".')
    if (regra.origem === 'coluna_secullum' && !temCampo('pagas')) {
        mensagens.push('origem_horas_pagas = coluna_secullum, mas nenhuma coluna está mapeada como "pagas".')
    }

    if (colunasNaoMapeadas.length === 0 && mensagens.length === 0) return null
    return { colunasNaoMapeadas, mensagens }
}

export function somarPorCampo(dados: TotaisSecullum, mapeamento: ItemMapeamento[]) {
    const campoDaColuna = new Map(mapeamento.map(m => [chave(m.coluna_secullum), m.campo]))
    const soma: Record<CampoMapeado, number> = { extra: 0, negativa: 0, pagas: 0, saldo_banco: 0, ignorar: 0 }
    let temSaldo = false

    for (const [coluna, valor] of totaisPorColuna(dados)) {
        const campo = campoDaColuna.get(chave(coluna))
        if (!campo || campo === 'ignorar') continue
        const minutos = horaSecullumParaMinutos(valor)
        if (campo === 'saldo_banco') {
            soma.saldo_banco = minutos
            temSaldo = true
        } else if (campo === 'negativa') {
            soma.negativa += Math.abs(minutos)
        } else {
            if (minutos < 0) throw new Error(`Coluna "${coluna}" (${campo}) veio negativa: "${valor}".`)
            soma[campo] += minutos
        }
    }

    return { ...soma, temSaldo }
}

export function calcularPagas(extra: number, regra: RegraPagas, colunaPagas: number, anterior: RegistroBase | null) {
    if (regra.origem === 'coluna_secullum') return Math.min(colunaPagas, extra)

    const teto = regra.teto_minutos ?? 0
    if (regra.periodicidade === 'semanal') {
        const pagasAntes = anterior?.pagas_periodo ?? 0
        const extraDaSemana = Math.max(extra - (anterior?.extra_periodo ?? 0), 0)
        return Math.min(extra, pagasAntes + Math.min(extraDaSemana, teto))
    }
    return Math.min(extra, teto)
}

export type SomaPorCampo = ReturnType<typeof somarPorCampo>

/**
 * Congelar dados passados: soma os dias novos aos valores do registro anterior, que não mudam mais.
 * As pagas da coluna da FriPonto somam ao que já foi pago (limitadas às extras dos dias novos);
 * o saldo da coluna da FriPonto, se mapeada, é o que veio agora.
 */
export function somarAoAnterior(soma: SomaPorCampo, anterior: RegistroBase): SomaPorCampo {
    return {
        ...soma,
        extra: anterior.extra_periodo + soma.extra,
        negativa: anterior.negativa_periodo + soma.negativa,
        pagas: anterior.pagas_periodo + Math.min(soma.pagas, soma.extra),
    }
}

/** Valores do registro a partir das somas do período (usado também pelo recálculo do histórico). */
export function valoresDoRegistro(
    soma: SomaPorCampo, regra: RegraPagas, anterior: RegistroBase | null, saldoPeriodosAnteriores: number,
): ValoresRegistro {
    const extra = soma.extra
    const negativa = soma.negativa
    const pagas = calcularPagas(extra, regra, soma.pagas, anterior)
    const banco = Math.max(extra - pagas, 0)

    return {
        extra_periodo: extra,
        negativa_periodo: negativa,
        pagas_periodo: pagas,
        banco_periodo: banco,
        extra_semana: extra - (anterior?.extra_periodo ?? 0),
        negativa_semana: negativa - (anterior?.negativa_periodo ?? 0),
        pagas_semana: pagas - (anterior?.pagas_periodo ?? 0),
        banco_semana: banco - (anterior?.banco_periodo ?? 0),
        saldo_banco_total: soma.temSaldo ? soma.saldo_banco : saldoPeriodosAnteriores + banco - negativa,
        base_semana_registro_id: anterior?.id ?? null,
    }
}

export function calcularHoras(entrada: EntradaCalculoHoras): ResultadoCalculoHoras {
    const erro = validarMapeamento(entrada.dados, entrada.mapeamento, entrada.regra)
    if (erro) return { ok: false, erro }

    let soma = somarPorCampo(entrada.dados, entrada.mapeamento)
    if (entrada.somarAoAnterior && entrada.anterior) soma = somarAoAnterior(soma, entrada.anterior)
    return { ok: true, valores: valoresDoRegistro(soma, entrada.regra, entrada.anterior, entrada.saldoPeriodosAnteriores) }
}

export function mensagensErroMapeamento(erro: ErroMapeamento) {
    return [
        ...erro.colunasNaoMapeadas.map(c => `${PREFIXO_NAO_MAPEADA}${c}`),
        ...erro.mensagens,
    ]
}

export function colunasDasMensagensDeErro(mensagens: string[]) {
    return mensagens.flatMap(m => (m.startsWith(PREFIXO_NAO_MAPEADA) ? [m.slice(PREFIXO_NAO_MAPEADA.length).trim()] : []))
}
