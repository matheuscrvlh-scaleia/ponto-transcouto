import { z } from 'zod'

export const historicoQuerySchema = z.object({
    limite: z.coerce.number().int().min(1).max(104).default(26),
})

export const historicoDiarioQuerySchema = z.object({
    dias: z.coerce.number().int().min(1).max(180).default(60),
})

export type DiaHistorico = {
    dia: string
    periodo_inicio: string
    unidade: { id: number; nome: string }
    extra_dia: number | null
    negativa_dia: number | null
    pagas_dia: number | null
    banco_dia: number | null
    extra_periodo: number
    negativa_periodo: number
    pagas_periodo: number
    banco_periodo: number
    saldo_total: number
    atualizado_em: Date
}

export type ColaboradorAcessivel = {
    id: number
    nome: string
    funcao: string | null
    departamento: string | null
    ativo: boolean
    empresa_id: number
    unidade: { id: number; nome: string }
}

export type RegistroAtual = {
    fechamento_id: number
    data_referencia: string
    /** início do período de apuração dos números (dia seguinte ao fechamento anterior) */
    periodo_inicio: string
    extra_min: number
    negativa_min: number
    pagas_min: number
    banco_min: number
    /** banco acumulado: herda os períodos anteriores (só o perfil do colaborador mostra) */
    saldo_min: number
    /** saldo do período: extras − negativas, o mesmo do painel */
    saldo_periodo_min: number
}

export type SemanaHistorico = {
    fechamento_id: number
    periodo_inicio: string
    data_referencia: string
    semana_fechamento_mes: boolean
    unidade: { id: number; nome: string }
    extra_semana: number
    negativa_semana: number
    pagas_semana: number
    banco_semana: number
    extra_periodo: number
    negativa_periodo: number
    pagas_periodo: number
    banco_periodo: number
    saldo_total: number
}
