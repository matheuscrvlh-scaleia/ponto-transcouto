import { z } from 'zod'
import { booleanoQuery, idOpcional } from './comum.types'

export const listarUnidadesAdminQuerySchema = z.object({
    empresa_id: idOpcional,
    mapeada: booleanoQuery.optional(),
    ativo: booleanoQuery.optional(),
})
export type ListarUnidadesAdminQuery = z.infer<typeof listarUnidadesAdminQuerySchema>

export const atualizarUnidadeSchema = z
    .object({
        nome_exibicao: z
            .string()
            .trim()
            .max(60)
            .nullable()
            .transform(v => v || null),
        ativo: z.boolean(),
    })
    .partial()
    .strict()
export type AtualizarUnidadeBody = z.infer<typeof atualizarUnidadeSchema>

export const solicitarSincronizacaoSchema = z.object({ empresa_id: idOpcional }).strict()

export type UnidadeAdmin = {
    id: number
    empresa_id: number
    cnpj: string
    razao_social: string
    nome_exibicao: string | null
    ativo: boolean
    sincronizado_em: Date | null
    qtd_colaboradores: number
}
