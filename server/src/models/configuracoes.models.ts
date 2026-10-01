import { db, type Executor } from '../db/database'
import type { Ator } from '../types/auth.types'
import type { Limites } from '../services/dashboard.service'
import type { AtualizarConfiguracoesBody, CicloCalendario, Configuracoes } from '../types/configuracoes.types'

const selecao = `
    SELECT c.empresa_id, c.dia_semana_extracao, to_char(c.hora_extracao, 'HH24:MI') AS hora_extracao,
           c.dia_fechamento_mes, c.dias_apos_fechamento_mes, c.origem_horas_pagas,
           c.teto_horas_pagas_minutos, c.teto_periodicidade,
           c.alerta_saldo_positivo_minutos, c.alerta_saldo_negativo_minutos,
           c.fuso_horario, c.cota_calcular_por_hora, c.atualizado_em,
           CASE WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'nome', u.nome)
                WHEN cl.id IS NOT NULL THEN json_build_object('id', cl.id, 'nome', cl.nome) END AS atualizado_por
      FROM configuracoes c
      LEFT JOIN usuarios u ON u.id = c.atualizado_por
      LEFT JOIN clientes cl ON cl.id = c.atualizado_por_cliente`

export async function buscar(empresaId: number, executor: Executor = db) {
    const { rows } = await executor.query<Configuracoes>(`${selecao} WHERE c.empresa_id = $1`, [empresaId])
    return rows[0] ?? null
}

export async function atualizar(
    empresaId: number,
    campos: AtualizarConfiguracoesBody,
    ator: Ator,
    executor: Executor = db,
) {
    const chaves = Object.keys(campos) as (keyof AtualizarConfiguracoesBody)[]
    const sets = chaves.map((chave, i) => `${chave} = $${i + 4}`)
    // autoria: equipe em atualizado_por, cliente em atualizado_por_cliente
    const autoria = ['atualizado_por = $2', 'atualizado_por_cliente = $3']
    await executor.query(
        `UPDATE configuracoes SET ${[...sets, ...autoria].join(', ')} WHERE empresa_id = $1`,
        [
            empresaId,
            ator.tipo === 'equipe' ? ator.id : null,
            ator.tipo === 'cliente' ? ator.id : null,
            ...chaves.map(c => campos[c]),
        ],
    )
    return buscar(empresaId, executor)
}

export async function criarPadrao(empresaId: number, executor: Executor = db) {
    await executor.query('INSERT INTO configuracoes (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING', [
        empresaId,
    ])
}

export async function ciclosFuturos(empresaId: number, ate: Date) {
    const { rows } = await db.query<CicloCalendario>(
        `SELECT c.id AS ciclo_id, c.tipo, c.periodo_inicio::text, c.data_referencia::text,
                c.gatilho_em, c.gatilho_previsto_em,
                c.tipo = 'fechamento_mes' AS semana_fechamento_mes,
                c.gatilho_em <> c.gatilho_previsto_em AS ajustado
           FROM ciclos c
          WHERE c.empresa_id = $1
            AND c.gatilho_em <= $2
            AND (c.gatilho_em >= now()
                 OR EXISTS (SELECT 1 FROM fechamentos f
                             WHERE f.ciclo_id = c.id AND f.status IN ('pendente', 'processando')))
          ORDER BY c.gatilho_em`,
        [empresaId, ate],
    )
    return rows
}

export async function limitesDaEmpresa(empresaId: number) {
    const { rows } = await db.query<Limites>(
        `SELECT alerta_saldo_positivo_minutos AS alerta_pos, alerta_saldo_negativo_minutos AS alerta_neg
           FROM configuracoes WHERE empresa_id = $1`,
        [empresaId],
    )
    return rows[0] ?? null
}

// Ciclos futuros ainda não iniciados são recriados pela régua do worker com a configuração nova.
export async function descartarCiclosNaoIniciados(empresaId: number, executor: Executor) {
    const { rows } = await executor.query<{ id: number }>(
        `SELECT c.id FROM ciclos c
          WHERE c.empresa_id = $1 AND c.gatilho_em > now()
            AND NOT EXISTS (SELECT 1 FROM fechamentos f
                             WHERE f.ciclo_id = c.id AND (f.status NOT IN ('pendente', 'cancelado') OR f.tentativas > 0))`,
        [empresaId],
    )
    const ids = rows.map(r => r.id)
    if (ids.length === 0) return 0
    await executor.query('DELETE FROM fechamentos WHERE ciclo_id = ANY($1::int[])', [ids])
    await executor.query('DELETE FROM ciclos WHERE id = ANY($1::int[])', [ids])
    return ids.length
}
