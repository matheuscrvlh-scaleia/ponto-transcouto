import type { TotaisSecullum } from '../integrations/secullum/tipos'
import {
    calcularHoras,
    mensagensErroMapeamento,
    valoresDoRegistro,
    type ItemMapeamento,
    type RegistroBase,
    type RegraPagas,
    type ValoresRegistro,
} from './calculo-horas.service'

/*
 * Recálculo do histórico: a regra de horas pagas e o mapeamento de colunas valem para todos
 * os registros, não só para os próximos. O saldo é acumulado (cada período herda o anterior),
 * então tudo é refeito em ordem, com as mesmas bases da extração (buscarRegistroAnterior e
 * saldoPeriodosAnteriores), a partir dos totais da FriPonto já gravados.
 */

type ValoresGravados = Pick<ValoresRegistro, 'extra_periodo' | 'negativa_periodo' | 'pagas_periodo' | 'banco_periodo'>

/** Registro de um fechamento (publicado ou ainda na fila), com os totais que vieram da FriPonto. */
export type RegistroGravado = ValoresGravados & {
    id: number | string
    colaborador_id: number
    fechamento_id: number
    publicado: boolean
    periodo_inicio: string
    data_referencia: string
    dados: TotaisSecullum
}

/** Valor ao vivo (tempo real) do período atual. */
export type RegistroAoVivo = {
    colaborador_id: number
    periodo_inicio: string
    dados_ate: string
    dados: TotaisSecullum
}

/** Dia do histórico diário do tempo real: só os totais já somados ficam gravados. */
export type DiaGravado = {
    colaborador_id: number
    dia: string
    periodo_inicio: string
    extra_periodo: number
    negativa_periodo: number
    pagas_periodo: number
    saldo_banco_total: number
}

export type FalhaRecalculo = { colaborador_id: number, referencia: string, mensagem: string }

export type ResultadoRecalculo = {
    registros: Array<{ id: number | string, valores: ValoresRegistro }>
    aoVivo: Array<{ colaborador_id: number, valores: ValoresRegistro }>
    dias: Array<{ colaborador_id: number, dia: string, valores: ValoresRegistro }>
    /** Registros que a regra atual não consegue calcular (ex.: coluna sem mapeamento): ficam como estavam. */
    falhas: FalhaRecalculo[]
}

export function regraDaConfiguracao(config: {
    origem_horas_pagas: RegraPagas['origem']
    teto_horas_pagas_minutos: number | null
    teto_periodicidade: 'semanal' | 'mensal' | null
}): RegraPagas {
    const teto = config.origem_horas_pagas === 'teto'
    return {
        origem: config.origem_horas_pagas,
        teto_minutos: teto ? config.teto_horas_pagas_minutos : null,
        periodicidade: teto ? config.teto_periodicidade : null,
    }
}

type Base = RegistroBase & { periodo_inicio: string, data_referencia: string }

/** Registros publicados já recalculados de cada colaborador: as bases dos seguintes. */
class Bases {
    private porColaborador = new Map<number, Base[]>()

    adicionar(colaboradorId: number, base: Base) {
        const lista = this.porColaborador.get(colaboradorId) ?? []
        lista.push(base)
        this.porColaborador.set(colaboradorId, lista)
    }

    /** Mesma regra de buscarRegistroAnterior: o mais recente do mesmo período antes da data. */
    anterior(colaboradorId: number, periodoInicio: string, dataReferencia: string): RegistroBase | null {
        let melhor: Base | null = null
        for (const b of this.porColaborador.get(colaboradorId) ?? []) {
            if (b.periodo_inicio !== periodoInicio || b.data_referencia >= dataReferencia) continue
            if (!melhor || b.data_referencia >= melhor.data_referencia) melhor = b
        }
        return melhor
    }

    /** Mesma regra de saldoPeriodosAnteriores: banco − negativas do último registro de cada período anterior. */
    saldoAnterior(colaboradorId: number, periodoInicio: string) {
        const ultimoDoPeriodo = new Map<string, Base>()
        for (const b of this.porColaborador.get(colaboradorId) ?? []) {
            if (b.periodo_inicio >= periodoInicio) continue
            const atual = ultimoDoPeriodo.get(b.periodo_inicio)
            if (!atual || b.data_referencia >= atual.data_referencia) ultimoDoPeriodo.set(b.periodo_inicio, b)
        }
        let saldo = 0
        for (const b of ultimoDoPeriodo.values()) saldo += b.banco_periodo - b.negativa_periodo
        return saldo
    }
}

function calcular(dados: TotaisSecullum, mapeamento: ItemMapeamento[], regra: RegraPagas, anterior: RegistroBase | null, saldo: number) {
    try {
        const resultado = calcularHoras({ dados, mapeamento, regra, anterior, saldoPeriodosAnteriores: saldo })
        return resultado.ok ? resultado : { ok: false as const, mensagem: mensagensErroMapeamento(resultado.erro).join(' ') }
    } catch (err) {
        return { ok: false as const, mensagem: (err as Error).message }
    }
}

export function recalcularHistorico(entrada: {
    registros: RegistroGravado[]
    aoVivo: RegistroAoVivo[]
    dias: DiaGravado[]
    mapeamento: ItemMapeamento[]
    regra: RegraPagas
}): ResultadoRecalculo {
    const { mapeamento, regra } = entrada
    const bases = new Bases()
    const resultado: ResultadoRecalculo = { registros: [], aoVivo: [], dias: [], falhas: [] }

    // em ordem: cada semana depende da anterior e cada período do saldo dos anteriores
    const registros = [...entrada.registros].sort(
        (a, b) => a.data_referencia.localeCompare(b.data_referencia) || a.fechamento_id - b.fechamento_id,
    )
    for (const r of registros) {
        const anterior = bases.anterior(r.colaborador_id, r.periodo_inicio, r.data_referencia)
        const saldo = bases.saldoAnterior(r.colaborador_id, r.periodo_inicio)
        const calculado = calcular(r.dados, mapeamento, regra, anterior, saldo)

        let valores: ValoresGravados
        if (calculado.ok) {
            resultado.registros.push({ id: r.id, valores: calculado.valores })
            valores = calculado.valores
        } else {
            // sem cálculo pela regra atual, o registro fica como está e continua servindo de base
            resultado.falhas.push({ colaborador_id: r.colaborador_id, referencia: r.data_referencia, mensagem: calculado.mensagem })
            valores = r
        }
        // como na extração, só fechamento publicado serve de base
        if (r.publicado) {
            bases.adicionar(r.colaborador_id, {
                id: r.id,
                periodo_inicio: r.periodo_inicio,
                data_referencia: r.data_referencia,
                extra_periodo: valores.extra_periodo,
                negativa_periodo: valores.negativa_periodo,
                pagas_periodo: valores.pagas_periodo,
                banco_periodo: valores.banco_periodo,
            })
        }
    }

    for (const r of entrada.aoVivo) {
        const anterior = bases.anterior(r.colaborador_id, r.periodo_inicio, r.dados_ate)
        const saldo = bases.saldoAnterior(r.colaborador_id, r.periodo_inicio)
        const calculado = calcular(r.dados, mapeamento, regra, anterior, saldo)
        if (calculado.ok) resultado.aoVivo.push({ colaborador_id: r.colaborador_id, valores: calculado.valores })
        else resultado.falhas.push({ colaborador_id: r.colaborador_id, referencia: r.dados_ate, mensagem: calculado.mensagem })
    }

    // o histórico diário não guarda os totais por coluna: as extras e negativas do dia ficam como
    // foram coletadas e só as pagas, o banco e o saldo seguem a regra atual
    const temSaldo = mapeamento.some(m => m.campo === 'saldo_banco')
    for (const d of entrada.dias) {
        const soma = {
            extra: d.extra_periodo,
            negativa: d.negativa_periodo,
            pagas: d.pagas_periodo,
            saldo_banco: d.saldo_banco_total,
            ignorar: 0,
            temSaldo,
        }
        const anterior = bases.anterior(d.colaborador_id, d.periodo_inicio, d.dia)
        const saldo = bases.saldoAnterior(d.colaborador_id, d.periodo_inicio)
        resultado.dias.push({ colaborador_id: d.colaborador_id, dia: d.dia, valores: valoresDoRegistro(soma, regra, anterior, saldo) })
    }

    return resultado
}
