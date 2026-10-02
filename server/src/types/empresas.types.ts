import { z } from 'zod'
import { cnpjValido } from '../utils/cnpj'
import { telefone } from './comum.types'

const texto = (max: number) => z.string().trim().min(1).max(max)

/** Dados cadastrais (todos opcionais; `null` apaga). */
const camposCadastro = z.object({
    razao_social: texto(200).nullable(),
    cnpj: z
        .string()
        .transform(v => v.replace(/\D/g, ''))
        .refine(cnpjValido, 'CNPJ inválido.')
        .nullable(),
    // o front reduz a imagem antes de enviar; aqui só confere tipo e tamanho
    logo: z
        .string()
        .max(400_000, 'Logo muito grande: use uma imagem menor.')
        .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, 'Logo deve ser PNG, JPG ou WebP.')
        .nullable(),
    responsavel: texto(120).nullable(),
    email_contato: z.email('E-mail inválido.').trim().toLowerCase().nullable(),
    telefone: telefone.nullable(),
    cidade: texto(100).nullable(),
    uf: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, 'UF inválida.')
        .nullable(),
    observacoes: texto(2000).nullable(),
})

export const CAMPOS_CADASTRO = Object.keys(camposCadastro.shape) as (keyof CadastroEmpresa)[]
export type CadastroEmpresa = { [K in keyof z.infer<typeof camposCadastro>]: string | null }

export const criarEmpresaSchema = z
    .object({
        nome: texto(120),
        secullum_usuario: texto(200).nullable().optional(),
        secullum_senha: z.string().min(1).max(200).nullable().optional(),
        secullum_banco_id: texto(100).nullable().optional(),
        ativo: z.boolean().default(true),
        ...camposCadastro.partial().shape,
    })
    .strict()

export const atualizarEmpresaSchema = z
    .object({
        nome: texto(120),
        secullum_usuario: texto(200).nullable(),
        secullum_senha: z.string().min(1).max(200).nullable(),
        secullum_banco_id: texto(100).nullable(),
        ativo: z.boolean(),
        ...camposCadastro.shape,
    })
    .partial()
    .strict()

export const testarConexaoSchema = z
    .object({
        secullum_usuario: texto(200),
        secullum_senha: z.string().min(1).max(200),
    })
    .partial()
    .strict()

export type Empresa = CadastroEmpresa & {
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
    qtd_usuarios: number
}

export type DadosEmpresa = CadastroEmpresa & {
    nome: string
    secullum_usuario: string | null
    secullum_senha_cripto: string | null
    secullum_banco_id: string | null
    ativo: boolean
}
