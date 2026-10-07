import { db, type Executor } from '../db/database'
import type { TotaisSecullum } from '../integrations/secullum/tipos'
import type { ValoresRegistro } from '../services/calculo-horas.service'

export type EmpresaTempoReal = {
    empresa_id: number
    fuso_horario: string
    dia_fechamento_mes: number
    cota_calcular_por_hora: number
    origem_horas_pagas: 'teto' | 'coluna_secullum'
    teto_horas_pagas_minutos: number | null
    teto_periodicidade: 'semanal' | 'mensal' | null
}

export type ColaboradorRodizio = { id: number; cpf: string; unidade_id: number }

/** Empresas em modo tempo real com integração configurada. */
export async function empresasTempoReal(ex: Executor = db) {
    const { rows } = await ex.query<EmpresaTempoReal>(
        `SELECT e.id AS empresa_id, cf.fuso_horario, cf.dia_fechamento_mes, cf.cota_calcular_por_hora,
                cf.origem_horas_pagas, cf.teto_horas_pagas_minutos, cf.teto_periodicidade
           FROM empresas e
           JOIN configuracoes cf ON cf.empresa_id = e.id
          WHERE e.ativo AND cf.modo_extracao = 'tempo_real'
            AND e.secullum_usuario IS NOT NULL AND e.secullum_senha_cripto IS NOT NULL
            AND e.secullum_banco_id IS NOT NULL
          ORDER BY e.id`,
    )
    return rows
}

/* Elegível ao vivo: mesma regra do fechamento — unidade habilitada no painel, colaborador
   ativo (ou demitido dentro do período) e admitido até hoje. */
const elegiveis = `
    SELECT col.id, col.cpf, col.unidade_id
      FROM colaboradores col
      JOIN unidades un ON un.id = col.unidade_id AND un.ativo AND un.nome_exibicao IS NOT NULL
     WHERE col.empresa_id = $1 AND col.cpf IS NOT NULL
       AND (col.ativo OR col.data_demissao >= $2::date)
       AND (col.data_admissao IS NULL OR col.data_admissao <= $3::date)`

/** Tira do tempo real quem saiu do escopo e os dados de períodos anteriores (virada do mês). */
export async function limparForaDoEscopo(empresaId: number, periodoInicio: string, hoje: string, ex: Executor = db) {
    const { rowCount } = await ex.query(
        `DELETE FROM registros_tempo_real rt
          WHERE rt.empresa_id = $1
            AND (rt.periodo_inicio <> $2::date OR rt.colaborador_id NOT IN (SELECT id FROM (${elegiveis}) e))`,
        [empresaId, periodoInicio, hoje],
    )
    return rowCount ?? 0
}

/** Próximos do rodízio: nunca tentados primeiro, depois os tentados há mais tempo. */
export async function proximosDoRodizio(
    empresaId: number,
    periodoInicio: string,
    hoje: string,
    intervaloMinimoMin: number,
    limite: number,
    ex: Executor = db,
) {
    const { rows } = await ex.query<ColaboradorRodizio>(
        `SELECT e.id, e.cpf, e.unidade_id
           FROM (${elegiveis}) e
           LEFT JOIN registros_tempo_real rt ON rt.colaborador_id = e.id
          WHERE rt.tentado_em IS NULL OR rt.tentado_em < now() - make_interval(mins => $4)
          ORDER BY rt.tentado_em NULLS FIRST, e.id
          LIMIT $5`,
        [empresaId, periodoInicio, hoje, intervaloMinimoMin, limite],
    )
    return rows
}

/** Fechamento esperando na fila (atrasado ou aguardando cota): ele tem prioridade sobre o tempo real. */
export async function temFechamentoNaFila(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query(
        `SELECT 1
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE f.empresa_id = $1 AND c.gatilho_em <= now() AND f.status IN ('pendente', 'processando')
          LIMIT 1`,
        [empresaId],
    )
    return rows.length > 0
}

export async function reservarChamadaTempoReal(empresaId: number, rota: string, ex: Executor) {
    const { rows } = await ex.query<{ id: string }>(
        'INSERT INTO chamadas_api (empresa_id, execucao_id, rota) VALUES ($1, NULL, $2) RETURNING id',
        [empresaId, rota],
    )
    return rows[0].id
}

type Alvo = { colaboradorId: number; empresaId: number; unidadeId: number; periodoInicio: string; hoje: string }

export async function gravar(alvo: Alvo, valores: ValoresRegistro, dados: TotaisSecullum, ex: Executor = db) {
    await ex.query(
        `INSERT INTO registros_tempo_real
                (colaborador_id, empresa_id, unidade_id, periodo_inicio, dados_ate,
                 extra_periodo, negativa_periodo, pagas_periodo, banco_periodo, saldo_banco_total,
                 base_registro_id, dados_brutos, tentado_em, extraido_em, ultimo_erro, ultimo_erro_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now(), NULL, NULL)
         ON CONFLICT (colaborador_id) DO UPDATE
            SET empresa_id = EXCLUDED.empresa_id, unidade_id = EXCLUDED.unidade_id,
                periodo_inicio = EXCLUDED.periodo_inicio, dados_ate = EXCLUDED.dados_ate,
                extra_periodo = EXCLUDED.extra_periodo, negativa_periodo = EXCLUDED.negativa_periodo,
                pagas_periodo = EXCLUDED.pagas_periodo, banco_periodo = EXCLUDED.banco_periodo,
                saldo_banco_total = EXCLUDED.saldo_banco_total, base_registro_id = EXCLUDED.base_registro_id,
                dados_brutos = EXCLUDED.dados_brutos, tentado_em = now(), extraido_em = now(),
                ultimo_erro = NULL, ultimo_erro_em = NULL`,
        [
            alvo.colaboradorId,
            alvo.empresaId,
            alvo.unidadeId,
            alvo.periodoInicio,
            alvo.hoje,
            valores.extra_periodo,
            valores.negativa_periodo,
            valores.pagas_periodo,
            valores.banco_periodo,
            valores.saldo_banco_total,
            valores.base_semana_registro_id,
            // as linhas por dia ficam em horas_dia
            { colunas: dados.colunas, totais: dados.totais },
        ],
    )
    // histórico diário: a última atualização do dia é o valor do dia
    await ex.query(
        `INSERT INTO historico_diario
                (colaborador_id, dia, empresa_id, unidade_id, periodo_inicio, extra_periodo, negativa_periodo,
                 pagas_periodo, banco_periodo, saldo_banco_total, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (colaborador_id, dia) DO UPDATE
            SET empresa_id = EXCLUDED.empresa_id, unidade_id = EXCLUDED.unidade_id,
                periodo_inicio = EXCLUDED.periodo_inicio, extra_periodo = EXCLUDED.extra_periodo,
                negativa_periodo = EXCLUDED.negativa_periodo, pagas_periodo = EXCLUDED.pagas_periodo,
                banco_periodo = EXCLUDED.banco_periodo, saldo_banco_total = EXCLUDED.saldo_banco_total,
                atualizado_em = now()`,
        [
            alvo.colaboradorId,
            alvo.hoje,
            alvo.empresaId,
            alvo.unidadeId,
            alvo.periodoInicio,
            valores.extra_periodo,
            valores.negativa_periodo,
            valores.pagas_periodo,
            valores.banco_periodo,
            valores.saldo_banco_total,
        ],
    )
}

/** Falha não apaga o último valor bom; só marca a tentativa (o rodízio segue para os próximos). */
export async function registrarFalha(alvo: Alvo, mensagem: string, ex: Executor = db) {
    await ex.query(
        `INSERT INTO registros_tempo_real
                (colaborador_id, empresa_id, unidade_id, periodo_inicio, dados_ate, tentado_em, ultimo_erro, ultimo_erro_em)
         VALUES ($1, $2, $3, $4, $5, now(), $6, now())
         ON CONFLICT (colaborador_id) DO UPDATE
            SET tentado_em = now(), ultimo_erro = EXCLUDED.ultimo_erro, ultimo_erro_em = now()`,
        [alvo.colaboradorId, alvo.empresaId, alvo.unidadeId, alvo.periodoInicio, alvo.hoje, mensagem.slice(0, 500)],
    )
}

/** Resumo para a tela de Integração. */
export async function resumoEmpresa(empresaId: number, unidadeIds: number[]) {
    const { rows } = await db.query<{
        colaboradores: number
        atualizados_ultima_hora: number
        mais_antigo_em: Date | null
        mais_recente_em: Date | null
    }>(
        `SELECT count(*) FILTER (WHERE extraido_em IS NOT NULL)::int AS colaboradores,
                count(*) FILTER (WHERE extraido_em > now() - interval '1 hour')::int AS atualizados_ultima_hora,
                min(extraido_em) AS mais_antigo_em, max(extraido_em) AS mais_recente_em
           FROM registros_tempo_real
          WHERE empresa_id = $1 AND unidade_id = ANY($2::int[])`,
        [empresaId, unidadeIds],
    )
    return rows[0]
}

/**
 * "Atualizar agora": quem já tem valor ao vivo volta para o começo da fila (quem nunca foi
 * consultado já está lá). Devolve quantos colaboradores do escopo entram no rodízio.
 */
export async function priorizar(empresaId: number, unidadeIds: number[], periodoInicio: string, hoje: string, ex: Executor = db) {
    await ex.query(
        `UPDATE registros_tempo_real SET tentado_em = timestamptz '2000-01-01'
          WHERE empresa_id = $1 AND unidade_id = ANY($2::int[])`,
        [empresaId, unidadeIds],
    )
    const { rows } = await ex.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM (${elegiveis}) e WHERE e.unidade_id = ANY($4::int[])`,
        [empresaId, periodoInicio, hoje, unidadeIds],
    )
    return rows[0].total
}

/** Colaboradores que entram no rodízio (para estimar quanto tempo leva uma volta completa). */
export async function contarElegiveis(empresaId: number, periodoInicio: string, hoje: string) {
    const { rows } = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM (${elegiveis}) e`, [
        empresaId,
        periodoInicio,
        hoje,
    ])
    return rows[0].total
}
