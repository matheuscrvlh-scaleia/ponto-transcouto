import { z } from 'zod'
import { perfis, type Perfil } from './auth.types'
import { booleanoQuery, idOpcional, paginacao } from './comum.types'

const email = z.email('E-mail inválido.').trim().toLowerCase()
const cpf = z.string().trim().min(1)
const nome = z.string().trim().min(2).max(120)
const unidadeIds = z.array(z.number().int().positive()).max(500)

export const listarUsuariosQuerySchema = z.object({
    busca: z.string().trim().max(100).optional(),
    perfil: z.enum(perfis).optional(),
    ativo: booleanoQuery.optional(),
    unidade_id: idOpcional,
    empresa_id: idOpcional,
    ...paginacao,
})
export type ListarUsuariosQuery = z.infer<typeof listarUsuariosQuerySchema>

export const criarUsuarioSchema = z
    .object({
        nome,
        email: email.optional().nullable(),
        cpf: cpf.optional().nullable(),
        perfil: z.enum(perfis),
        empresa_id: idOpcional.nullable(),
        unidade_ids: unidadeIds.default([]),
    })
    .strict()
    .refine(u => u.email || u.cpf, { message: 'Informe e-mail ou CPF.', path: ['email'] })
export type CriarUsuarioBody = z.infer<typeof criarUsuarioSchema>

export const atualizarUsuarioSchema = z
    .object({
        nome,
        email: email.nullable(),
        cpf: cpf.nullable(),
        perfil: z.enum(perfis),
        empresa_id: z.number().int().positive().nullable(),
        ativo: z.boolean(),
    })
    .partial()
    .strict()
export type AtualizarUsuarioBody = z.infer<typeof atualizarUsuarioSchema>

export const unidadesUsuarioSchema = z.object({ unidade_ids: unidadeIds }).strict()

export type UsuarioGerenciado = {
    id: number
    nome: string
    email: string | null
    cpf: string | null
    perfil: Perfil
    empresa_id: number | null
    ativo: boolean
    deve_trocar_senha: boolean
    ultimo_login_em: Date | null
    criado_em: Date | null
    unidades: { id: number; nome_exibicao: string | null }[]
}

export type UsuarioLista = Omit<UsuarioGerenciado, 'cpf'> & { cpf_mascarado: string | null }

export type DadosUsuario = {
    nome: string
    email: string | null
    cpf: string | null
    perfil: Perfil
    empresa_id: number | null
    ativo: boolean
}
