import { z } from 'zod'

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

export const idOpcional = z.coerce.number().int().positive().optional()

export const empresaQuerySchema = z.object({ empresa_id: idOpcional })

export const booleanoQuery = z.enum(['true', 'false']).transform(v => v === 'true')

export const paginacao = {
    pagina: z.coerce.number().int().min(1).default(1),
    por_pagina: z.coerce.number().int().min(1).max(500).default(50),
}

export const dataIso = z.iso.date()

export type Paginado<T> = {
    itens: T[]
    total: number
    pagina: number
    por_pagina: number
}
