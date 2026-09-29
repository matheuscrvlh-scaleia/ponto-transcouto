import { z } from 'zod'
import { idOpcional } from './comum.types'

const minutos = z.number().int().min(0).max(999 * 60 + 59)

export const camposRh = [
    'teto_horas_pagas_minutos',
    'teto_periodicidade',
    'alerta_saldo_positivo_minutos',
    'alerta_saldo_negativo_minutos',
    'origem_horas_pagas',
] as const

export const camposRegua = [
    'dia_semana_extracao',
    'hora_extracao',
    'dia_fechamento_mes',
    'dias_apos_fechamento_mes',
    'fuso_horario',
] as const

export const atualizarConfiguracoesSchema = z
    .object({
        teto_horas_pagas_minutos: minutos,
        teto_periodicidade: z.enum(['semanal', 'mensal']),
        alerta_saldo_positivo_minutos: minutos.min(1),
        alerta_saldo_negativo_minutos: minutos.min(1),
        origem_horas_pagas: z.enum(['teto', 'coluna_secullum']),
        dia_semana_extracao: z.number().int().min(0).max(6),
        hora_extracao: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.'),
        dia_fechamento_mes: z.number().int().min(1).max(28),
        dias_apos_fechamento_mes: z.number().int().min(0).max(10),
        fuso_horario: z.string().min(1).refine(fusoValido, 'Fuso horário inválido.'),
        cota_calcular_por_hora: z.number().int().min(1).max(100),
    })
    .partial()
    .strict()
export type AtualizarConfiguracoesBody = z.infer<typeof atualizarConfiguracoesSchema>

export const calendarioQuerySchema = z.object({
    empresa_id: idOpcional,
    meses: z.coerce.number().int().min(1).max(6).default(2),
})

export type Configuracoes = {
    empresa_id: number
    dia_semana_extracao: number
    hora_extracao: string
    dia_fechamento_mes: number
    dias_apos_fechamento_mes: number
    origem_horas_pagas: 'teto' | 'coluna_secullum'
    teto_horas_pagas_minutos: number
    teto_periodicidade: 'semanal' | 'mensal'
    alerta_saldo_positivo_minutos: number
    alerta_saldo_negativo_minutos: number
    fuso_horario: string
    cota_calcular_por_hora: number
    atualizado_em: Date
    atualizado_por: { id: number; nome: string } | null
}

export type CicloCalendario = {
    ciclo_id: number | null
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
    gatilho_em: Date
    gatilho_previsto_em: Date
    semana_fechamento_mes: boolean
    ajustado: boolean
}

function fusoValido(fuso: string) {
    try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: fuso })
        return true
    } catch {
        return false
    }
}
