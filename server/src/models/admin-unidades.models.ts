import { db, type Executor } from '../db/database'
import type { ListarUnidadesAdminQuery, UnidadeAdmin } from '../types/admin-unidades.types'

const selecao = `
    SELECT un.id, un.empresa_id, un.documento AS cnpj, un.razao_social, un.nome_exibicao, un.ativo,
           un.sincronizado_em,
           (SELECT count(*)::int FROM colaboradores col WHERE col.unidade_id = un.id AND col.ativo) AS qtd_colaboradores
      FROM unidades un`

export async function listar(q: ListarUnidadesAdminQuery, empresaId: number | null) {
    const { rows } = await db.query<UnidadeAdmin>(
        `${selecao}
          WHERE ($1::int IS NULL OR un.empresa_id = $1)
            AND ($2::boolean IS NULL OR (un.nome_exibicao IS NOT NULL) = $2)
            AND ($3::boolean IS NULL OR un.ativo = $3)
          ORDER BY un.nome_exibicao IS NOT NULL, un.nome_exibicao, un.razao_social`,
        [empresaId, q.mapeada ?? null, q.ativo ?? null],
    )
    return rows
}

export async function buscar(id: number, executor: Executor = db) {
    const { rows } = await executor.query<UnidadeAdmin>(`${selecao} WHERE un.id = $1`, [id])
    return rows[0] ?? null
}

export async function nomeEmUso(empresaId: number, nome: string, ignorarId: number) {
    const { rows } = await db.query(
        'SELECT 1 FROM unidades WHERE empresa_id = $1 AND lower(nome_exibicao) = lower($2) AND id <> $3',
        [empresaId, nome, ignorarId],
    )
    return rows.length > 0
}

export async function atualizar(id: number, nomeExibicao: string | null, ativo: boolean, executor: Executor = db) {
    await executor.query('UPDATE unidades SET nome_exibicao = $2, ativo = $3 WHERE id = $1', [id, nomeExibicao, ativo])
}

export async function solicitarSincronizacao(empresaId: number | null, executor: Executor = db) {
    const { rows } = await executor.query<{ id: number; sincronizacao_solicitada_em: Date }>(
        `UPDATE empresas SET sincronizacao_solicitada_em = now()
          WHERE ativo AND ($1::int IS NULL OR id = $1)
      RETURNING id, sincronizacao_solicitada_em`,
        [empresaId],
    )
    return rows
}
