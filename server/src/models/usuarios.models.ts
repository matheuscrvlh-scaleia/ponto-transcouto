import { db, type Executor } from '../db/database'
import type { DadosUsuario, ListarUsuariosQuery, UsuarioGerenciado } from '../types/usuarios.types'

const selecao = `
    SELECT u.id, u.nome, u.email, u.cpf, u.perfil, u.empresa_id, u.ativo, u.deve_trocar_senha,
           u.ultimo_login_em, u.criado_em AT TIME ZONE 'UTC' AS criado_em,
           coalesce((SELECT json_agg(json_build_object('id', un.id, 'nome_exibicao', un.nome_exibicao)
                                     ORDER BY un.nome_exibicao)
                       FROM usuario_unidades uu
                       JOIN unidades un ON un.id = uu.unidade_id
                      WHERE uu.usuario_id = u.id), '[]') AS unidades
      FROM usuarios u`

export async function listar(q: ListarUsuariosQuery, empresaId: number | null) {
    const { rows } = await db.query<UsuarioGerenciado & { total: number }>(
        `SELECT x.*, count(*) OVER ()::int AS total FROM (${selecao}
          WHERE ($1::int IS NULL OR u.empresa_id = $1)
            AND ($2::text IS NULL OR u.nome ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%'
                 OR u.cpf = regexp_replace($2, '[^0-9]', '', 'g'))
            AND ($3::text IS NULL OR u.perfil = $3)
            AND ($4::boolean IS NULL OR u.ativo = $4)
            AND ($5::int IS NULL OR EXISTS (SELECT 1 FROM usuario_unidades uu
                                             WHERE uu.usuario_id = u.id AND uu.unidade_id = $5))
        ) x
          ORDER BY x.nome, x.id
          LIMIT $6 OFFSET $7`,
        [
            empresaId,
            q.busca || null,
            q.perfil ?? null,
            q.ativo ?? null,
            q.unidade_id ?? null,
            q.por_pagina,
            (q.pagina - 1) * q.por_pagina,
        ],
    )
    return { itens: rows.map(({ total: _t, ...u }) => u), total: rows[0]?.total ?? 0 }
}

export async function buscarPorId(id: number, executor: Executor = db) {
    const { rows } = await executor.query<UsuarioGerenciado>(`${selecao} WHERE u.id = $1`, [id])
    return rows[0] ?? null
}

export async function criar(dados: DadosUsuario, senhaHash: string, executor: Executor = db) {
    const { rows } = await executor.query<{ id: number }>(
        `INSERT INTO usuarios (nome, email, cpf, perfil, empresa_id, ativo, senha, deve_trocar_senha)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING id`,
        [dados.nome, dados.email, dados.cpf, dados.perfil, dados.empresa_id, dados.ativo, senhaHash],
    )
    return rows[0].id
}

export async function atualizar(id: number, dados: DadosUsuario, executor: Executor = db) {
    await executor.query(
        `UPDATE usuarios
            SET nome = $2, email = $3, cpf = $4, perfil = $5, empresa_id = $6, ativo = $7
          WHERE id = $1`,
        [id, dados.nome, dados.email, dados.cpf, dados.perfil, dados.empresa_id, dados.ativo],
    )
}

export async function removerUnidades(usuarioId: number, executor: Executor = db) {
    await executor.query('DELETE FROM usuario_unidades WHERE usuario_id = $1', [usuarioId])
}

export async function vincularUnidades(
    usuarioId: number,
    empresaId: number,
    unidadeIds: number[],
    criadoPor: number,
    executor: Executor = db,
) {
    if (unidadeIds.length === 0) return
    await executor.query(
        `INSERT INTO usuario_unidades (usuario_id, unidade_id, empresa_id, criado_por)
         SELECT $1, un.id, $2, $4 FROM unidades un WHERE un.id = ANY($3::int[]) AND un.empresa_id = $2
         ON CONFLICT DO NOTHING`,
        [usuarioId, empresaId, unidadeIds, criadoPor],
    )
}

export async function unidadesDaEmpresa(empresaId: number, unidadeIds: number[]) {
    const { rows } = await db.query<{ id: number }>(
        'SELECT id FROM unidades WHERE empresa_id = $1 AND id = ANY($2::int[])',
        [empresaId, unidadeIds],
    )
    return rows.map(r => r.id)
}

export async function loginEmUso(email: string | null, cpf: string | null, ignorarId: number | null) {
    const { rows } = await db.query(
        `SELECT 1 FROM usuarios
          WHERE (lower(email) = lower($1) OR cpf = $2)
            AND ($3::int IS NULL OR id <> $3)
          LIMIT 1`,
        [email, cpf, ignorarId],
    )
    return rows.length > 0
}

export async function empresaExiste(empresaId: number) {
    const { rows } = await db.query('SELECT 1 FROM empresas WHERE id = $1', [empresaId])
    return rows.length > 0
}

export async function redefinirSenha(id: number, senhaHash: string, executor: Executor = db) {
    await executor.query(
        `UPDATE usuarios
            SET senha = $2, deve_trocar_senha = true, token_versao = token_versao + 1
          WHERE id = $1`,
        [id, senhaHash],
    )
}
