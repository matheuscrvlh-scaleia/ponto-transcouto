import { db, type Executor } from '../db/database'

export type RegistroAuditoria = {
    usuarioId: number
    empresaId: number | null
    acao: string
    entidade: string
    entidadeId: number | string
    dados?: unknown
    ip?: string | null
}

export async function registrar(r: RegistroAuditoria, executor: Executor = db) {
    await executor.query(
        `INSERT INTO log_auditoria (usuario_id, empresa_id, acao, entidade, entidade_id, dados, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7::inet)`,
        [r.usuarioId, r.empresaId, r.acao, r.entidade, String(r.entidadeId), r.dados ?? null, r.ip ?? null],
    )
}
