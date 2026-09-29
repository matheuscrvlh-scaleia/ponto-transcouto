import { z } from 'zod'

const texto = (max: number) => z.string().trim().min(1).max(max)

export const criarEmpresaSchema = z
    .object({
        nome: texto(120),
        secullum_usuario: texto(200).nullable().optional(),
        secullum_senha: z.string().min(1).max(200).nullable().optional(),
        secullum_banco_id: texto(100).nullable().optional(),
        ativo: z.boolean().default(true),
    })
    .strict()
export type CriarEmpresaBody = z.infer<typeof criarEmpresaSchema>

export const atualizarEmpresaSchema = z
    .object({
        nome: texto(120),
        secullum_usuario: texto(200).nullable(),
        secullum_senha: z.string().min(1).max(200).nullable(),
        secullum_banco_id: texto(100).nullable(),
        ativo: z.boolean(),
    })
    .partial()
    .strict()
export type AtualizarEmpresaBody = z.infer<typeof atualizarEmpresaSchema>

export const testarConexaoSchema = z
    .object({
        secullum_usuario: texto(200),
        secullum_senha: z.string().min(1).max(200),
    })
    .partial()
    .strict()

export type Empresa = {
    id: number
    nome: string
    secullum_usuario: string | null
    secullum_banco_id: string | null
    possui_senha: boolean
    ativo: boolean
    sincronizacao_solicitada_em: Date | null
    sincronizado_em: Date | null
    criado_em: Date
    atualizado_em: Date
    qtd_unidades: number
}

export type DadosEmpresa = {
    nome: string
    secullum_usuario: string | null
    secullum_senha_cripto: string | null
    secullum_banco_id: string | null
    ativo: boolean
}
