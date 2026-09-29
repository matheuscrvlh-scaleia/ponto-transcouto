import { z } from 'zod'

export const camposMapeaveis = ['extra', 'negativa', 'pagas', 'saldo_banco', 'ignorar'] as const
export type CampoMapeavel = (typeof camposMapeaveis)[number]

export const salvarMapeamentoSchema = z
    .object({
        mapeamento: z
            .array(
                z.object({
                    coluna_secullum: z.string().trim().min(1).max(100),
                    campo: z.enum(camposMapeaveis),
                }),
            )
            .max(200),
    })
    .strict()
    .superRefine(({ mapeamento }, ctx) => {
        const colunas = mapeamento.map(m => m.coluna_secullum.toLowerCase())
        if (new Set(colunas).size !== colunas.length) {
            ctx.addIssue({ code: 'custom', message: 'Coluna repetida no mapeamento.', path: ['mapeamento'] })
        }
        if (mapeamento.filter(m => m.campo === 'saldo_banco').length > 1) {
            ctx.addIssue({ code: 'custom', message: 'Só uma coluna pode ser saldo_banco.', path: ['mapeamento'] })
        }
        if (mapeamento.length && !mapeamento.some(m => m.campo === 'extra')) {
            ctx.addIssue({ code: 'custom', message: 'Mapeie ao menos uma coluna como extra.', path: ['mapeamento'] })
        }
    })
export type SalvarMapeamentoBody = z.infer<typeof salvarMapeamentoSchema>

export type ItemMapeamento = {
    coluna_secullum: string
    campo: CampoMapeavel
}
