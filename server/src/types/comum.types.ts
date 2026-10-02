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

/** Telefone com DDD: chega com ou sem máscara, guarda só os dígitos (10 ou 11). */
export const telefone = z
    .string()
    .transform(v => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{10,11}$/, 'Telefone inválido: informe DDD e número.'))

/** Cargo / função de quem usa o sistema. */
export const cargo = z.string().trim().min(1).max(80)
