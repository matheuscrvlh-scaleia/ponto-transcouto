import { db } from '../db/database'
import type { ColaboradorAcessivel, RegistroAtual, SemanaHistorico } from '../types/colaboradores.types'

// Quem trocou de unidade continua visível para a unidade antiga (pelos fechamentos publicados dela).
export async function buscarPermitido(usuarioId: number, colaboradorId: number) {
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
                 WHERE x.unidade_id IN (SELECT unidades_permitidas($1))
                 ORDER BY x.prioridade, x.data_referencia DESC
                 LIMIT 1
           ) visivel ON true
           JOIN unidades un ON un.id = visivel.unidade_id
          WHERE col.id = $2`,
        [usuarioId, colaboradorId],
    )
    return rows[0] ?? null
}

export async function registroAtual(usuarioId: number, colaboradorId: number) {
    const { rows } = await db.query<RegistroAtual>(
        `SELECT f.id AS fechamento_id, c.data_referencia::text,
                r.extra_periodo AS extra_min, r.negativa_periodo AS negativa_min,
                r.pagas_periodo AS pagas_min, r.banco_periodo AS banco_min,
                r.saldo_banco_total AS saldo_min
           FROM registros_horas r
           JOIN fechamentos f ON f.id = r.fechamento_id AND f.status = 'sucesso'
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE r.colaborador_id = $2
            AND f.unidade_id IN (SELECT unidades_permitidas($1))
          ORDER BY c.data_referencia DESC, f.publicado_em DESC
          LIMIT 1`,
        [usuarioId, colaboradorId],
    )
    return rows[0] ?? null
}

export async function historico(usuarioId: number, colaboradorId: number, limite: number) {
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
            AND f.unidade_id IN (SELECT unidades_permitidas($1))
          ORDER BY c.data_referencia DESC, f.publicado_em DESC
          LIMIT $3`,
        [usuarioId, colaboradorId, limite],
    )
    return rows
}
