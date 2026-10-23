import { db, type Executor } from '../db/database'
import type { RegraPagas, ValoresRegistro } from '../services/calculo-horas.service'
import type { DiaGravado, HoraDiaGravada, RegistroAoVivo, RegistroGravado } from '../services/recalculo.service'

export type PedidoRecalculo = { empresa_id: number, solicitado_em: string }

/** Marca a empresa para o worker recalcular o histórico (pedido repetido só atualiza a hora). */
export async function solicitarRecalculo(empresaId: number, ex: Executor = db) {
    await ex.query(
        `INSERT INTO recalculos_saldo (empresa_id) VALUES ($1)
         ON CONFLICT (empresa_id) DO UPDATE SET solicitado_em = now()`,
        [empresaId],
    )
}

export async function recalculoPendente(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query('SELECT 1 FROM recalculos_saldo WHERE empresa_id = $1', [empresaId])
    return rows.length > 0
}

export async function pedidosPendentes(ex: Executor = db) {
    // a hora vai como texto: com microssegundos, para o "concluir" reconhecer o mesmo pedido
    const { rows } = await ex.query<PedidoRecalculo>(
        'SELECT empresa_id, solicitado_em::text AS solicitado_em FROM recalculos_saldo ORDER BY solicitado_em',
    )
    return rows
}

/** Tira o pedido; se outro chegou durante o recálculo, ele fica para a próxima rodada. */
export async function concluirPedido(pedido: PedidoRecalculo, ex: Executor = db) {
    await ex.query('DELETE FROM recalculos_saldo WHERE empresa_id = $1 AND solicitado_em = $2::timestamptz', [
        pedido.empresa_id,
        pedido.solicitado_em,
    ])
}

export async function regraDaEmpresa(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query<{
        origem_horas_pagas: RegraPagas['origem']
        teto_horas_pagas_minutos: number
        teto_periodicidade: 'semanal' | 'mensal'
    }>(
        'SELECT origem_horas_pagas, teto_horas_pagas_minutos, teto_periodicidade FROM configuracoes WHERE empresa_id = $1',
        [empresaId],
    )
    return rows[0] ?? null
}

export async function registrosDaEmpresa(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query<RegistroGravado>(
        `SELECT r.id, r.colaborador_id, r.fechamento_id, f.status = 'sucesso' AS publicado,
                c.periodo_inicio::text AS periodo_inicio, c.data_referencia::text AS data_referencia,
                r.dados_desde::text AS dados_desde, r.dados_brutos AS dados,
                r.extra_periodo, r.negativa_periodo, r.pagas_periodo, r.banco_periodo
           FROM registros_horas r
           JOIN fechamentos f ON f.id = r.fechamento_id
           JOIN ciclos c      ON c.id = f.ciclo_id
          WHERE f.empresa_id = $1
          ORDER BY c.data_referencia, f.id`,
        [empresaId],
    )
    return rows
}

export async function aoVivoDaEmpresa(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query<RegistroAoVivo>(
        `SELECT colaborador_id, periodo_inicio::text AS periodo_inicio, dados_ate::text AS dados_ate,
                dados_desde::text AS dados_desde, dados_brutos AS dados
           FROM registros_tempo_real
          WHERE empresa_id = $1 AND extraido_em IS NOT NULL AND dados_brutos IS NOT NULL`,
        [empresaId],
    )
    return rows
}

export async function diasDaEmpresa(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query<DiaGravado>(
        `SELECT colaborador_id, dia::text AS dia, periodo_inicio::text AS periodo_inicio,
                extra_periodo, negativa_periodo, pagas_periodo, saldo_banco_total
           FROM historico_diario
          WHERE empresa_id = $1`,
        [empresaId],
    )
    return rows
}

/** Grava os valores recalculados; devolve quantos registros mudaram. Precisa estar numa transação. */
export async function gravarRegistros(lista: Array<{ id: number | string, valores: ValoresRegistro }>, ex: Executor) {
    if (lista.length === 0) return 0
    // libera o UPDATE de fechamento publicado só nesta transação (ver migration 012)
    await ex.query(`SELECT set_config('copiloto.recalculo_saldos', 'on', true)`)
    const { rowCount } = await ex.query(
        `UPDATE registros_horas r
            SET extra_periodo = v.extra_periodo, negativa_periodo = v.negativa_periodo,
                pagas_periodo = v.pagas_periodo, banco_periodo = v.banco_periodo,
                extra_semana = v.extra_semana, negativa_semana = v.negativa_semana,
                pagas_semana = v.pagas_semana, banco_semana = v.banco_semana,
                saldo_banco_total = v.saldo_banco_total, base_semana_registro_id = v.base
           FROM unnest($1::bigint[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::int[],
                       $9::int[], $10::int[], $11::bigint[])
             AS v(id, extra_periodo, negativa_periodo, pagas_periodo, banco_periodo, extra_semana, negativa_semana,
                  pagas_semana, banco_semana, saldo_banco_total, base)
          WHERE r.id = v.id
            AND (r.extra_periodo, r.negativa_periodo, r.pagas_periodo, r.banco_periodo, r.extra_semana,
                 r.negativa_semana, r.pagas_semana, r.banco_semana, r.saldo_banco_total, r.base_semana_registro_id)
                IS DISTINCT FROM
                (v.extra_periodo, v.negativa_periodo, v.pagas_periodo, v.banco_periodo, v.extra_semana,
                 v.negativa_semana, v.pagas_semana, v.banco_semana, v.saldo_banco_total, v.base)`,
        [
            lista.map(r => r.id),
            lista.map(r => r.valores.extra_periodo),
            lista.map(r => r.valores.negativa_periodo),
            lista.map(r => r.valores.pagas_periodo),
            lista.map(r => r.valores.banco_periodo),
            lista.map(r => r.valores.extra_semana),
            lista.map(r => r.valores.negativa_semana),
            lista.map(r => r.valores.pagas_semana),
            lista.map(r => r.valores.banco_semana),
            lista.map(r => r.valores.saldo_banco_total),
            lista.map(r => r.valores.base_semana_registro_id),
        ],
    )
    await ex.query(`SELECT set_config('copiloto.recalculo_saldos', 'off', true)`)
    return rowCount ?? 0
}

export async function gravarAoVivo(lista: Array<{ colaborador_id: number, valores: ValoresRegistro }>, ex: Executor = db) {
    if (lista.length === 0) return 0
    const { rowCount } = await ex.query(
        `UPDATE registros_tempo_real rt
            SET extra_periodo = v.extra_periodo, negativa_periodo = v.negativa_periodo,
                pagas_periodo = v.pagas_periodo, banco_periodo = v.banco_periodo,
                saldo_banco_total = v.saldo_banco_total, base_registro_id = v.base
           FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[], $7::bigint[])
             AS v(colaborador_id, extra_periodo, negativa_periodo, pagas_periodo, banco_periodo, saldo_banco_total, base)
          WHERE rt.colaborador_id = v.colaborador_id
            AND (rt.extra_periodo, rt.negativa_periodo, rt.pagas_periodo, rt.banco_periodo, rt.saldo_banco_total,
                 rt.base_registro_id)
                IS DISTINCT FROM
                (v.extra_periodo, v.negativa_periodo, v.pagas_periodo, v.banco_periodo, v.saldo_banco_total, v.base)`,
        [
            lista.map(r => r.colaborador_id),
            lista.map(r => r.valores.extra_periodo),
            lista.map(r => r.valores.negativa_periodo),
            lista.map(r => r.valores.pagas_periodo),
            lista.map(r => r.valores.banco_periodo),
            lista.map(r => r.valores.saldo_banco_total),
            lista.map(r => r.valores.base_semana_registro_id),
        ],
    )
    return rowCount ?? 0
}

export async function gravarDias(lista: Array<{ colaborador_id: number, dia: string, valores: ValoresRegistro }>, ex: Executor = db) {
    if (lista.length === 0) return 0
    const { rowCount } = await ex.query(
        `UPDATE historico_diario hd
            SET pagas_periodo = v.pagas_periodo, banco_periodo = v.banco_periodo, saldo_banco_total = v.saldo_banco_total
           FROM unnest($1::int[], $2::date[], $3::int[], $4::int[], $5::int[])
             AS v(colaborador_id, dia, pagas_periodo, banco_periodo, saldo_banco_total)
          WHERE hd.colaborador_id = v.colaborador_id AND hd.dia = v.dia
            AND (hd.pagas_periodo, hd.banco_periodo, hd.saldo_banco_total)
                IS DISTINCT FROM (v.pagas_periodo, v.banco_periodo, v.saldo_banco_total)`,
        [
            lista.map(d => d.colaborador_id),
            lista.map(d => d.dia),
            lista.map(d => d.valores.pagas_periodo),
            lista.map(d => d.valores.banco_periodo),
            lista.map(d => d.valores.saldo_banco_total),
        ],
    )
    return rowCount ?? 0
}

/** Dias com as colunas da FriPonto gravadas (os coletados antes da migration 014 não têm e ficam como estão). */
export async function horasDiaDaEmpresa(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query<HoraDiaGravada>(
        `SELECT colaborador_id, dia::text AS dia, colunas
           FROM horas_dia
          WHERE empresa_id = $1 AND colunas <> '{}'::jsonb`,
        [empresaId],
    )
    return rows
}

export async function gravarHorasDia(lista: Array<{ colaborador_id: number, dia: string, extra: number, negativa: number }>, ex: Executor = db) {
    if (lista.length === 0) return 0
    const { rowCount } = await ex.query(
        `UPDATE horas_dia hd
            SET extra_min = v.extra, negativa_min = v.negativa, atualizado_em = now()
           FROM unnest($1::int[], $2::date[], $3::int[], $4::int[]) AS v(colaborador_id, dia, extra, negativa)
          WHERE hd.colaborador_id = v.colaborador_id AND hd.dia = v.dia
            AND (hd.extra_min, hd.negativa_min) IS DISTINCT FROM (v.extra, v.negativa)`,
        [lista.map(d => d.colaborador_id), lista.map(d => d.dia), lista.map(d => d.extra), lista.map(d => d.negativa)],
    )
    return rowCount ?? 0
}

/** Os fechamentos já extraídos passam a registrar o teto com que foram calculados agora. */
export async function atualizarTetoAplicado(empresaId: number, regra: RegraPagas, ex: Executor = db) {
    await ex.query(
        `UPDATE fechamentos f
            SET teto_aplicado_minutos = $2, teto_periodicidade_aplicada = $3
          WHERE f.empresa_id = $1
            AND EXISTS (SELECT 1 FROM registros_horas r WHERE r.fechamento_id = f.id)
            AND (f.teto_aplicado_minutos, f.teto_periodicidade_aplicada) IS DISTINCT FROM ($2::int, $3::text)`,
        [empresaId, regra.teto_minutos, regra.periodicidade],
    )
}
