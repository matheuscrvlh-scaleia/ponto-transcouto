import { db, type Executor } from '../db/database'
import type {
    Ciclo,
    ErroExecucao,
    ExecucaoResumo,
    FechamentoAdmin,
    ListarFechamentosQuery,
} from '../types/admin-fechamentos.types'

const colunasExecucao = `
    x.id, x.disparo,
    CASE WHEN ud.id IS NULL THEN NULL ELSE json_build_object('id', ud.id, 'nome', ud.nome) END AS disparado_por,
    x.status, x.total_colaboradores, x.processados, x.com_erro, x.mensagem_erro, x.iniciado_em, x.finalizado_em`

const selecaoFechamento = `
    SELECT f.id,
           json_build_object('id', e.id, 'nome', e.nome) AS empresa,
           json_build_object('id', un.id, 'nome', coalesce(un.nome_exibicao, un.razao_social)) AS unidade,
           c.id AS ciclo_id, c.tipo, c.periodo_inicio::text, c.data_referencia::text,
           c.gatilho_em, c.gatilho_previsto_em, c.gatilho_em <> c.gatilho_previsto_em AS gatilho_ajustado,
           CASE WHEN ua.id IS NULL THEN NULL ELSE json_build_object('id', ua.id, 'nome', ua.nome) END AS gatilho_ajustado_por,
           f.status, f.tentativas, f.proxima_tentativa_em, f.total_colaboradores,
           (SELECT count(*)::int FROM registros_horas r WHERE r.fechamento_id = f.id) AS registros,
           f.publicado_em,
           (SELECT row_to_json(ult) FROM (
                SELECT ${colunasExecucao}
                  FROM execucoes_extracao x
                  LEFT JOIN usuarios ud ON ud.id = x.disparado_por
                 WHERE x.fechamento_id = f.id
                 ORDER BY x.iniciado_em DESC
                 LIMIT 1) ult) AS ultima_execucao
      FROM fechamentos f
      JOIN ciclos c    ON c.id = f.ciclo_id
      JOIN unidades un ON un.id = f.unidade_id
      JOIN empresas e  ON e.id = f.empresa_id
      LEFT JOIN usuarios ua ON ua.id = c.gatilho_ajustado_por`

export async function listar(q: ListarFechamentosQuery) {
    const { rows } = await db.query<FechamentoAdmin>(
        `${selecaoFechamento}
          WHERE ($1::int IS NULL OR f.empresa_id = $1)
            AND ($2::int IS NULL OR f.unidade_id = $2)
            AND ($3::int IS NULL OR f.ciclo_id = $3)
            AND ($4::text IS NULL OR f.status = $4)
            AND ($5::date IS NULL OR c.data_referencia >= $5)
            AND ($6::date IS NULL OR c.data_referencia <= $6)
          ORDER BY c.data_referencia DESC, e.nome, coalesce(un.nome_exibicao, un.razao_social)
          LIMIT $7`,
        [
            q.empresa_id ?? null,
            q.unidade_id ?? null,
            q.ciclo_id ?? null,
            q.status ?? null,
            q.de ?? null,
            q.ate ?? null,
            q.limite,
        ],
    )
    return rows
}

export async function buscar(id: number, executor: Executor = db) {
    const { rows } = await executor.query<FechamentoAdmin>(`${selecaoFechamento} WHERE f.id = $1`, [id])
    return rows[0] ?? null
}

export async function execucoes(fechamentoId: number) {
    const { rows } = await db.query<ExecucaoResumo>(
        `SELECT ${colunasExecucao}
           FROM execucoes_extracao x
           LEFT JOIN usuarios ud ON ud.id = x.disparado_por
          WHERE x.fechamento_id = $1
          ORDER BY x.iniciado_em DESC`,
        [fechamentoId],
    )
    return rows
}

export async function erros(fechamentoId: number) {
    const { rows } = await db.query<ErroExecucao>(
        `SELECT e.id, e.execucao_id, e.etapa, e.http_status, e.mensagem,
                CASE WHEN col.id IS NULL THEN NULL ELSE json_build_object('id', col.id, 'nome', col.nome) END AS colaborador,
                e.criado_em
           FROM execucao_erros e
           JOIN execucoes_extracao x ON x.id = e.execucao_id
           LEFT JOIN colaboradores col ON col.id = e.colaborador_id
          WHERE x.fechamento_id = $1
          ORDER BY e.id DESC
          LIMIT 500`,
        [fechamentoId],
    )
    return rows
}

export async function existePublicadoPosterior(fechamentoId: number) {
    const { rows } = await db.query(
        `SELECT 1
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
           JOIN fechamentos f2 ON f2.unidade_id = f.unidade_id AND f2.id <> f.id AND f2.status = 'sucesso'
           JOIN ciclos c2 ON c2.id = f2.ciclo_id AND c2.data_referencia > c.data_referencia
          WHERE f.id = $1
         UNION ALL
         SELECT 1
           FROM registros_horas r
           JOIN registros_horas r2 ON r2.base_semana_registro_id = r.id
           JOIN fechamentos f2 ON f2.id = r2.fechamento_id AND f2.status = 'sucesso'
          WHERE r.fechamento_id = $1
          LIMIT 1`,
        [fechamentoId],
    )
    return rows.length > 0
}

export async function reabrir(fechamentoId: number, executor: Executor) {
    const { rowCount } = await executor.query(
        `UPDATE fechamentos
            SET status = 'pendente', tentativas = 0, proxima_tentativa_em = now(),
                heartbeat_em = NULL, publicado_em = NULL
          WHERE id = $1 AND status <> 'processando'`,
        [fechamentoId],
    )
    if (!rowCount) return false
    await executor.query('DELETE FROM registros_horas WHERE fechamento_id = $1', [fechamentoId])
    return true
}

export async function publicar(fechamentoId: number, executor: Executor) {
    const { rowCount } = await executor.query(
        `UPDATE fechamentos
            SET status = 'sucesso', publicado_em = now(), proxima_tentativa_em = NULL, heartbeat_em = NULL,
                total_colaboradores = coalesce(total_colaboradores,
                                               (SELECT count(*) FROM registros_horas WHERE fechamento_id = $1))
          WHERE id = $1 AND status NOT IN ('sucesso', 'processando')
            AND EXISTS (SELECT 1 FROM registros_horas WHERE fechamento_id = $1)`,
        [fechamentoId],
    )
    return (rowCount ?? 0) > 0
}

export async function buscarCiclo(id: number, executor: Executor = db) {
    const { rows } = await executor.query<Ciclo>(
        `SELECT id, empresa_id, tipo, periodo_inicio::text, data_referencia::text, gatilho_previsto_em, gatilho_em,
                gatilho_ajustado_por, gatilho_ajustado_em
           FROM ciclos WHERE id = $1`,
        [id],
    )
    return rows[0] ?? null
}

export async function ajustarGatilho(cicloId: number, gatilhoEm: Date, usuarioId: number, executor: Executor) {
    const { rowCount } = await executor.query(
        `UPDATE ciclos SET gatilho_em = $2, gatilho_ajustado_por = $3, gatilho_ajustado_em = now()
          WHERE id = $1
            AND NOT EXISTS (SELECT 1 FROM fechamentos
                             WHERE ciclo_id = $1 AND status IN ('processando', 'sucesso'))`,
        [cicloId, gatilhoEm, usuarioId],
    )
    return (rowCount ?? 0) > 0
}

export async function usoCota(empresaId: number) {
    const { rows } = await db.query<{ rota: string; usadas: number; primeira: Date | null }>(
        `SELECT rota, count(*)::int AS usadas, min(feita_em) AS primeira
           FROM chamadas_api
          WHERE empresa_id = $1 AND feita_em > now() - interval '1 hour'
          GROUP BY rota
          ORDER BY rota`,
        [empresaId],
    )
    return rows
}

export async function limiteCota(empresaId: number) {
    const { rows } = await db.query<{ cota: number }>(
        'SELECT cota_calcular_por_hora AS cota FROM configuracoes WHERE empresa_id = $1',
        [empresaId],
    )
    return rows[0]?.cota ?? null
}
