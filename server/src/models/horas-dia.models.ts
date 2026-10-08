import { db, type Executor } from '../db/database'
import type { HorasDoDia } from '../services/horas-dia.service'
import type { DiaColaborador, TotalNoIntervalo } from '../types/horas-dia.types'

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
        `INSERT INTO horas_dia (colaborador_id, dia, empresa_id, unidade_id, extra_min, negativa_min, marcacoes)
         SELECT $1, d.dia, $4, $5, d.extra, d.negativa, d.marcacoes
           FROM jsonb_to_recordset($6::jsonb) AS d(dia date, extra int, negativa int, marcacoes text[])
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
