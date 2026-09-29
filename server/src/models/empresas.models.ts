import { db, type Executor } from '../db/database'
import type { DadosEmpresa, Empresa } from '../types/empresas.types'

const selecao = `
    SELECT e.id, e.nome, e.secullum_usuario, e.secullum_banco_id,
           e.secullum_senha_cripto IS NOT NULL AS possui_senha,
           e.ativo, e.sincronizacao_solicitada_em, e.sincronizado_em, e.criado_em, e.atualizado_em,
           (SELECT count(*)::int FROM unidades un WHERE un.empresa_id = e.id) AS qtd_unidades
      FROM empresas e`

export async function listar() {
    const { rows } = await db.query<Empresa>(`${selecao} ORDER BY e.nome`)
    return rows
}

export async function buscar(id: number, executor: Executor = db) {
    const { rows } = await executor.query<Empresa>(`${selecao} WHERE e.id = $1`, [id])
    return rows[0] ?? null
}

export async function buscarCredenciais(id: number) {
    const { rows } = await db.query<{ secullum_usuario: string | null; secullum_senha_cripto: string | null }>(
        'SELECT secullum_usuario, secullum_senha_cripto FROM empresas WHERE id = $1',
        [id],
    )
    return rows[0] ?? null
}

export async function conflitos(nome: string | null, bancoId: string | null, ignorarId: number | null) {
    const { rows } = await db.query<{ campo: string }>(
        `SELECT CASE WHEN lower(nome) = lower($1) THEN 'nome' ELSE 'secullum_banco_id' END AS campo
           FROM empresas
          WHERE (lower(nome) = lower($1) OR secullum_banco_id = $2)
            AND ($3::int IS NULL OR id <> $3)
          LIMIT 1`,
        [nome, bancoId, ignorarId],
    )
    return rows[0]?.campo ?? null
}

export async function criar(dados: DadosEmpresa, executor: Executor) {
    const { rows } = await executor.query<{ id: number }>(
        `INSERT INTO empresas (nome, secullum_usuario, secullum_senha_cripto, secullum_banco_id, ativo)
         VALUES ($1, $2, $3, $4, $5)
      RETURNING id`,
        [dados.nome, dados.secullum_usuario, dados.secullum_senha_cripto, dados.secullum_banco_id, dados.ativo],
    )
    return rows[0].id
}

export async function atualizar(id: number, dados: DadosEmpresa, executor: Executor) {
    await executor.query(
        `UPDATE empresas
            SET nome = $2, secullum_usuario = $3, secullum_senha_cripto = $4, secullum_banco_id = $5, ativo = $6
          WHERE id = $1`,
        [id, dados.nome, dados.secullum_usuario, dados.secullum_senha_cripto, dados.secullum_banco_id, dados.ativo],
    )
}
