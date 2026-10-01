import { z } from 'zod'
import { cpf, email, nome } from './clientes.types'
import { booleanoQuery, paginacao } from './comum.types'

export const listarEquipeQuerySchema = z.object({
    busca: z.string().trim().max(100).optional(),
    ativo: booleanoQuery.optional(),
    ...paginacao,
})
export type ListarEquipeQuery = z.infer<typeof listarEquipeQuerySchema>

export const criarMembroSchema = z
    .object({
        nome,
        email: email.optional().nullable(),
        cpf: cpf.optional().nullable(),
    })
    .strict()
    .refine(m => m.email || m.cpf, { message: 'Informe e-mail ou CPF.', path: ['email'] })

export const atualizarMembroSchema = z
    .object({
        nome,
        email: email.nullable(),
        cpf: cpf.nullable(),
        ativo: z.boolean(),
    })
    .partial()
    .strict()

export type MembroEquipe = {
    id: number
    nome: string
    email: string | null
    cpf: string | null
    ativo: boolean
    deve_trocar_senha: boolean
    ultimo_login_em: Date | null
    criado_em: Date | null
}

export type DadosMembro = {
    nome: string
    email: string | null
    cpf: string | null
    ativo: boolean
}
