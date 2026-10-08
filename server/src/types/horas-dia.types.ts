import { z } from 'zod'
import { dataIso, idOpcional } from './comum.types'

const MAX_DIAS_INTERVALO = 400

const intervalo = z
    .object({ de: dataIso, ate: dataIso })
    .refine(q => q.de <= q.ate, { message: 'A data inicial precisa ser anterior à final.', path: ['de'] })
    .refine(q => (Date.parse(q.ate) - Date.parse(q.de)) / 86400000 < MAX_DIAS_INTERVALO, {
        message: `Escolha um intervalo de até ${MAX_DIAS_INTERVALO} dias.`,
        path: ['de'],
    })

export const horasDiaQuerySchema = z
    .object({
        de: dataIso,
        ate: dataIso,
        unidade_id: idOpcional,
        // a equipe pode olhar uma empresa só (cliente fica sempre na dele)
        empresa_id: idOpcional,
    })
    .and(intervalo)

export const diasColaboradorQuerySchema = intervalo

export type TotalNoIntervalo = {
    id: number
    extra_min: number
    negativa_min: number
    dias_extra_acima: number
    dias_negativa_acima: number
}

export type DiaColaborador = {
    dia: string
    extra_min: number
    negativa_min: number
    marcacoes: string[]
    extra_acima: boolean
    negativa_acima: boolean
}

/** Uma marcação da FonteDados no dia (tipo: 0 original, 1 manual, 2 pré-assinalada, 3 desconsiderada). */
export type BatidaDoDia = {
    hora: string
    tipo: number
    origem: number
    equipamento_id: number | null
    incluida_em: string | null
}

/** Dia do colaborador com as horas calculadas (se a coleta já gravou) e as batidas do log. */
export type DiaDetalhado = DiaColaborador & {
    /** false: o dia só tem batidas (ainda não passou por uma coleta de horas). */
    tem_calculo: boolean
    batidas: BatidaDoDia[]
}
