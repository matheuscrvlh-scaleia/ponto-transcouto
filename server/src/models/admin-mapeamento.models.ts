import { db, type Executor } from '../db/database'
import type { ItemMapeamento } from '../types/admin-mapeamento.types'

export async function listar(empresaId: number, executor: Executor = db) {
    const { rows } = await executor.query<ItemMapeamento>(
        'SELECT coluna_secullum, campo FROM mapeamento_colunas WHERE empresa_id = $1 ORDER BY coluna_secullum',
        [empresaId],
    )
    return rows
}

export async function colunasDosRegistrosRecentes(empresaId: number) {
    const { rows } = await db.query<{ coluna: string }>(
        `WITH recentes AS (
            SELECT f.id FROM fechamentos f
             WHERE f.empresa_id = $1
               AND EXISTS (SELECT 1 FROM registros_horas r WHERE r.fechamento_id = f.id)
             ORDER BY f.id DESC
             LIMIT 10
         )
         SELECT DISTINCT jsonb_array_elements_text(r.dados_brutos -> 'colunas') AS coluna
           FROM registros_horas r
          WHERE r.fechamento_id IN (SELECT id FROM recentes)
            AND jsonb_typeof(r.dados_brutos -> 'colunas') = 'array'`,
        [empresaId],
    )
    return rows.map(r => r.coluna)
}

export async function errosDeMapeamentoRecentes(empresaId: number) {
    const { rows } = await db.query<{ mensagem: string }>(
        `SELECT DISTINCT e.mensagem
           FROM execucao_erros e
           JOIN execucoes_extracao x ON x.id = e.execucao_id
           JOIN fechamentos f ON f.id = x.fechamento_id
          WHERE f.empresa_id = $1 AND e.etapa = 'mapeamento' AND e.criado_em > now() - interval '60 days'`,
        [empresaId],
    )
    return rows.map(r => r.mensagem)
}

export async function substituir(empresaId: number, itens: ItemMapeamento[], executor: Executor) {
    await executor.query('DELETE FROM mapeamento_colunas WHERE empresa_id = $1', [empresaId])
    if (itens.length === 0) return
    await executor.query(
        `INSERT INTO mapeamento_colunas (empresa_id, coluna_secullum, campo)
         SELECT $1, c, m FROM unnest($2::text[], $3::text[]) AS t(c, m)`,
        [empresaId, itens.map(i => i.coluna_secullum), itens.map(i => i.campo)],
    )
}
