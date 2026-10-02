import { db } from '../db/database'
import { unidadesPermitidasSql } from '../db/escopo'
import type { Ator } from '../types/auth.types'
import type { ColaboradorAcessivel, DiaHistorico, RegistroAtual, SemanaHistorico } from '../types/colaboradores.types'

// Quem trocou de unidade continua visível para a unidade antiga (pelos fechamentos publicados dela).
export async function buscarPermitido(ator: Ator, colaboradorId: number) {
    const { rows } = await db.query<ColaboradorAcessivel>(
        `SELECT col.id, col.nome, col.funcao, col.departamento, col.ativo, col.empresa_id,
                json_build_object('id', un.id, 'nome', coalesce(un.nome_exibicao, un.razao_social)) AS unidade
           FROM colaboradores col
           JOIN LATERAL (
                SELECT x.unidade_id
                  FROM (SELECT col.unidade_id, 0 AS prioridade, NULL::date AS data_referencia
                        UNION ALL
                        SELECT f.unidade_id, 1, c.data_referencia
                          FROM registros_horas r
                          JOIN fechamentos f ON f.id = r.fechamento_id AND f.status = 'sucesso'
                          JOIN ciclos c ON c.id = f.ciclo_id
                         WHERE r.colaborador_id = col.id) x
                 WHERE x.unidade_id IN (SELECT ${unidadesPermitidasSql(ator)})
                 ORDER BY x.prioridade, x.data_referencia DESC
                 LIMIT 1
           ) visivel ON true
           JOIN unidades un ON un.id = visivel.unidade_id
          WHERE col.id = $2`,
        [ator.id, colaboradorId],
    )
    return rows[0] ?? null
}

export async function registroAtual(ator: Ator, colaboradorId: number) {
    const { rows } = await db.query<RegistroAtual>(
        `SELECT f.id AS fechamento_id, c.data_referencia::text,
                r.extra_periodo AS extra_min, r.negativa_periodo AS negativa_min,
                r.pagas_periodo AS pagas_min, r.banco_periodo AS banco_min,
                r.saldo_banco_total AS saldo_min
           FROM registros_horas r
           JOIN fechamentos f ON f.id = r.fechamento_id AND f.status = 'sucesso'
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE r.colaborador_id = $2
            AND f.unidade_id IN (SELECT ${unidadesPermitidasSql(ator)})
          ORDER BY c.data_referencia DESC, f.publicado_em DESC
          LIMIT 1`,
        [ator.id, colaboradorId],
    )
    return rows[0] ?? null
}

/** Valor ao vivo do colaborador (empresa em tempo real), se já foi atualizado alguma vez. */
export async function registroTempoReal(ator: Ator, colaboradorId: number) {
    const { rows } = await db.query<RegistroAtual & { atualizado_em: Date }>(
        `SELECT NULL::int AS fechamento_id, rt.dados_ate::text AS data_referencia,
                rt.extra_periodo AS extra_min, rt.negativa_periodo AS negativa_min,
                rt.pagas_periodo AS pagas_min, rt.banco_periodo AS banco_min,
                rt.saldo_banco_total AS saldo_min, rt.extraido_em AS atualizado_em
           FROM registros_tempo_real rt
           JOIN configuracoes cf ON cf.empresa_id = rt.empresa_id AND cf.modo_extracao = 'tempo_real'
          WHERE rt.colaborador_id = $2 AND rt.extraido_em IS NOT NULL
            AND rt.unidade_id IN (SELECT ${unidadesPermitidasSql(ator)})`,
        [ator.id, colaboradorId],
    )
    return rows[0] ?? null
}

/**
 * Histórico por dia (empresas em tempo real). Os valores *_dia são a diferença para o dia
 * anterior registrado no mesmo período; no primeiro dia registrado do período ficam null.
 */
export async function historicoDiario(ator: Ator, colaboradorId: number, dias: number) {
    const { rows } = await db.query<DiaHistorico>(
        `SELECT x.* FROM (
            SELECT hd.dia::text AS dia, hd.periodo_inicio::text AS periodo_inicio,
                   json_build_object('id', un.id, 'nome', coalesce(un.nome_exibicao, un.razao_social)) AS unidade,
                   hd.extra_periodo - lag(hd.extra_periodo) OVER w AS extra_dia,
                   hd.negativa_periodo - lag(hd.negativa_periodo) OVER w AS negativa_dia,
                   hd.pagas_periodo - lag(hd.pagas_periodo) OVER w AS pagas_dia,
                   hd.banco_periodo - lag(hd.banco_periodo) OVER w AS banco_dia,
                   hd.extra_periodo, hd.negativa_periodo, hd.pagas_periodo, hd.banco_periodo,
                   hd.saldo_banco_total AS saldo_total, hd.atualizado_em
              FROM historico_diario hd
              JOIN unidades un ON un.id = hd.unidade_id
             WHERE hd.colaborador_id = $2
               AND hd.unidade_id IN (SELECT ${unidadesPermitidasSql(ator)})
            WINDOW w AS (PARTITION BY hd.periodo_inicio ORDER BY hd.dia)
         ) x
         WHERE x.dia::date > current_date - $3::int
         ORDER BY x.dia DESC`,
        [ator.id, colaboradorId, dias],
    )
    return rows
}

export async function historico(ator: Ator, colaboradorId: number, limite: number) {
    const { rows } = await db.query<SemanaHistorico>(
        `SELECT f.id AS fechamento_id, c.periodo_inicio::text, c.data_referencia::text,
                c.tipo = 'fechamento_mes' AS semana_fechamento_mes,
                json_build_object('id', un.id, 'nome', coalesce(un.nome_exibicao, un.razao_social)) AS unidade,
                r.extra_semana, r.negativa_semana, r.pagas_semana, r.banco_semana,
                r.extra_periodo, r.negativa_periodo, r.pagas_periodo, r.banco_periodo,
                r.saldo_banco_total AS saldo_total
           FROM registros_horas r
           JOIN fechamentos f ON f.id = r.fechamento_id AND f.status = 'sucesso'
           JOIN ciclos c ON c.id = f.ciclo_id
           JOIN unidades un ON un.id = f.unidade_id
          WHERE r.colaborador_id = $2
            AND f.unidade_id IN (SELECT ${unidadesPermitidasSql(ator)})
          ORDER BY c.data_referencia DESC, f.publicado_em DESC
          LIMIT $3`,
        [ator.id, colaboradorId, limite],
    )
    return rows
}
