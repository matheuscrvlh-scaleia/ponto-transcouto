import { db, type Executor } from '../db/database'
import { unidadesPermitidasSql } from '../db/escopo'
import type { Ator } from '../types/auth.types'
import { SQL_ELEGIVEL, SQL_FEITO } from './extracao.models'
import { comCredenciais } from './sincronizacao.models'
import type {
    CicloExistente,
    ExecucaoIntegracao,
    FechamentoPlano,
    FechamentoProgresso,
    RegistroHistorico,
    UnidadeEscopo,
} from '../types/integracao.types'

/** Ações de auditoria que aparecem no histórico da Integração. */
export const ACOES_INTEGRACAO = [
    'sincronizacao.solicitada',
    'integracao.dados_solicitados',
    'fechamento.reprocessado',
    'fechamento.publicado_forcado',
    'ciclo.gatilho_ajustado',
    'integracao.tempo_real_forcado',
    'integracao.sincronizacao_forcada',
]

/** Unidades da empresa que o ator pode ver/puxar (gestor: só as vinculadas). */
export async function unidadesDoEscopo(ator: Ator, empresaId: number) {
    const { rows } = await db.query<UnidadeEscopo>(
        `SELECT un.id, un.nome_exibicao AS nome
           FROM unidades un
          WHERE un.empresa_id = $2 AND un.ativo AND un.nome_exibicao IS NOT NULL
            AND un.id IN (SELECT ${unidadesPermitidasSql(ator)})
          ORDER BY un.nome_exibicao`,
        [ator.id, empresaId],
    )
    return rows
}

/** Ids das unidades da empresa que o usuário vê (com ou sem nome de exibição). */
export async function idsUnidadesPermitidas(ator: Ator, empresaId: number) {
    const { rows } = await db.query<{ id: number }>(
        `SELECT un.id FROM unidades un
          WHERE un.empresa_id = $2 AND un.id IN (SELECT ${unidadesPermitidasSql(ator)})`,
        [ator.id, empresaId],
    )
    return rows.map(r => r.id)
}

export async function empresa(empresaId: number) {
    const { rows } = await db.query<{
        id: number
        nome: string
        credenciais_configuradas: boolean
        sincronizado_em: Date | null
        sincronizacao_solicitada_em: Date | null
        sincronizacao_pendente: boolean
    }>(
        `SELECT id, nome,
                (secullum_usuario IS NOT NULL AND secullum_senha_cripto IS NOT NULL
                 AND secullum_banco_id IS NOT NULL) AS credenciais_configuradas,
                sincronizado_em, sincronizacao_solicitada_em,
                (sincronizacao_solicitada_em IS NOT NULL
                 AND (sincronizado_em IS NULL OR sincronizacao_solicitada_em > sincronizado_em)) AS sincronizacao_pendente
           FROM empresas
          WHERE id = $1`,
        [empresaId],
    )
    return rows[0] ?? null
}

export async function worker() {
    const { rows } = await db.query<{ visto_em: Date; status: string | null; online: boolean }>(
        `SELECT visto_em, info->>'status' AS status, visto_em > now() - interval '3 minutes' AS online
           FROM worker_status
          WHERE nome = 'worker'`,
    )
    return rows[0] ?? null
}

/** Fila de extração das unidades do escopo (só semanas cujo agendamento já chegou). */
export async function fila(empresaId: number, unidadeIds: number[]) {
    const { rows } = await db.query<{ pendentes: number; processando: number; falhas: number }>(
        `SELECT count(*) FILTER (WHERE f.status = 'pendente')::int AS pendentes,
                count(*) FILTER (WHERE f.status = 'processando')::int AS processando,
                count(*) FILTER (WHERE f.status = 'falhou' AND c.data_referencia >= current_date - 60)::int AS falhas
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE f.empresa_id = $1 AND f.unidade_id = ANY($2::int[]) AND c.gatilho_em <= now()`,
        [empresaId, unidadeIds],
    )
    return rows[0]
}

/**
 * Fechamentos dos ciclos que ainda têm extração na fila (o lote em andamento), com quantos colaboradores
 * entram e quantos já estão resolvidos. Os já publicados do mesmo ciclo vêm junto, para o total não encolher.
 */
export async function progressoFila(empresaId: number, unidadeIds: number[]) {
    const { rows } = await db.query<FechamentoProgresso>(
        `SELECT f.id, f.status, f.tentativas, f.proxima_tentativa_em,
                c.tipo, c.periodo_inicio::text AS periodo_inicio, c.data_referencia::text AS data_referencia,
                coalesce(u.nome_exibicao, u.razao_social) AS unidade,
                count(col.id)::int AS total,
                count(col.id) FILTER (WHERE ${SQL_FEITO})::int AS feitos
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
           JOIN unidades u ON u.id = f.unidade_id
           LEFT JOIN colaboradores col ON col.unidade_id = f.unidade_id AND ${SQL_ELEGIVEL}
          WHERE f.empresa_id = $1 AND f.unidade_id = ANY($2::int[]) AND f.status <> 'cancelado'
            AND f.ciclo_id IN (SELECT f2.ciclo_id FROM fechamentos f2
                                 JOIN ciclos c2 ON c2.id = f2.ciclo_id
                                WHERE f2.empresa_id = $1 AND f2.unidade_id = ANY($2::int[])
                                  AND f2.status IN ('pendente', 'processando') AND c2.gatilho_em <= now())
          GROUP BY f.id, c.id, u.id
          ORDER BY c.gatilho_em, f.id`,
        [empresaId, unidadeIds],
    )
    return rows
}

/** Horário das chamadas de cálculo da última hora (mais antiga primeiro): cada uma libera a cota 1 h depois. */
export async function chamadasCalculoUltimaHora(empresaId: number) {
    const { rows } = await db.query<{ feita_em: Date }>(
        `SELECT feita_em FROM chamadas_api
          WHERE empresa_id = $1 AND rota ILIKE 'calcular%' AND feita_em > now() - interval '1 hour'
          ORDER BY feita_em`,
        [empresaId],
    )
    return rows.map(r => r.feita_em)
}

/** Ciclos da empresa com data de referência no período (qualquer agendamento). */
export async function ciclosNoPeriodo(empresaId: number, inicio: string, fim: string, ex: Executor = db) {
    const { rows } = await ex.query<CicloExistente>(
        `SELECT id, tipo, periodo_inicio::text AS periodo_inicio, data_referencia::text AS data_referencia, gatilho_em
           FROM ciclos
          WHERE empresa_id = $1 AND data_referencia BETWEEN $2 AND $3
          ORDER BY data_referencia`,
        [empresaId, inicio, fim],
    )
    return rows
}

const colunasPlano = `f.id, f.unidade_id, f.status, c.id AS ciclo_id, c.tipo,
                      c.periodo_inicio::text AS periodo_inicio, c.data_referencia::text AS data_referencia`

export async function fechamentosDosCiclos(cicloIds: number[], unidadeIds: number[], ex: Executor = db) {
    const { rows } = await ex.query<FechamentoPlano>(
        `SELECT ${colunasPlano}
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE f.ciclo_id = ANY($1::int[]) AND f.unidade_id = ANY($2::int[])`,
        [cicloIds, unidadeIds],
    )
    return rows
}

/** Último dia de mês fechado com fechamento do mês publicado nas unidades (null = nenhum). */
export async function ultimoMesFechado(empresaId: number, unidadeIds: number[], ex: Executor = db) {
    const { rows } = await ex.query<{ ate: string | null }>(
        `SELECT max(c.data_referencia)::text AS ate
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE f.empresa_id = $1 AND f.unidade_id = ANY($2::int[])
            AND c.tipo = 'fechamento_mes' AND f.status = 'sucesso'`,
        [empresaId, unidadeIds],
    )
    return rows[0].ate
}

/** Semanas depois do período já extraídas (publicadas ou com falha): dependem das anteriores e são refeitas junto. */
export async function fechamentosPosteriores(empresaId: number, unidadeIds: number[], fim: string, ex: Executor = db) {
    const { rows } = await ex.query<FechamentoPlano>(
        `SELECT ${colunasPlano}
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
          WHERE f.empresa_id = $1 AND f.unidade_id = ANY($2::int[])
            AND c.data_referencia > $3 AND c.gatilho_em <= now()
            AND f.status IN ('sucesso', 'falhou', 'processando')
          ORDER BY c.data_referencia`,
        [empresaId, unidadeIds, fim],
    )
    return rows
}

export async function colaboradoresPorUnidade(unidadeIds: number[], ex: Executor = db) {
    const { rows } = await ex.query<{ unidade_id: number; total: number }>(
        `SELECT unidade_id, count(*)::int AS total
           FROM colaboradores
          WHERE unidade_id = ANY($1::int[]) AND ativo
          GROUP BY unidade_id`,
        [unidadeIds],
    )
    return new Map(rows.map(r => [r.unidade_id, r.total]))
}

export async function idDoCiclo(empresaId: number, dataReferencia: string, ex: Executor) {
    const { rows } = await ex.query<{ id: number }>(
        'SELECT id FROM ciclos WHERE empresa_id = $1 AND data_referencia = $2',
        [empresaId, dataReferencia],
    )
    return rows[0]?.id ?? null
}

/** Cria (pendentes, com o solicitante) os fechamentos que faltam no ciclo para as unidades pedidas. */
export async function criarFechamentosPedidos(
    cicloId: number,
    empresaId: number,
    unidadeIds: number[],
    solicitante: Ator,
    ex: Executor,
) {
    const { rowCount } = await ex.query(
        `INSERT INTO fechamentos (ciclo_id, empresa_id, unidade_id, solicitado_por_usuario, solicitado_por_cliente)
         SELECT $1, $2, un.id, $4, $5
           FROM unidades un
          WHERE un.id = ANY($3::int[]) AND un.empresa_id = $2
         ON CONFLICT (ciclo_id, unidade_id) DO NOTHING`,
        [
            cicloId,
            empresaId,
            unidadeIds,
            solicitante.tipo === 'equipe' ? solicitante.id : null,
            solicitante.tipo === 'cliente' ? solicitante.id : null,
        ],
    )
    return rowCount ?? 0
}

export async function solicitarSincronizacao(empresaId: number, ex: Executor = db) {
    const { rows } = await ex.query<{ sincronizacao_solicitada_em: Date }>(
        `UPDATE empresas SET sincronizacao_solicitada_em = now()
          WHERE id = $1 AND ativo
      RETURNING sincronizacao_solicitada_em`,
        [empresaId],
    )
    return rows[0]?.sincronizacao_solicitada_em ?? null
}

const atorSql = (usuario: string, cliente: string) => `
    CASE WHEN ${usuario}.id IS NOT NULL THEN json_build_object('tipo', 'equipe', 'nome', ${usuario}.nome)
         WHEN ${cliente}.id IS NOT NULL THEN json_build_object('tipo', 'cliente', 'nome', ${cliente}.nome) END`

export async function execucoes(empresaId: number, unidadeIds: number[], pagina: number, porPagina: number) {
    const { rows } = await db.query<ExecucaoIntegracao & { total: number }>(
        `SELECT x.id, x.fechamento_id,
                json_build_object('id', un.id, 'nome', coalesce(un.nome_exibicao, un.razao_social)) AS unidade,
                c.data_referencia::text AS data_referencia,
                x.status, x.disparo, ${atorSql('ud', 'cd')} AS disparado_por,
                x.processados, x.total_colaboradores, x.com_erro, x.iniciado_em, x.finalizado_em, x.mensagem_erro,
                count(*) OVER ()::int AS total
           FROM execucoes_extracao x
           JOIN fechamentos f ON f.id = x.fechamento_id
           JOIN ciclos c      ON c.id = f.ciclo_id
           JOIN unidades un   ON un.id = f.unidade_id
           LEFT JOIN usuarios ud ON ud.id = x.disparado_por
           LEFT JOIN clientes cd ON cd.id = x.disparado_por_cliente
          WHERE f.empresa_id = $1 AND f.unidade_id = ANY($2::int[])
          ORDER BY x.iniciado_em DESC, x.id DESC
          LIMIT $3 OFFSET $4`,
        [empresaId, unidadeIds, porPagina, (pagina - 1) * porPagina],
    )
    return { itens: rows.map(({ total: _t, ...x }) => x), total: rows[0]?.total ?? 0 }
}

/** Quando a sincronização pedida ainda não rodou: a data do pedido; senão null. */
export async function sincronizacaoPendente(empresaId: number) {
    const { rows } = await db.query<{ sincronizacao_solicitada_em: Date }>(
        `SELECT sincronizacao_solicitada_em FROM empresas
          WHERE id = $1 AND sincronizacao_solicitada_em IS NOT NULL
            AND (sincronizado_em IS NULL OR sincronizacao_solicitada_em > sincronizado_em)`,
        [empresaId],
    )
    return rows[0]?.sincronizacao_solicitada_em ?? null
}

export async function historico(
    empresaId: number,
    pagina: number,
    porPagina: number,
    gestor: { clienteId: number; unidadeIds: number[] } | null = null,
) {
    const { rows } = await db.query<RegistroHistorico & { total: number }>(
        `SELECT a.id, a.criado_em, a.acao, a.dados, ${atorSql('u', 'cl')} AS ator,
                coalesce(un.nome_exibicao, un.razao_social) AS unidade_nome,
                c.data_referencia::text AS data_referencia,
                count(*) OVER ()::int AS total
           FROM log_auditoria a
           LEFT JOIN usuarios u  ON u.id = a.usuario_id
           LEFT JOIN clientes cl ON cl.id = a.cliente_id
           LEFT JOIN fechamentos f ON a.entidade = 'fechamentos' AND f.id::text = a.entidade_id
           LEFT JOIN ciclos c ON c.id = CASE WHEN a.entidade = 'ciclos' THEN a.entidade_id::int ELSE f.ciclo_id END
           LEFT JOIN unidades un ON un.id = f.unidade_id
          WHERE a.empresa_id = $1 AND a.acao = ANY($2::text[])
            AND ($5::int[] IS NULL
                 OR a.cliente_id = $6
                 OR f.unidade_id = ANY($5)
                 -- pedido de dados: só se todas as unidades do pedido forem do gestor
                 OR (jsonb_typeof(a.dados->'unidade_ids') = 'array'
                     AND jsonb_array_length(a.dados->'unidade_ids') > 0
                     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.dados->'unidade_ids') u
                                      WHERE u.value::int <> ALL($5))))
          ORDER BY a.criado_em DESC, a.id DESC
          LIMIT $3 OFFSET $4`,
        [empresaId, ACOES_INTEGRACAO, porPagina, (pagina - 1) * porPagina, gestor?.unidadeIds ?? null, gestor?.clienteId ?? null],
    )
    return { itens: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 }
}

/* ---------- Atividade (indicador de sincronização e alertas de erro do app) ---------- */

/** "Forçar sincronização" marca as tarefas com este instante: ainda não atendidas pelo worker. */
const FORCADO = `timestamptz '2000-01-01'`

/**
 * Empresas visíveis ao ator (uma, ou todas para a equipe sem empresa escolhida); $1 = ator, $2 = empresa.
 * Só as que têm credenciais: sem elas o worker não atende nada e o pedido ficaria "sincronizando" para sempre.
 */
const empresasVisiveis = (ator: Ator) => `
    SELECT e.id, e.nome, e.sincronizado_em, e.sincronizacao_solicitada_em
      FROM empresas e
     WHERE ${comCredenciais} AND ($2::int IS NULL OR e.id = $2)
       AND e.id IN (SELECT un.empresa_id FROM unidades un WHERE un.id IN (SELECT ${unidadesPermitidasSql(ator)}))`

/** O que está sendo puxado da FriPonto agora (pedidos e fila), sem contar o rodízio contínuo do tempo real. */
export async function atividade(ator: Ator, empresaId: number | null) {
    const permitidas = `SELECT ${unidadesPermitidasSql(ator)}`
    const { rows } = await db.query<{
        cadastros: number
        fechamentos: number
        tempo_real: number
        batidas: number
        retoma_em: Date | null
    }>(
        `WITH emp AS (${empresasVisiveis(ator)})
         SELECT (SELECT count(*) FROM emp
                  WHERE emp.sincronizacao_solicitada_em IS NOT NULL
                    AND (emp.sincronizado_em IS NULL OR emp.sincronizacao_solicitada_em > emp.sincronizado_em))::int AS cadastros,
                (SELECT count(*) FROM fechamentos f JOIN ciclos c ON c.id = f.ciclo_id
                  WHERE f.empresa_id IN (SELECT id FROM emp) AND f.unidade_id IN (${permitidas})
                    AND c.gatilho_em <= now()
                    AND (f.status = 'processando'
                         -- pendente esperando nova tentativa daqui a muito tempo não é "sincronizando agora"
                         OR (f.status = 'pendente'
                             AND (f.proxima_tentativa_em IS NULL OR f.proxima_tentativa_em <= now() + interval '5 minutes'))))::int AS fechamentos,
                -- só empresa ainda em tempo real: ao voltar para o semanal o worker larga o rodízio e
                -- um "Atualizar agora" pendente ficaria marcado (e "sincronizando") para sempre
                (SELECT count(*) FROM registros_tempo_real rt
                   JOIN configuracoes cf ON cf.empresa_id = rt.empresa_id AND cf.modo_extracao = 'tempo_real'
                  WHERE rt.empresa_id IN (SELECT id FROM emp) AND rt.unidade_id IN (${permitidas})
                    AND rt.tentado_em = ${FORCADO})::int AS tempo_real,
                (SELECT count(*) FROM batidas_importacao bi
                  WHERE bi.empresa_id IN (SELECT id FROM emp) AND bi.tentado_em = ${FORCADO})::int AS batidas,
                -- extração parada esperando a cota da FriPonto (ou nova tentativa): quando volta
                (SELECT min(f.proxima_tentativa_em) FROM fechamentos f JOIN ciclos c ON c.id = f.ciclo_id
                  WHERE f.empresa_id IN (SELECT id FROM emp) AND f.unidade_id IN (${permitidas})
                    AND c.gatilho_em <= now() AND f.status = 'pendente'
                    AND f.proxima_tentativa_em > now() + interval '5 minutes') AS retoma_em`,
        [ator.id, empresaId],
    )
    return rows[0]
}

export type ErroRecente = { chave: string; origem: string; empresa: string; mensagem: string; em: Date }

/** Falhas da integração nos últimos minutos (cada uma com uma chave estável para o front avisar uma vez só). */
export async function errosRecentes(ator: Ator, empresaId: number | null, minutos = 15) {
    const permitidas = `SELECT ${unidadesPermitidasSql(ator)}`
    const { rows } = await db.query<ErroRecente>(
        `WITH emp AS (${empresasVisiveis(ator)})
         SELECT * FROM (
            SELECT 'batidas:' || bi.empresa_id || ':' || floor(extract(epoch FROM bi.ultimo_erro_em)) AS chave,
                   'Batidas' AS origem, emp.nome AS empresa, bi.ultimo_erro AS mensagem, bi.ultimo_erro_em AS em
              FROM batidas_importacao bi JOIN emp ON emp.id = bi.empresa_id
             WHERE bi.ultimo_erro IS NOT NULL AND bi.ultimo_erro_em > now() - make_interval(mins => $3)
            UNION ALL
            SELECT 'fechamento:' || f.id || ':' || floor(extract(epoch FROM f.atualizado_em)),
                   'Fechamento', emp.nome,
                   'A extração de ' || coalesce(un.nome_exibicao, un.razao_social) || ' (dados até '
                       || to_char(c.data_referencia, 'DD/MM') || ') falhou. Veja o motivo em Fechamentos.',
                   f.atualizado_em
              FROM fechamentos f
              JOIN emp ON emp.id = f.empresa_id
              JOIN unidades un ON un.id = f.unidade_id
              JOIN ciclos c ON c.id = f.ciclo_id
             WHERE f.status = 'falhou' AND f.unidade_id IN (${permitidas})
               AND f.atualizado_em > now() - make_interval(mins => $3)
            UNION ALL
            SELECT 'tempo_real:' || rt.empresa_id || ':' || floor(extract(epoch FROM max(rt.ultimo_erro_em))),
                   'Tempo real', emp.nome,
                   count(*) || CASE WHEN count(*) = 1 THEN ' colaborador não atualizou: ' ELSE ' colaboradores não atualizaram: ' END
                       || (array_agg(rt.ultimo_erro ORDER BY rt.ultimo_erro_em DESC))[1],
                   max(rt.ultimo_erro_em)
              FROM registros_tempo_real rt JOIN emp ON emp.id = rt.empresa_id
             WHERE rt.ultimo_erro IS NOT NULL AND rt.ultimo_erro_em > now() - make_interval(mins => $3)
               AND rt.unidade_id IN (${permitidas})
               -- ainda falhando (não houve sucesso depois do erro)
               AND (rt.extraido_em IS NULL OR rt.ultimo_erro_em > rt.extraido_em)
             GROUP BY rt.empresa_id, emp.nome
         ) x
         ORDER BY x.em DESC
         LIMIT 5`,
        [ator.id, empresaId, minutos],
    )
    return rows
}
