import { db, type Executor } from '../db/database'
import type { Alcance, GrupoPermissao, Tela } from '../types/permissoes.types'

const selecao = `
    SELECT g.id, g.empresa_id, g.nome, g.descricao, g.alcance, g.telas, g.padrao, g.atualizado_em,
           (SELECT count(*)::int FROM clientes c WHERE c.grupo_id = g.id) AS usuarios
      FROM grupos_permissao g`

/** Grupos da empresa: os padrão (RH, Gestor) primeiro, depois por nome. */
export async function listar(empresaId: number) {
    const { rows } = await db.query<GrupoPermissao>(
        `${selecao}
          WHERE g.empresa_id = $1
          ORDER BY g.padrao = 'rh' DESC NULLS LAST, g.padrao = 'gestor' DESC NULLS LAST, lower(g.nome)`,
        [empresaId],
    )
    return rows
}

export async function buscar(id: number, ex: Executor = db) {
    const { rows } = await ex.query<GrupoPermissao>(`${selecao} WHERE g.id = $1`, [id])
    return rows[0] ?? null
}

export type DadosGrupo = { nome: string; descricao: string | null; alcance: Alcance; telas: Tela[] }

export async function criar(empresaId: number, dados: DadosGrupo, ex: Executor = db) {
    const { rows } = await ex.query<{ id: number }>(
        `INSERT INTO grupos_permissao (empresa_id, nome, descricao, alcance, telas)
         VALUES ($1, $2, $3, $4, $5::text[])
      RETURNING id`,
        [empresaId, dados.nome, dados.descricao, dados.alcance, dados.telas],
    )
    return rows[0].id
}

export async function atualizar(id: number, dados: DadosGrupo, ex: Executor = db) {
    await ex.query(
        `UPDATE grupos_permissao SET nome = $2, descricao = $3, alcance = $4, telas = $5::text[] WHERE id = $1`,
        [id, dados.nome, dados.descricao, dados.alcance, dados.telas],
    )
}

export async function excluir(id: number, ex: Executor = db) {
    await ex.query('DELETE FROM grupos_permissao WHERE id = $1', [id])
}

/** Nome já usado por outro grupo da empresa (sem diferenciar maiúsculas). */
export async function nomeEmUso(empresaId: number, nome: string, ignorarId: number | null) {
    const { rows } = await db.query(
        `SELECT 1 FROM grupos_permissao
          WHERE empresa_id = $1 AND lower(nome) = lower($2) AND ($3::int IS NULL OR id <> $3)`,
        [empresaId, nome, ignorarId],
    )
    return rows.length > 0
}
