import { z } from 'zod'

export const perfis = ['admin', 'rh', 'gestor'] as const
export type Perfil = (typeof perfis)[number]

export type UsuarioAutenticado = {
    id: number
    nome: string
    perfil: Perfil
    empresaId: number | null
    deveTrocarSenha: boolean
}

export type TokenPayload = {
    sub: number
    tv: number
}

export const loginSchema = z.object({
    login: z.string().trim().min(1, 'Informe e-mail ou CPF.'),
    senha: z.string().min(1, 'Informe a senha.'),
})
export type LoginBody = z.infer<typeof loginSchema>

export const trocarSenhaSchema = z.object({
    senha_atual: z.string().min(1),
    nova_senha: z.string().min(8, 'A nova senha deve ter ao menos 8 caracteres.').max(72),
})
export type TrocarSenhaBody = z.infer<typeof trocarSenhaSchema>

export type UnidadeResumo = {
    id: number
    nome_exibicao: string
}

export type UsuarioSessao = {
    id: number
    nome: string
    email: string | null
    perfil: Perfil
    empresa_id: number | null
    deve_trocar_senha: boolean
}
