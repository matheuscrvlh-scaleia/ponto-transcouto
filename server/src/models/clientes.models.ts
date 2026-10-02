import { db, type Executor } from '../db/database'
import type { Ator } from '../types/auth.types'
import type { ClienteGerenciado, DadosCliente, ListarClientesQuery } from '../types/clientes.types'
import type { Tela } from '../types/permissoes.types'

const selecao = `
    SELECT c.id, c.nome, c.email, c.cpf, c.perfil,
           (SELECT json_build_object('id', g.id, 'nome', g.nome, 'alcance', g.alcance, 'telas', g.telas)
              FROM grupos_permissao g WHERE g.id = c.grupo_id) AS grupo,
           c.cargo, c.telefone, c.empresa_id, c.ativo, c.deve_trocar_senha,
           c.ultimo_login_em, c.criado_em AT TIME ZONE 'UTC' AS criado_em,
           coalesce((SELECT json_agg(json_build_object('id', un.id, 'nome_exibicao', un.nome_exibicao)
                                     ORDER BY un.nome_exibicao)
                       FROM cliente_unidades cu
                       JOIN unidades un ON un.id = cu.unidade_id
                      WHERE cu.cliente_id = c.id), '[]') AS unidades
      FROM clientes c`

export async function listar(q: ListarClientesQuery, empresaId: number | null) {
    const { rows } = await db.query<ClienteGerenciado & { total: number }>(
        `SELECT x.*, count(*) OVER ()::int AS total FROM (${selecao}
          WHERE ($1::int IS NULL OR c.empresa_id = $1)
            AND ($2::text IS NULL OR c.nome ILIKE '%' || $2 || '%' OR c.email ILIKE '%' || $2 || '%'
                 OR c.cpf = regexp_replace($2, '[^0-9]', '', 'g'))
            AND ($3::text IS NULL OR c.perfil = $3)
            AND ($4::boolean IS NULL OR c.ativo = $4)
            AND ($8::int IS NULL OR c.grupo_id = $8)
            AND ($5::int IS NULL OR EXISTS (SELECT 1 FROM cliente_unidades cu
                                             WHERE cu.cliente_id = c.id AND cu.unidade_id = $5))
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
            q.grupo_id ?? null,
        ],
    )
    return { itens: rows.map(({ total: _t, ...c }) => c), total: rows[0]?.total ?? 0 }
}

export async function buscarPorId(id: number, executor: Executor = db) {
    const { rows } = await executor.query<ClienteGerenciado>(`${selecao} WHERE c.id = $1`, [id])
    return rows[0] ?? null
}

export async function criar(dados: DadosCliente, senhaHash: string, executor: Executor = db) {
    const { rows } = await executor.query<{ id: number }>(
        `INSERT INTO clientes (nome, email, cpf, grupo_id, cargo, telefone, empresa_id, ativo, senha, deve_trocar_senha)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING id`,
        [dados.nome, dados.email, dados.cpf, dados.grupo_id, dados.cargo, dados.telefone, dados.empresa_id, dados.ativo, senhaHash],
    )
    return rows[0].id
}

export async function atualizar(id: number, dados: DadosCliente, executor: Executor = db) {
    await executor.query(
        `UPDATE clientes
            SET nome = $2, email = $3, cpf = $4, grupo_id = $5, cargo = $6, telefone = $7, empresa_id = $8, ativo = $9
          WHERE id = $1`,
        [id, dados.nome, dados.email, dados.cpf, dados.grupo_id, dados.cargo, dados.telefone, dados.empresa_id, dados.ativo],
    )
}

export async function removerUnidades(clienteId: number, executor: Executor = db) {
    await executor.query('DELETE FROM cliente_unidades WHERE cliente_id = $1', [clienteId])
}

export async function vincularUnidades(
    clienteId: number,
    empresaId: number,
    unidadeIds: number[],
    criadoPor: Ator,
    executor: Executor = db,
) {
    if (unidadeIds.length === 0) return
    await executor.query(
        `INSERT INTO cliente_unidades (cliente_id, unidade_id, empresa_id, criado_por_usuario, criado_por_cliente)
         SELECT $1, un.id, $2, $4, $5 FROM unidades un WHERE un.id = ANY($3::int[]) AND un.empresa_id = $2
         ON CONFLICT DO NOTHING`,
        [
            clienteId,
            empresaId,
            unidadeIds,
            criadoPor.tipo === 'equipe' ? criadoPor.id : null,
            criadoPor.tipo === 'cliente' ? criadoPor.id : null,
        ],
    )
}

export async function unidadesDaEmpresa(empresaId: number, unidadeIds: number[]) {
    const { rows } = await db.query<{ id: number }>(
        'SELECT id FROM unidades WHERE empresa_id = $1 AND id = ANY($2::int[])',
        [empresaId, unidadeIds],
    )
    return rows.map(r => r.id)
}

export async function empresaExiste(empresaId: number) {
    const { rows } = await db.query('SELECT 1 FROM empresas WHERE id = $1', [empresaId])
    return rows.length > 0
}

export async function redefinirSenha(id: number, senhaHash: string, executor: Executor = db) {
    await executor.query(
        `UPDATE clientes
            SET senha = $2, deve_trocar_senha = true, token_versao = token_versao + 1
          WHERE id = $1`,
        [id, senhaHash],
    )
}

/** Exclusão definitiva: vínculos com unidades saem junto; autorias antigas (auditoria etc.) ficam sem o nome. */
export async function excluir(id: number, executor: Executor = db) {
    const { rowCount } = await executor.query('DELETE FROM clientes WHERE id = $1', [id])
    return (rowCount ?? 0) > 0
}

/** Grupo de permissão da empresa: pelo id ou, sem id, o grupo padrão do perfil (RH/Gestor). */
export async function grupoDaEmpresa(empresaId: number, grupoId: number | null, perfil: string | null, ex: Executor = db) {
    const { rows } = await ex.query<{ id: number; empresa_id: number; nome: string; alcance: 'empresa' | 'unidades'; telas: Tela[] }>(
        `SELECT id, empresa_id, nome, alcance, telas FROM grupos_permissao
          WHERE empresa_id = $1 AND (CASE WHEN $2::int IS NOT NULL THEN id = $2 ELSE padrao = $3 END)`,
        [empresaId, grupoId, perfil],
    )
    return rows[0] ?? null
}
