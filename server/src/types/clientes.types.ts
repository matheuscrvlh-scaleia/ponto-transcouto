import { z } from 'zod'
import { perfisCliente, type PerfilCliente } from './auth.types'
import { booleanoQuery, idOpcional, paginacao } from './comum.types'

export const email = z.email('E-mail inválido.').trim().toLowerCase()
export const cpf = z.string().trim().min(1)
export const nome = z.string().trim().min(2).max(120)
const unidadeIds = z.array(z.number().int().positive()).max(500)

export const listarClientesQuerySchema = z.object({
    busca: z.string().trim().max(100).optional(),
    perfil: z.enum(perfisCliente).optional(),
    ativo: booleanoQuery.optional(),
    unidade_id: idOpcional,
    empresa_id: idOpcional,
    ...paginacao,
})
export type ListarClientesQuery = z.infer<typeof listarClientesQuerySchema>

export const criarClienteSchema = z
    .object({
        nome,
        email: email.optional().nullable(),
        cpf: cpf.optional().nullable(),
        perfil: z.enum(perfisCliente),
        // obrigatório quando quem cria é a equipe; o RH sempre cria na própria empresa
        empresa_id: idOpcional.nullable(),
        unidade_ids: unidadeIds.default([]),
    })
    .strict()
    .refine(u => u.email || u.cpf, { message: 'Informe e-mail ou CPF.', path: ['email'] })
export type CriarClienteBody = z.infer<typeof criarClienteSchema>

export const atualizarClienteSchema = z
    .object({
        nome,
        email: email.nullable(),
        cpf: cpf.nullable(),
        perfil: z.enum(perfisCliente),
        // só a equipe pode mudar o cliente de empresa
        empresa_id: z.number().int().positive(),
        ativo: z.boolean(),
    })
    .partial()
    .strict()
export type AtualizarClienteBody = z.infer<typeof atualizarClienteSchema>

export const unidadesClienteSchema = z.object({ unidade_ids: unidadeIds }).strict()

export type ClienteGerenciado = {
    id: number
    nome: string
    email: string | null
    cpf: string | null
    perfil: PerfilCliente
    empresa_id: number
    ativo: boolean
    deve_trocar_senha: boolean
    ultimo_login_em: Date | null
    criado_em: Date | null
    unidades: { id: number; nome_exibicao: string | null }[]
}

export type DadosCliente = {
    nome: string
    email: string | null
    cpf: string | null
    perfil: PerfilCliente
    empresa_id: number
    ativo: boolean
}
