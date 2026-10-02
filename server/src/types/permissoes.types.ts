import { z } from 'zod'
import { idOpcional } from './comum.types'

/**
 * Telas que um grupo de permissão pode liberar. Mesma lista do CHECK grupos_telas_chk
 * (migration 009) e do catálogo do front (client/src/lib/telas.ts).
 */
export const TELAS = [
    'dashboard',
    'batidas',
    'colaboradores',
    'usuarios',
    'permissoes',
    'integracao',
    'atualizacao',
    'unidades',
    'alertas',
    'fechamentos',
] as const
export type Tela = (typeof TELAS)[number]

/** 'empresa' = todas as unidades da empresa; 'unidades' = só as vinculadas ao usuário. */
export const ALCANCES = ['empresa', 'unidades'] as const
export type Alcance = (typeof ALCANCES)[number]

export const listarGruposQuerySchema = z.object({ empresa_id: idOpcional })

const nome = z.string().trim().min(2, 'Use ao menos 2 caracteres.').max(60)
const descricao = z.string().trim().max(300).nullable()
const telas = z.array(z.enum(TELAS)).max(TELAS.length).transform(lista => [...new Set(lista)])

export const criarGrupoSchema = z
    .object({
        nome,
        descricao: descricao.optional(),
        alcance: z.enum(ALCANCES),
        telas,
    })
    .strict()

export const atualizarGrupoSchema = z
    .object({ nome, descricao, alcance: z.enum(ALCANCES), telas })
    .partial()
    .strict()

export type GrupoPermissao = {
    id: number
    empresa_id: number
    nome: string
    descricao: string | null
    alcance: Alcance
    telas: Tela[]
    padrao: 'rh' | 'gestor' | null
    usuarios: number
    atualizado_em: Date
}
