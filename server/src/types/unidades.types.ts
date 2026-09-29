import { z } from 'zod'
import { idOpcional, paginacao } from './comum.types'

export const listarUnidadesQuerySchema = z.object({ empresa_id: idOpcional })

export const dashboardQuerySchema = z.object({
    busca: z.string().trim().max(100).optional(),
    filtro: z.enum(['todos', 'extra', 'negativa', 'fora']).default('todos'),
    ordem: z.enum(['saldo_desc', 'saldo_asc', 'nome']).default('saldo_desc'),
    pagina: paginacao.pagina,
    por_pagina: z.coerce.number().int().min(1).max(500).default(200),
})
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

export type UnidadeUsuario = {
    id: number
    nome_exibicao: string
    empresa_id: number
    ultimo_fechamento: { id: number; data_referencia: string; publicado_em: Date } | null
    total_colaboradores: number
    fora_da_curva: number
}

export type UnidadeAcessivel = {
    id: number
    nome: string
    empresa_id: number
}

export type FechamentoPublicado = {
    id: number
    periodo_inicio: string
    data_referencia: string
    publicado_em: Date
    semana_fechamento_mes: boolean
}

export type LinhaDashboard = {
    id: number
    nome: string
    funcao: string | null
    extra_min: number
    negativa_min: number
    pagas_min: number
    banco_min: number
    saldo_min: number
    fora_da_curva: 'positivo' | 'negativo' | null
}

export type ResumoDashboard = {
    total: number
    fora_positivo: number
    fora_negativo: number
    pagas_total_min: number
}
