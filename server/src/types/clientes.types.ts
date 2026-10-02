import { z } from 'zod'
import { perfisCliente, type PerfilCliente } from './auth.types'
import type { Alcance, Tela } from './permissoes.types'
import { booleanoQuery, cargo, idOpcional, paginacao, telefone } from './comum.types'

export const email = z.email('E-mail inválido.').trim().toLowerCase()
export const cpf = z.string().trim().min(1)
export const nome = z.string().trim().min(2).max(120)
const unidadeIds = z.array(z.number().int().positive()).max(500)

export const listarClientesQuerySchema = z.object({
    busca: z.string().trim().max(100).optional(),
    perfil: z.enum(perfisCliente).optional(),
    grupo_id: idOpcional,
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
        // grupo de permissão; 'perfil' continua aceito e vale o grupo padrão (RH ou Gestor)
        grupo_id: z.number().int().positive().optional(),
        perfil: z.enum(perfisCliente).optional(),
        cargo: cargo.optional().nullable(),
        telefone: telefone.optional().nullable(),
        // obrigatório quando quem cria é a equipe; o RH sempre cria na própria empresa
        empresa_id: idOpcional.nullable(),
        unidade_ids: unidadeIds.default([]),
    })
    .strict()
    .refine(u => u.email || u.cpf, { message: 'Informe e-mail ou CPF.', path: ['email'] })
    .refine(u => u.grupo_id || u.perfil, { message: 'Escolha o grupo de permissão.', path: ['grupo_id'] })

export const atualizarClienteSchema = z
    .object({
        nome,
        email: email.nullable(),
        cpf: cpf.nullable(),
        grupo_id: z.number().int().positive(),
        perfil: z.enum(perfisCliente),
        cargo: cargo.nullable(),
        telefone: telefone.nullable(),
        // só a equipe pode mudar o cliente de empresa
        empresa_id: z.number().int().positive(),
        ativo: z.boolean(),
    })
    .partial()
    .strict()

export const unidadesClienteSchema = z.object({ unidade_ids: unidadeIds }).strict()

export type ClienteGerenciado = {
    id: number
    nome: string
    email: string | null
    cpf: string | null
    perfil: PerfilCliente
    grupo: { id: number; nome: string; alcance: Alcance; telas: Tela[] }
    cargo: string | null
    telefone: string | null
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
    /** o perfil (rh/gestor) sai do alcance do grupo, pelo trigger do banco */
    grupo_id: number
    cargo: string | null
    telefone: string | null
    empresa_id: number
    ativo: boolean
}
