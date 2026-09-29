import { z } from 'zod'
import { dataIso, idOpcional } from './comum.types'

export const statusFechamento = ['pendente', 'processando', 'sucesso', 'falhou', 'cancelado'] as const

export const listarFechamentosQuerySchema = z.object({
    empresa_id: idOpcional,
    unidade_id: idOpcional,
    ciclo_id: idOpcional,
    status: z.enum(statusFechamento).optional(),
    de: dataIso.optional(),
    ate: dataIso.optional(),
    limite: z.coerce.number().int().min(1).max(1000).default(300),
})
export type ListarFechamentosQuery = z.infer<typeof listarFechamentosQuerySchema>

const motivo = z.string().trim().min(5, 'Informe o motivo (mín. 5 caracteres).').max(500)

export const reprocessarSchema = z.object({ motivo: motivo.optional() }).strict()

export const publicarSchema = z.object({ motivo }).strict()

export const ajustarGatilhoSchema = z
    .object({
        gatilho_em: z.iso.datetime({ offset: true }).transform(v => new Date(v)),
        motivo,
    })
    .strict()

export type ExecucaoResumo = {
    id: number
    disparo: 'automatico' | 'manual'
    disparado_por: { id: number; nome: string } | null
    status: 'processando' | 'sucesso' | 'falhou' | 'interrompida'
    total_colaboradores: number
    processados: number
    com_erro: number
    mensagem_erro: string | null
    iniciado_em: Date
    finalizado_em: Date | null
}

export type FechamentoAdmin = {
    id: number
    empresa: { id: number; nome: string }
    unidade: { id: number; nome: string }
    ciclo_id: number
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
    gatilho_em: Date
    gatilho_previsto_em: Date
    gatilho_ajustado: boolean
    gatilho_ajustado_por: { id: number; nome: string } | null
    status: (typeof statusFechamento)[number]
    tentativas: number
    proxima_tentativa_em: Date | null
    total_colaboradores: number | null
    registros: number
    publicado_em: Date | null
    ultima_execucao: ExecucaoResumo | null
}

export type ErroExecucao = {
    id: number
    execucao_id: number
    etapa: string
    http_status: number | null
    mensagem: string
    colaborador: { id: number; nome: string } | null
    criado_em: Date
}

export type Ciclo = {
    id: number
    empresa_id: number
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
    gatilho_previsto_em: Date
    gatilho_em: Date
    gatilho_ajustado_por: number | null
    gatilho_ajustado_em: Date | null
}
