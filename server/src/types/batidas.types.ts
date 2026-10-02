import { z } from 'zod'
import { dataIso, idOpcional, paginacao } from './comum.types'

export const listarBatidasQuerySchema = z
    .object({
        busca: z.string().trim().max(100).optional(),
        colaborador_id: idOpcional,
        unidade_id: idOpcional,
        de: dataIso.optional(),
        ate: dataIso.optional(),
        // validas = sem as desconsideradas; manuais = incluídas ou ajustadas à mão
        tipo: z.enum(['todas', 'validas', 'manuais', 'desconsideradas']).default('todas'),
        origem: z.coerce.number().int().min(0).max(99).optional(),
        pagina: paginacao.pagina,
        por_pagina: z.coerce.number().int().min(1).max(200).default(50),
        // a equipe pode olhar uma empresa só (cliente fica sempre na dele)
        empresa_id: idOpcional,
    })
    .refine(q => !q.de || !q.ate || q.de <= q.ate, { message: 'A data inicial precisa ser anterior à final.', path: ['de'] })
export type ListarBatidasQuery = z.infer<typeof listarBatidasQuerySchema>

export type Batida = {
    id: number
    data: string
    hora: string
    tipo: number
    origem: number
    equipamento_id: number | null
    incluida_em: string | null
    colaborador: { id: number; nome: string; funcao: string | null }
    unidade: { id: number; nome: string }
}
