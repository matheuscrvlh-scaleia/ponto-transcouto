import { z } from 'zod'
import { dataIso, idOpcional } from './comum.types'

const motivo = z.string().trim().max(300).optional()

/** Limite do período por pedido: protege a cota da Secullum (cada semana = 1 chamada por colaborador). */
export const MAX_DIAS_PERIODO = 93

export const empresaIntegracaoQuerySchema = z.object({ empresa_id: idOpcional })

export const previaDadosQuerySchema = z.object({
    empresa_id: idOpcional,
    inicio: dataIso,
    fim: dataIso,
    unidade_id: idOpcional,
})

export const pedirDadosSchema = z
    .object({
        inicio: dataIso,
        fim: dataIso,
        unidade_id: z.number().int().positive().nullable().optional(),
        motivo,
    })
    .strict()

export const pedirCadastrosSchema = z.object({ motivo }).strict()

export const listaIntegracaoQuerySchema = z.object({
    empresa_id: idOpcional,
    pagina: z.coerce.number().int().min(1).default(1),
    por_pagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type UnidadeEscopo = { id: number; nome: string }

export type CicloExistente = {
    id: number
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
    gatilho_em: Date
}

export type FechamentoPlano = {
    id: number
    unidade_id: number
    status: string
    ciclo_id: number
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
}

export type FechamentoProgresso = {
    id: number
    status: string
    tentativas: number
    proxima_tentativa_em: Date | null
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
    unidade: string
    total: number
    feitos: number
}

export type SemanaPlano = {
    data_referencia: string
    periodo_inicio: string
    tipo: 'semanal' | 'fechamento_mes'
    nova: boolean
    dependente: boolean
}

export type AtorResumo = { tipo: 'equipe' | 'cliente'; nome: string } | null

export type ExecucaoIntegracao = {
    id: number
    fechamento_id: number
    unidade: { id: number; nome: string }
    data_referencia: string
    status: 'processando' | 'sucesso' | 'falhou' | 'interrompida'
    disparo: 'automatico' | 'manual'
    disparado_por: AtorResumo
    processados: number
    total_colaboradores: number | null
    com_erro: number
    iniciado_em: Date
    finalizado_em: Date | null
    mensagem_erro: string | null
}

export type RegistroHistorico = {
    id: number
    criado_em: Date
    acao: string
    dados: Record<string, unknown> | null
    ator: AtorResumo
    unidade_nome: string | null
    data_referencia: string | null
}
