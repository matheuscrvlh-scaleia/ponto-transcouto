import { db, type Executor } from '../db/database'
import { unidadesPermitidasSql } from '../db/escopo'
import type { HorasDoDia } from '../services/horas-dia.service'
import type { Ator } from '../types/auth.types'
import type { DiaColaborador, DiaDetalhado, TotalNoIntervalo } from '../types/horas-dia.types'

type AlvoDias = { colaboradorId: number; empresaId: number; unidadeId: number; de: string; ate: string }

/** Regrava os dias do período que a coleta puxou (correções do RH em dias já gravados substituem o valor antigo). */
export async function gravarDias(alvo: AlvoDias, dias: HorasDoDia[], ex: Executor = db) {
    if (dias.length === 0) return
    await ex.query('DELETE FROM horas_dia WHERE colaborador_id = $1 AND dia BETWEEN $2 AND $3', [
        alvo.colaboradorId,
        alvo.de,
        alvo.ate,
    ])
    await ex.query(
        `INSERT INTO horas_dia (colaborador_id, dia, empresa_id, unidade_id, extra_min, negativa_min, marcacoes, colunas)
         SELECT $1, d.dia, $4, $5, d.extra, d.negativa, d.marcacoes, coalesce(d.colunas, '{}')
           FROM jsonb_to_recordset($6::jsonb) AS d(dia date, extra int, negativa int, marcacoes text[], colunas jsonb)
          WHERE d.dia BETWEEN $2 AND $3`,
        [alvo.colaboradorId, alvo.de, alvo.ate, alvo.empresaId, alvo.unidadeId, JSON.stringify(dias)],
    )
}

// passou do limite diário da empresa (0 = sem alerta)
const acimaExtra = 'cf.alerta_extra_dia_minutos > 0 AND hd.extra_min > cf.alerta_extra_dia_minutos'
const acimaNegativa = 'cf.alerta_negativa_dia_minutos > 0 AND hd.negativa_min > cf.alerta_negativa_dia_minutos'

/** Soma por colaborador dos dias no intervalo, nas unidades dadas, e quantos dias passaram do limite diário. */
export async function totaisNoIntervalo(unidadeIds: number[], de: string, ate: string) {
    const { rows } = await db.query<TotalNoIntervalo>(
        `SELECT hd.colaborador_id AS id,
                sum(hd.extra_min)::int AS extra_min,
                sum(hd.negativa_min)::int AS negativa_min,
                count(*) FILTER (WHERE ${acimaExtra})::int AS dias_extra_acima,
                count(*) FILTER (WHERE ${acimaNegativa})::int AS dias_negativa_acima
           FROM horas_dia hd
           JOIN configuracoes cf ON cf.empresa_id = hd.empresa_id
          WHERE hd.unidade_id = ANY($1::int[]) AND hd.dia BETWEEN $2 AND $3
          GROUP BY hd.colaborador_id`,
        [unidadeIds, de, ate],
    )
    return rows
}

/** Último dia com horas gravadas nas unidades (até `ate`): mostra até onde o intervalo tem dados. */
export async function ultimoDiaComDados(unidadeIds: number[], ate: string) {
    const { rows } = await db.query<{ dia: string | null }>(
        'SELECT max(dia)::text AS dia FROM horas_dia WHERE unidade_id = ANY($1::int[]) AND dia <= $2',
        [unidadeIds, ate],
    )
    return rows[0]?.dia ?? null
}

/** Dias do colaborador no intervalo, do mais antigo para o mais recente, com a marca de limite diário. */
export async function diasDoColaborador(colaboradorId: number, de: string, ate: string) {
    const { rows } = await db.query<DiaColaborador>(
        `SELECT hd.dia::text AS dia, hd.extra_min, hd.negativa_min, hd.marcacoes,
                (${acimaExtra}) AS extra_acima, (${acimaNegativa}) AS negativa_acima
           FROM horas_dia hd
           JOIN configuracoes cf ON cf.empresa_id = hd.empresa_id
          WHERE hd.colaborador_id = $1 AND hd.dia BETWEEN $2 AND $3
          ORDER BY hd.dia`,
        [colaboradorId, de, ate],
    )
    return rows
}

/**
 * Dias do colaborador no intervalo para a tela de detalhe: as horas calculadas (mesma tabela e mesmos limites de
 * diasDoColaborador) e as batidas do log, ambas só das unidades que o ator pode ver. Um dia com batidas e sem horas
 * calculadas ainda aparece (tem_calculo = false). `$5` é a empresa, de onde vêm os limites diários.
 */
export async function diasDetalhados(ator: Ator, colaboradorId: number, empresaId: number, de: string, ate: string) {
    const permitidas = `unidade_id IN (SELECT ${unidadesPermitidasSql(ator)})`
    const { rows } = await db.query<DiaDetalhado>(
        `WITH calc AS (
            SELECT hd.dia, hd.extra_min, hd.negativa_min, hd.marcacoes, hd.colunas
              FROM horas_dia hd
             WHERE hd.colaborador_id = $2 AND hd.dia BETWEEN $3 AND $4 AND hd.${permitidas}
         ), marc AS (
            SELECT b.data AS dia,
                   json_agg(json_build_object(
                       'hora', to_char(b.hora, 'HH24:MI'), 'tipo', b.tipo, 'origem', b.origem,
                       'equipamento_id', b.equipamento_id,
                       'incluida_em', to_char(b.incluida_em, 'YYYY-MM-DD"T"HH24:MI:SS')
                   ) ORDER BY b.hora, b.fonte_dados_id) AS batidas
              FROM batidas b
             WHERE b.colaborador_id = $2 AND b.data BETWEEN $3 AND $4 AND b.${permitidas}
             GROUP BY b.data
         )
         SELECT d.dia::text AS dia, (c.dia IS NOT NULL) AS tem_calculo,
                coalesce(c.extra_min, 0) AS extra_min, coalesce(c.negativa_min, 0) AS negativa_min,
                coalesce(c.marcacoes, '{}') AS marcacoes, coalesce(c.colunas, '{}'::jsonb) AS colunas,
                coalesce(cf.alerta_extra_dia_minutos > 0 AND c.extra_min > cf.alerta_extra_dia_minutos, false) AS extra_acima,
                coalesce(cf.alerta_negativa_dia_minutos > 0 AND c.negativa_min > cf.alerta_negativa_dia_minutos, false) AS negativa_acima,
                coalesce(m.batidas, '[]'::json) AS batidas
           FROM (SELECT dia FROM calc UNION SELECT dia FROM marc) d
           LEFT JOIN calc c ON c.dia = d.dia
           LEFT JOIN marc m ON m.dia = d.dia
           LEFT JOIN configuracoes cf ON cf.empresa_id = $5
          ORDER BY d.dia`,
        [ator.id, colaboradorId, de, ate, empresaId],
    )
    return rows
}
