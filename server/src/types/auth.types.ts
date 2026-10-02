import { z } from 'zod'
import type { Tela } from './permissoes.types'

export const perfis = ['admin', 'rh', 'gestor'] as const
export type Perfil = (typeof perfis)[number]

/** Perfis de quem é cliente (tabela clientes). 'admin' é sempre a equipe Scale IA (tabela usuarios). */
export const perfisCliente = ['rh', 'gestor'] as const
export type PerfilCliente = (typeof perfisCliente)[number]

/** equipe = tabela usuarios (Scale IA); cliente = tabela clientes (usuários das empresas). */
export type TipoUsuario = 'equipe' | 'cliente'

/** Quem está agindo: o suficiente para escopo de acesso e autoria. */
export type Ator = {
    tipo: TipoUsuario
    id: number
}

export type UsuarioAutenticado = Ator & {
    nome: string
    perfil: Perfil
    /** Telas liberadas pelo grupo de permissão (a equipe Scale IA tem todas). */
    telas: Tela[]
    /** Grupo de permissão do cliente (null para a equipe). */
    grupoId: number | null
    empresaId: number | null
    deveTrocarSenha: boolean
}

export type TokenPayload = {
    sub: number
    tv: number
    /** 'e' = equipe, 'c' = cliente */
    t: 'e' | 'c'
}

export const loginSchema = z.object({
    login: z.string().trim().min(1, 'Informe e-mail ou CPF.'),
    senha: z.string().min(1, 'Informe a senha.'),
})

export const trocarSenhaSchema = z.object({
    senha_atual: z.string().min(1),
    nova_senha: z.string().min(8, 'A nova senha deve ter ao menos 8 caracteres.').max(72),
})

export type UnidadeResumo = {
    id: number
    nome_exibicao: string
    empresa_id: number
}

export type UsuarioSessao = {
    id: number
    tipo: TipoUsuario
    nome: string
    email: string | null
    perfil: Perfil
    empresa_id: number | null
    deve_trocar_senha: boolean
    /** Telas liberadas (a equipe Scale IA tem todas). */
    telas: Tela[]
    /** Grupo de permissão do cliente; null para a equipe. */
    grupo: { id: number; nome: string } | null
}
