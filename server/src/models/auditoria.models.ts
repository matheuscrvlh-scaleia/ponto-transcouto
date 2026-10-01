import { db, type Executor } from '../db/database'
import type { Ator } from '../types/auth.types'

export type RegistroAuditoria = {
    /** Quem fez: vai para usuario_id (equipe) ou cliente_id (cliente). */
    ator: Ator
    empresaId: number | null
    acao: string
    entidade: string
    entidadeId: number | string
    dados?: unknown
    ip?: string | null
}

export async function registrar(r: RegistroAuditoria, executor: Executor = db) {
    await executor.query(
        `INSERT INTO log_auditoria (usuario_id, cliente_id, empresa_id, acao, entidade, entidade_id, dados, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet)`,
        [
            r.ator.tipo === 'equipe' ? r.ator.id : null,
            r.ator.tipo === 'cliente' ? r.ator.id : null,
            r.empresaId,
            r.acao,
            r.entidade,
            String(r.entidadeId),
            r.dados ?? null,
            r.ip ?? null,
        ],
    )
}
