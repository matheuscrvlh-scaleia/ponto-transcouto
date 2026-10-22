import type {
  BatidaDoDia,
  DataISO,
  DiaHistorico,
  DiasDetalhe,
  Minutos,
  SemanaHistorico,
} from '../types/api'
import { diasEntre, formatarMinutos, somarDias } from './formato'

/*
 * Histórico do colaborador por dia: junta os fechamentos (semanas), o histórico diário (tempo real) e as
 * horas por dia (horas_dia + batidas) numa lista de seções com os dias dentro. Nada aqui recalcula extra ou
 * negativa: os valores de cada dia vêm da mesma coleta que gera os totais. O que se calcula é só o acumulado
 * (saldo e extras do período até o dia) e a conferência das batidas.
 */

type DiaApi = DiasDetalhe['dias'][number]

/** Um dia não tem mais que 24h; extra maior que isso é erro de marcação, não hora extra. */
export const MINUTOS_NO_DIA = 24 * 60

const HORA = /^\d{1,2}:\d{2}$/

export const ehHorario = (texto: string) => HORA.test(texto.trim())

const minutosDe = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/** Marcação que entrou no cálculo, com a batida do log que tem o mesmo horário (origem, situação). */
export interface MarcacaoDoDia {
  hora: string
  /** "Entrada 1", "Saída 1", ... pela ordem em que a FriPonto usou. */
  rotulo: string
  batida: BatidaDoDia | null
}

export interface DiaCalculado {
  dia: DataISO
  temCalculo: boolean
  extra: Minutos
  negativa: Minutos
  extraAcima: boolean
  negativaAcima: boolean
  /** "Folga", "Falta"... quando a FriPonto não trouxe horários e sim uma situação. */
  situacao: string | null
  marcacoes: MarcacaoDoDia[]
  /** Batidas do log que não entraram no cálculo (desconsideradas, repetidas). */
  foraDoCalculo: BatidaDoDia[]
  /** Tempo entre as batidas em pares; null se o dia está incompleto ou fora de ordem. */
  trabalhado: Minutos | null
  /** O que conferir neste dia (batida faltando, fora de ordem, extra maior que 24h). */
  avisos: string[]
  /** Saldo do banco até o fim do dia; null se não há de onde partir. */
  saldo: Minutos | null
  /** true: valor gravado pela FriPonto no dia (tempo real); false: saldo anterior + extras - negativas. */
  saldoExato: boolean
  /** Extras / negativas acumuladas no período de apuração até o fim do dia. */
  extraPeriodo: Minutos | null
  negativaPeriodo: Minutos | null
}

export interface Totais {
  extra: Minutos
  negativa: Minutos
  pagas: Minutos
  banco: Minutos
  saldo: Minutos
}

export type TipoSecao = 'semana' | 'andamento' | 'periodo'

export interface Secao {
  chave: string
  tipo: TipoSecao
  inicio: DataISO
  fim: DataISO
  /** Início do período de apuração (mês) em que a seção está: de onde vêm as extras acumuladas. */
  periodoInicio: DataISO
  /** Semana que fecha o mês (registro oficial do mês). */
  fechamentoMes: boolean
  /** Totais oficiais da seção; null na seção em andamento. */
  oficial: Totais | null
  /** Saldo no começo da seção (fim da anterior). */
  abertura: Minutos | null
  dias: DiaCalculado[]
  /** Soma dos dias com horas calculadas. */
  somaDias: { extra: Minutos; negativa: Minutos }
  diasAcima: number
  diasParaConferir: number
  /** Todos os dias da seção têm horas calculadas? Só então dá para comparar a soma dos dias com o oficial. */
  completa: boolean
  /** Soma dos dias menos o oficial (quando completa e há oficial). */
  diferenca: { extra: Minutos; negativa: Minutos } | null
}

interface Base {
  saldo: Minutos | null
  extra: Minutos
  negativa: Minutos
}

/** Lê as marcações do dia, casa com as batidas do log e confere a sequência. */
export function analisarDia(dia: DiaApi): Omit<DiaCalculado, 'saldo' | 'saldoExato' | 'extraPeriodo' | 'negativaPeriodo'> {
  const horarios = dia.marcacoes.map((m) => m.trim()).filter(ehHorario)
  const situacoes = [...new Set(dia.marcacoes.map((m) => m.trim()).filter((m) => m && !ehHorario(m)))]
  const situacao = situacoes.length ? situacoes.map((s) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1).toLocaleLowerCase('pt-BR')).join(' / ') : null

  // cada batida do log casa com uma marcação só (o mesmo horário pode aparecer duas vezes)
  const pool = [...dia.batidas]
  const marcacoes: MarcacaoDoDia[] = horarios.map((hora, i) => {
    const achada = pool.findIndex((b) => b.hora === hora.padStart(5, '0'))
    const batida = achada >= 0 ? pool.splice(achada, 1)[0] : null
    return { hora: hora.padStart(5, '0'), rotulo: `${i % 2 === 0 ? 'Entrada' : 'Saída'} ${Math.floor(i / 2) + 1}`, batida }
  })

  const avisos: string[] = []
  let trabalhado: Minutos | null = null
  if (horarios.length > 0) {
    if (horarios.length % 2 === 1) {
      avisos.push('Número ímpar de batidas: falta uma entrada ou uma saída.')
    }
    const minutos = horarios.map(minutosDe)
    const desordem = minutos.findIndex((m, i) => i > 0 && m < minutos[i - 1])
    if (desordem > 0) {
      avisos.push(
        `Batidas fora de ordem (${horarios[desordem]} depois de ${horarios[desordem - 1]}). O cálculo da FriPonto pode estar distorcido; confira as batidas pré-assinaladas.`,
      )
    }
    if (horarios.length % 2 === 0 && desordem < 0) {
      trabalhado = 0
      for (let i = 0; i < minutos.length; i += 2) trabalhado += minutos[i + 1] - minutos[i]
    }
  }
  if (dia.extra_min > MINUTOS_NO_DIA) {
    avisos.push(`Extra de ${formatarMinutos(dia.extra_min)} é maior que um dia inteiro: provável erro de marcação.`)
  }

  return {
    dia: dia.dia,
    temCalculo: dia.tem_calculo,
    extra: dia.extra_min,
    negativa: dia.negativa_min,
    extraAcima: dia.extra_acima,
    negativaAcima: dia.negativa_acima,
    situacao,
    marcacoes,
    foraDoCalculo: pool,
    trabalhado,
    avisos,
  }
}

/**
 * Dias em ordem cronológica com o acumulado. Saldo e extras do período partem da base (fim da seção anterior)
 * e somam o dia; quando a FriPonto gravou o valor do dia (`gravados`, tempo real) ele vale no lugar da conta.
 */
export function calcularDias(brutos: DiaApi[], base: Base, gravados?: Map<DataISO, DiaHistorico>): DiaCalculado[] {
  let saldo = base.saldo
  let extra = base.extra
  let negativa = base.negativa
  return brutos.map((bruto) => {
    const gravado = gravados?.get(bruto.dia)
    if (gravado) {
      saldo = gravado.saldo_total
      extra = gravado.extra_periodo
      negativa = gravado.negativa_periodo
    } else {
      extra += bruto.extra_min
      negativa += bruto.negativa_min
      if (saldo !== null) saldo += bruto.extra_min - bruto.negativa_min
    }
    return {
      ...analisarDia(bruto),
      saldo,
      saldoExato: Boolean(gravado),
      extraPeriodo: extra,
      negativaPeriodo: negativa,
    }
  })
}

function montarSecao(
  base: Pick<Secao, 'chave' | 'tipo' | 'inicio' | 'fim' | 'periodoInicio' | 'fechamentoMes' | 'oficial' | 'abertura'>,
  dias: DiaCalculado[],
): Secao {
  const comCalculo = dias.filter((d) => d.temCalculo)
  const somaDias = {
    extra: comCalculo.reduce((soma, d) => soma + d.extra, 0),
    negativa: comCalculo.reduce((soma, d) => soma + d.negativa, 0),
  }
  const esperados = diasEntre(base.inicio, base.fim) + 1
  const completa = comCalculo.length >= esperados
  return {
    ...base,
    dias,
    somaDias,
    diasAcima: dias.filter((d) => d.extraAcima || d.negativaAcima).length,
    diasParaConferir: dias.filter((d) => d.avisos.length > 0).length,
    completa,
    diferenca:
      completa && base.oficial
        ? { extra: somaDias.extra - base.oficial.extra, negativa: somaDias.negativa - base.oficial.negativa }
        : null,
  }
}

const noIntervalo = (dias: DiaApi[], inicio: DataISO, fim: DataISO) => dias.filter((d) => d.dia >= inicio && d.dia <= fim)

/**
 * Seções do modo semanal, da mais recente para a mais antiga: os dias desde o último fechamento (em andamento) e
 * uma por semana fechada. A semana vai do dia seguinte ao fechamento anterior do mesmo período até a referência.
 */
export function secoesSemanais(historico: SemanaHistorico[], dias: DiaApi[], hoje: DataISO): Secao[] {
  const crescente = [...historico].sort(
    (a, b) => a.data_referencia.localeCompare(b.data_referencia) || a.fechamento_id - b.fechamento_id,
  )
  const secoes: Secao[] = crescente.map((semana, i) => {
    const anterior = crescente[i - 1]
    const mesmoPeriodo = anterior?.periodo_inicio === semana.periodo_inicio
    const inicio = mesmoPeriodo ? somarDias(anterior.data_referencia, 1) : semana.periodo_inicio
    const fim = semana.data_referencia
    // saldo(semana) = saldo(anterior) + banco(semana) - negativas(semana); sem anterior, faz a conta ao contrário
    const abertura = anterior ? anterior.saldo_total : semana.saldo_total - (semana.banco_semana - semana.negativa_semana)
    const brutos = noIntervalo(dias, inicio > fim ? fim : inicio, fim)
    return montarSecao(
      {
        chave: `semana-${semana.fechamento_id}`,
        tipo: 'semana',
        inicio: inicio > fim ? fim : inicio,
        fim,
        periodoInicio: semana.periodo_inicio,
        fechamentoMes: semana.semana_fechamento_mes,
        oficial: {
          extra: semana.extra_semana,
          negativa: semana.negativa_semana,
          pagas: semana.pagas_semana,
          banco: semana.banco_semana,
          saldo: semana.saldo_total,
        },
        abertura,
      },
      calcularDias(brutos, {
        saldo: abertura,
        extra: mesmoPeriodo ? anterior.extra_periodo : 0,
        negativa: mesmoPeriodo ? anterior.negativa_periodo : 0,
      }),
    )
  })

  // dias depois do último fechamento: ainda não entram no saldo oficial
  const ultima = crescente.at(-1)
  const depois = ultima ? dias.filter((d) => d.dia > ultima.data_referencia && d.dia <= hoje) : []
  if (ultima && depois.length > 0) {
    secoes.push(
      montarSecao(
        {
          chave: 'andamento',
          tipo: 'andamento',
          inicio: depois[0].dia,
          fim: depois[depois.length - 1].dia,
          periodoInicio: ultima.periodo_inicio,
          fechamentoMes: false,
          oficial: null,
          abertura: ultima.saldo_total,
        },
        calcularDias(depois, { saldo: ultima.saldo_total, extra: ultima.extra_periodo, negativa: ultima.negativa_periodo }),
      ),
    )
  }
  return secoes.reverse()
}

/**
 * Seções do tempo real, da mais recente para a mais antiga: uma por período de apuração. O histórico diário
 * traz o saldo gravado em cada dia (valor exato); os dias sem gravação usam a conta do acumulado.
 */
export function secoesTempoReal(
  diario: DiaHistorico[],
  historico: SemanaHistorico[],
  dias: DiaApi[],
): Secao[] {
  const periodos = [...new Set(diario.map((d) => d.periodo_inicio))].sort()
  return periodos
    .map((inicio, i) => {
      const proximo = periodos[i + 1]
      const doPeriodo = diario.filter((d) => d.periodo_inicio === inicio).sort((a, b) => a.dia.localeCompare(b.dia))
      const ultimo = doPeriodo[doPeriodo.length - 1]
      // o período vai até a véspera do próximo; o último, até o fim dos dados
      const brutos = noIntervalo(dias, inicio, proximo ? somarDias(proximo, -1) : '9999-12-31')
      const ultimoBruto = brutos.at(-1)?.dia
      const fim = ultimoBruto && ultimoBruto > ultimo.dia ? ultimoBruto : ultimo.dia
      // saldo antes do período: fechamento do mês que terminou na véspera
      const abertura = historico.find((h) => h.data_referencia === somarDias(inicio, -1))?.saldo_total ?? null
      return montarSecao(
        {
          chave: `periodo-${inicio}`,
          tipo: 'periodo',
          inicio,
          fim,
          periodoInicio: inicio,
          fechamentoMes: false,
          oficial: {
            extra: ultimo.extra_periodo,
            negativa: ultimo.negativa_periodo,
            pagas: ultimo.pagas_periodo,
            banco: ultimo.banco_periodo,
            saldo: ultimo.saldo_total,
          },
          abertura,
        },
        calcularDias(brutos, { saldo: abertura, extra: 0, negativa: 0 }, new Map(doPeriodo.map((d) => [d.dia, d]))),
      )
    })
    .reverse()
}

/** Todos os dias das seções em ordem cronológica, sem repetir um dia que apareça em duas seções. */
function diasUnicos(secoes: Secao[]) {
  const porDia = new Map<DataISO, DiaCalculado>()
  for (const secao of [...secoes].reverse()) for (const dia of secao.dias) porDia.set(dia.dia, dia)
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia))
}

export interface PontoGrafico {
  chave: string | number
  data: DataISO
  saldo: Minutos
  detalhe: string
  /** Dia com batida para conferir: a barra aparece em destaque. */
  conferir?: boolean
}

/** Janela máxima de dias no gráfico diário: mais que isso as barras ficam finas demais. */
const DIAS_NO_GRAFICO = 90

/**
 * Saldo ao longo do tempo: uma barra por semana fechada (valor oficial) quando há ao menos duas; senão, uma barra
 * por dia com o saldo acumulado dos dias. A origem vem junto para o texto do gráfico dizer o que está mostrando.
 */
export function pontosDoGrafico(
  secoes: Secao[],
  historico: SemanaHistorico[],
  diario: DiaHistorico[],
): { pontos: PontoGrafico[]; origem: 'semanas' | 'dias' | 'dias-estimados' } {
  if (diario.length > 1) {
    return {
      origem: 'dias',
      pontos: [...diario]
        .sort((a, b) => a.dia.localeCompare(b.dia))
        .map((d) => ({
          chave: d.dia,
          data: d.dia,
          saldo: d.saldo_total,
          detalhe:
            d.banco_dia === null
              ? 'primeiro dia registrado no período'
              : `banco do dia ${formatarMinutos(d.banco_dia, { sinal: true })}`,
        })),
    }
  }
  if (historico.length > 1) {
    return {
      origem: 'semanas',
      pontos: [...historico]
        .sort((a, b) => a.data_referencia.localeCompare(b.data_referencia))
        .map((s) => ({
          chave: s.fechamento_id,
          data: s.data_referencia,
          saldo: s.saldo_total,
          detalhe: `semana ${formatarMinutos(s.banco_semana, { sinal: true })}`,
        })),
    }
  }

  // só até o último fechamento (os dias seguintes ainda não entram no banco oficial); no dia do fechamento vale o saldo oficial
  const oficiais = new Map(secoes.flatMap((s) => (s.oficial ? [[s.fim, s.oficial.saldo] as const] : [])))
  const dias = diasUnicos(secoes.filter((s) => s.tipo !== 'andamento'))
    .filter((d) => d.saldo !== null)
    .slice(-DIAS_NO_GRAFICO)
  return {
    origem: 'dias-estimados',
    pontos: dias.map((d) => {
      const oficial = oficiais.get(d.dia)
      return {
        chave: d.dia,
        data: d.dia,
        saldo: oficial ?? d.saldo ?? 0,
        detalhe:
          oficial !== undefined
            ? 'saldo do fechamento oficial'
            : `extra ${formatarMinutos(d.extra)}, negativa ${formatarMinutos(d.negativa)}, estimado`,
        conferir: d.avisos.length > 0,
      }
    }),
  }
}
