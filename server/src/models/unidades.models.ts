import { db } from '../db/database'
import type { Limites } from '../services/dashboard.service'
import type {
    DashboardQuery,
    FechamentoPublicado,
    LinhaDashboard,
    ResumoDashboard,
    UnidadeAcessivel,
    UnidadeUsuario,
} from '../types/unidades.types'

const foraDaCurvaSql = (saldo: string, pos: string, neg: string) =>
    `CASE WHEN ${saldo} >= ${pos} THEN 'positivo' WHEN ${saldo} <= -${neg} THEN 'negativo' END`

export async function listarDoUsuario(usuarioId: number, empresaId: number | null, padrao: Limites) {
    const { rows } = await db.query<UnidadeUsuario>(
        `SELECT un.id, un.nome_exibicao, un.empresa_id,
                CASE WHEN uf.id IS NULL THEN NULL
                     ELSE json_build_object('id', uf.id, 'data_referencia', uf.data_referencia,
                                            'publicado_em', uf.publicado_em) END AS ultimo_fechamento,
                coalesce(st.total, 0) AS total_colaboradores,
                coalesce(st.fora, 0) AS fora_da_curva
           FROM unidades un
           LEFT JOIN configuracoes cf ON cf.empresa_id = un.empresa_id
           LEFT JOIN LATERAL (
                SELECT f.id, c.data_referencia::text AS data_referencia, f.publicado_em
                  FROM fechamentos f
                  JOIN ciclos c ON c.id = f.ciclo_id
                 WHERE f.unidade_id = un.id AND f.status = 'sucesso'
                 ORDER BY c.data_referencia DESC, f.publicado_em DESC
                 LIMIT 1
           ) uf ON true
           LEFT JOIN LATERAL (
                SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE r.saldo_banco_total >= coalesce(cf.alerta_saldo_positivo_minutos, $3)
                                           OR r.saldo_banco_total <= -coalesce(cf.alerta_saldo_negativo_minutos, $4))::int AS fora
                  FROM registros_horas r
                 WHERE r.fechamento_id = uf.id
           ) st ON true
          WHERE un.id IN (SELECT unidades_permitidas($1))
            AND un.nome_exibicao IS NOT NULL
            AND un.ativo
            AND ($2::int IS NULL OR un.empresa_id = $2)
          ORDER BY un.nome_exibicao`,
        [usuarioId, empresaId, padrao.alerta_pos, padrao.alerta_neg],
    )
    return rows
}

export async function buscarPermitida(usuarioId: number, unidadeId: number) {
    const { rows } = await db.query<UnidadeAcessivel>(
        `SELECT un.id, coalesce(un.nome_exibicao, un.razao_social) AS nome, un.empresa_id
           FROM unidades un
          WHERE un.id = $2 AND un.id IN (SELECT unidades_permitidas($1))`,
        [usuarioId, unidadeId],
    )
    return rows[0] ?? null
}

export async function ultimoFechamentoPublicado(unidadeId: number) {
    const { rows } = await db.query<FechamentoPublicado>(
        `SELECT f.id, c.periodo_inicio::text, c.data_referencia::text, f.publicado_em,
                c.tipo = 'fechamento_mes' AS semana_fechamento_mes
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE f.unidade_id = $1 AND f.status = 'sucesso'
          ORDER BY c.data_referencia DESC, f.publicado_em DESC
          LIMIT 1`,
        [unidadeId],
    )
    return rows[0] ?? null
}

const filtrosDashboard: Record<DashboardQuery['filtro'], string> = {
    todos: 'true',
    extra: 'r.extra_periodo > 0',
    negativa: 'r.negativa_periodo > 0',
    fora: '(r.saldo_banco_total >= lim.pos OR r.saldo_banco_total <= -lim.neg)',
}

const ordensDashboard: Record<DashboardQuery['ordem'], string> = {
    saldo_desc: 'r.saldo_banco_total DESC, col.nome',
    saldo_asc: 'r.saldo_banco_total ASC, col.nome',
    nome: 'col.nome, col.id',
}

export async function linhasDashboard(fechamentoId: number, limites: Limites, q: DashboardQuery) {
    const { rows } = await db.query<LinhaDashboard & { total: number }>(
        `SELECT col.id, col.nome, col.funcao,
                r.extra_periodo AS extra_min, r.negativa_periodo AS negativa_min,
                r.pagas_periodo AS pagas_min, r.banco_periodo AS banco_min,
                r.saldo_banco_total AS saldo_min,
                ${foraDaCurvaSql('r.saldo_banco_total', 'lim.pos', 'lim.neg')} AS fora_da_curva,
                count(*) OVER ()::int AS total
           FROM registros_horas r
           JOIN colaboradores col ON col.id = r.colaborador_id
          CROSS JOIN (SELECT $3::int AS pos, $4::int AS neg) lim
          WHERE r.fechamento_id = $1
            AND ($2::text IS NULL OR col.nome ILIKE '%' || $2 || '%')
            AND ${filtrosDashboard[q.filtro]}
          ORDER BY ${ordensDashboard[q.ordem]}
          LIMIT $5 OFFSET $6`,
        [fechamentoId, q.busca || null, limites.alerta_pos, limites.alerta_neg, q.por_pagina, (q.pagina - 1) * q.por_pagina],
    )
    const total = rows[0]?.total ?? (await contarLinhas(fechamentoId, limites, q))
    return { linhas: rows.map(({ total: _total, ...linha }) => linha), total }
}

async function contarLinhas(fechamentoId: number, limites: Limites, q: DashboardQuery) {
    const { rows } = await db.query<{ total: number }>(
        `SELECT count(*)::int AS total
           FROM registros_horas r
           JOIN colaboradores col ON col.id = r.colaborador_id
          CROSS JOIN (SELECT $3::int AS pos, $4::int AS neg) lim
          WHERE r.fechamento_id = $1
            AND ($2::text IS NULL OR col.nome ILIKE '%' || $2 || '%')
            AND ${filtrosDashboard[q.filtro]}`,
        [fechamentoId, q.busca || null, limites.alerta_pos, limites.alerta_neg],
    )
    return rows[0].total
}

export async function resumoDashboard(fechamentoId: number, limites: Limites) {
    const { rows } = await db.query<ResumoDashboard>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE saldo_banco_total >= $2::int)::int AS fora_positivo,
                count(*) FILTER (WHERE saldo_banco_total <= -$3::int)::int AS fora_negativo,
                coalesce(sum(pagas_periodo), 0)::int AS pagas_total_min
           FROM registros_horas
          WHERE fechamento_id = $1`,
        [fechamentoId, limites.alerta_pos, limites.alerta_neg],
    )
    return rows[0]
}

// Semana de fechamento mensal: ciclo 'fechamento_mes' nos próximos 7 dias (ou recém-passado) ainda não publicado na unidade.
export async function emSemanaDeFechamentoMes(empresaId: number, unidadeId: number) {
    const { rows } = await db.query<{ aviso: boolean }>(
        `SELECT EXISTS (
                SELECT 1
                  FROM ciclos c
                  LEFT JOIN fechamentos f ON f.ciclo_id = c.id AND f.unidade_id = $2
                 WHERE c.empresa_id = $1
                   AND c.tipo = 'fechamento_mes'
                   AND c.gatilho_em <= now() + interval '7 days'
                   AND c.gatilho_em >= now() - interval '7 days'
                   AND coalesce(f.status, 'pendente') IN ('pendente', 'processando', 'falhou')
                ) AS aviso`,
        [empresaId, unidadeId],
    )
    return rows[0].aviso
}

export async function proximoGatilho(empresaId: number) {
    const { rows } = await db.query<{ gatilho_em: Date | null; tipo: string | null }>(
        `SELECT gatilho_em, tipo FROM ciclos
          WHERE empresa_id = $1 AND gatilho_em > now()
          ORDER BY gatilho_em
          LIMIT 1`,
        [empresaId],
    )
    return rows[0] ?? null
}
