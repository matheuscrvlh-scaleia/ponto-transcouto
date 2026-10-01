import { db, type Executor } from '../db/database'
import type { DadosMembro, ListarEquipeQuery, MembroEquipe } from '../types/equipe.types'

/* Equipe Scale IA = tabela usuarios (perfil sempre 'admin'). */

const selecao = `
    SELECT u.id, u.nome, u.email, u.cpf, u.ativo, u.deve_trocar_senha,
           u.ultimo_login_em, u.criado_em AT TIME ZONE 'UTC' AS criado_em
      FROM usuarios u`

export async function listar(q: ListarEquipeQuery) {
    const { rows } = await db.query<MembroEquipe & { total: number }>(
        `SELECT x.*, count(*) OVER ()::int AS total FROM (${selecao}
          WHERE ($1::text IS NULL OR u.nome ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%'
                 OR u.cpf = regexp_replace($1, '[^0-9]', '', 'g'))
            AND ($2::boolean IS NULL OR u.ativo = $2)
        ) x
          ORDER BY x.nome, x.id
          LIMIT $3 OFFSET $4`,
        [q.busca || null, q.ativo ?? null, q.por_pagina, (q.pagina - 1) * q.por_pagina],
    )
    return { itens: rows.map(({ total: _t, ...m }) => m), total: rows[0]?.total ?? 0 }
}

export async function buscarPorId(id: number, executor: Executor = db) {
    const { rows } = await executor.query<MembroEquipe>(`${selecao} WHERE u.id = $1`, [id])
    return rows[0] ?? null
}

export async function criar(dados: DadosMembro, senhaHash: string, executor: Executor = db) {
    const { rows } = await executor.query<{ id: number }>(
        `INSERT INTO usuarios (nome, email, cpf, perfil, ativo, senha, deve_trocar_senha)
         VALUES ($1, $2, $3, 'admin', $4, $5, true)
      RETURNING id`,
        [dados.nome, dados.email, dados.cpf, dados.ativo, senhaHash],
    )
    return rows[0].id
}

export async function atualizar(id: number, dados: DadosMembro, executor: Executor = db) {
    await executor.query('UPDATE usuarios SET nome = $2, email = $3, cpf = $4, ativo = $5 WHERE id = $1', [
        id,
        dados.nome,
        dados.email,
        dados.cpf,
        dados.ativo,
    ])
}

export async function redefinirSenha(id: number, senhaHash: string, executor: Executor = db) {
    await executor.query(
        `UPDATE usuarios
            SET senha = $2, deve_trocar_senha = true, token_versao = token_versao + 1
          WHERE id = $1`,
        [id, senhaHash],
    )
}
