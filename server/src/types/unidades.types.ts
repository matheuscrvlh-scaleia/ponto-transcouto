import { z } from 'zod'
import { idOpcional, paginacao } from './comum.types'

export const listarUnidadesQuerySchema = z.object({ empresa_id: idOpcional })

export const dashboardQuerySchema = z.object({
    busca: z.string().trim().max(100).optional(),
    filtro: z.enum(['todos', 'extra', 'negativa', 'fora']).default('todos'),
    ordem: z.enum(['saldo_desc', 'saldo_asc', 'nome']).default('saldo_desc'),
    pagina: paginacao.pagina,
    por_pagina: z.coerce.number().int().min(1).max(500).default(200),
    // painel consolidado: a equipe pode olhar uma empresa só (cliente fica sempre na dele)
    empresa_id: idOpcional,
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

/** Unidade no painel: último fechamento publicado, limites e modo de atualização da empresa dela. */
export type UnidadePainel = {
    id: number
    nome: string
    empresa_id: number
    alerta_pos: number
    alerta_neg: number
    tempo_real: boolean
    fechamento: FechamentoPublicado | null
}

export type LinhaDashboardGeral = LinhaDashboard & {
    unidade_id: number
    unidade_nome: string
    alerta_pos: number
    alerta_neg: number
    /** de onde veio o número: valor ao vivo ou o último fechamento publicado */
    fonte: 'tempo_real' | 'fechamento'
    atualizado_em: Date | null
}

export type ResumoDashboard = {
    total: number
    fora_positivo: number
    fora_negativo: number
    pagas_total_min: number
}
