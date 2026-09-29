import { db, type Executor } from '../db/database'
import type { CicloPrevisto, ConfigCalendario } from '../services/calendario.service'
import type { ItemMapeamento, RegistroBase, ValoresRegistro } from '../services/calculo-horas.service'
import type { TotaisSecullum } from '../integrations/secullum/tipos'

export type EmpresaRegua = ConfigCalendario & { empresa_id: number }

export type FechamentoReivindicado = {
    id: number
    empresa_id: number
    unidade_id: number
    ciclo_id: number
    tentativas: number
    teto_aplicado_minutos: number | null
    teto_periodicidade_aplicada: 'semanal' | 'mensal' | null
    tipo: 'semanal' | 'fechamento_mes'
    periodo_inicio: string
    data_referencia: string
}

export type ConfigExtracao = {
    origem_horas_pagas: 'teto' | 'coluna_secullum'
    cota_calcular_por_hora: number
}

export type ColaboradorElegivel = {
    id: number
    cpf: string
    feito: boolean
}

export type EtapaErro = 'autenticacao' | 'sincronizacao' | 'calcular' | 'mapeamento' | 'gravacao'

export type Posse = Pick<FechamentoReivindicado, 'id' | 'tentativas'>

// Só quem reivindicou (mesma tentativa) altera o fechamento: protege contra retomada por lease vencido ou reabertura.
const daPosse = `id = $1 AND status = 'processando' AND tentativas = $2`

export async function empresasParaRegua(ex: Executor = db) {
    const result = await ex.query<EmpresaRegua>(
        `SELECT e.id AS empresa_id, cf.dia_semana_extracao, cf.hora_extracao::text AS hora_extracao,
                cf.dia_fechamento_mes, cf.dias_apos_fechamento_mes, cf.fuso_horario
           FROM empresas e
           JOIN configuracoes cf ON cf.empresa_id = e.id
          WHERE e.ativo AND e.secullum_usuario IS NOT NULL AND e.secullum_banco_id IS NOT NULL
          ORDER BY e.id`,
    )
    return result.rows
}

export async function criarCiclo(empresaId: number, ciclo: CicloPrevisto, ex: Executor = db) {
    const result = await ex.query<{ id: number }>(
        `INSERT INTO ciclos (empresa_id, tipo, periodo_inicio, data_referencia, gatilho_previsto_em, gatilho_em)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (empresa_id, data_referencia) DO NOTHING
         RETURNING id`,
        [empresaId, ciclo.tipo, ciclo.periodo_inicio, ciclo.data_referencia, ciclo.gatilho_em],
    )
    return result.rows[0]?.id ?? null
}

export async function criarFechamentosDoCiclo(cicloId: number, ex: Executor = db) {
    const result = await ex.query(
        `INSERT INTO fechamentos (ciclo_id, empresa_id, unidade_id)
         SELECT c.id, c.empresa_id, un.id
           FROM ciclos c
           JOIN unidades un ON un.empresa_id = c.empresa_id AND un.ativo AND un.nome_exibicao IS NOT NULL
          WHERE c.id = $1
         ON CONFLICT (ciclo_id, unidade_id) DO NOTHING`,
        [cicloId],
    )
    return result.rowCount ?? 0
}

export async function completarFechamentosFuturos(empresaId: number, ex: Executor = db) {
    const result = await ex.query(
        `INSERT INTO fechamentos (ciclo_id, empresa_id, unidade_id)
         SELECT c.id, c.empresa_id, un.id
           FROM ciclos c
           JOIN unidades un ON un.empresa_id = c.empresa_id AND un.ativo AND un.nome_exibicao IS NOT NULL
          WHERE c.empresa_id = $1 AND c.gatilho_em > now()
         ON CONFLICT (ciclo_id, unidade_id) DO NOTHING`,
        [empresaId],
    )
    return result.rowCount ?? 0
}

export async function cancelarFechamentosSemUnidade(empresaId: number, ex: Executor = db) {
    const result = await ex.query(
        `UPDATE fechamentos f SET status = 'cancelado'
           FROM ciclos c, unidades un
          WHERE c.id = f.ciclo_id AND un.id = f.unidade_id
            AND f.empresa_id = $1 AND f.status = 'pendente' AND c.gatilho_em > now()
            AND (NOT un.ativo OR un.nome_exibicao IS NULL)`,
        [empresaId],
    )
    return result.rowCount ?? 0
}

export async function reivindicarFechamento(ex: Executor = db) {
    const result = await ex.query<FechamentoReivindicado>(
        `WITH alvo AS (
            SELECT f.id
              FROM fechamentos f
              JOIN ciclos c   ON c.id = f.ciclo_id
              JOIN empresas e ON e.id = f.empresa_id AND e.ativo
                               AND e.secullum_usuario IS NOT NULL AND e.secullum_banco_id IS NOT NULL
             WHERE c.gatilho_em <= now()
               AND (   (f.status = 'pendente'
                        AND (f.proxima_tentativa_em IS NULL OR f.proxima_tentativa_em <= now()))
                    OR (f.status = 'processando' AND f.heartbeat_em < now() - interval '15 minutes'))
             ORDER BY c.gatilho_em, f.id
             LIMIT 1
             FOR UPDATE OF f SKIP LOCKED
        )
        UPDATE fechamentos f
           SET status = 'processando', heartbeat_em = now(), tentativas = f.tentativas + 1,
               teto_aplicado_minutos       = CASE WHEN cf.origem_horas_pagas = 'teto' THEN cf.teto_horas_pagas_minutos END,
               teto_periodicidade_aplicada = CASE WHEN cf.origem_horas_pagas = 'teto' THEN cf.teto_periodicidade END
          FROM alvo, configuracoes cf, ciclos c
         WHERE f.id = alvo.id AND cf.empresa_id = f.empresa_id AND c.id = f.ciclo_id
     RETURNING f.id, f.empresa_id, f.unidade_id, f.ciclo_id, f.tentativas, f.teto_aplicado_minutos,
               f.teto_periodicidade_aplicada, c.tipo, c.periodo_inicio::text AS periodo_inicio,
               c.data_referencia::text AS data_referencia`,
    )
    return result.rows[0] ?? null
}

export async function buscarConfigExtracao(empresaId: number, ex: Executor = db) {
    const result = await ex.query<ConfigExtracao>(
        'SELECT origem_horas_pagas, cota_calcular_por_hora FROM configuracoes WHERE empresa_id = $1',
        [empresaId],
    )
    return result.rows[0] ?? null
}

export async function buscarMapeamento(empresaId: number, ex: Executor = db) {
    const result = await ex.query<ItemMapeamento>(
        'SELECT coluna_secullum, campo FROM mapeamento_colunas WHERE empresa_id = $1',
        [empresaId],
    )
    return result.rows
}

export async function interromperExecucoesAbertas(fechamentoId: number, ex: Executor = db) {
    await ex.query(
        `UPDATE execucoes_extracao SET status = 'interrompida', finalizado_em = now(),
                mensagem_erro = coalesce(mensagem_erro, 'Worker interrompido; retomada em nova execução.')
          WHERE fechamento_id = $1 AND status = 'processando'`,
        [fechamentoId],
    )
}

export async function criarExecucao(fechamentoId: number, total: number, processados: number, ex: Executor = db) {
    const result = await ex.query<{ id: number }>(
        `INSERT INTO execucoes_extracao (fechamento_id, total_colaboradores, processados)
         VALUES ($1, $2, $3) RETURNING id`,
        [fechamentoId, total, processados],
    )
    return result.rows[0].id
}

export async function colaboradoresElegiveis(fechamentoId: number, ex: Executor = db) {
    const result = await ex.query<ColaboradorElegivel>(
        `SELECT col.id, col.cpf,
                EXISTS (SELECT 1 FROM registros_horas r
                         WHERE r.fechamento_id = f.id AND r.colaborador_id = col.id) AS feito
           FROM fechamentos f
           JOIN ciclos c ON c.id = f.ciclo_id
           JOIN colaboradores col ON col.unidade_id = f.unidade_id
          WHERE f.id = $1
            AND (col.ativo OR col.data_demissao >= c.periodo_inicio)
            AND (col.data_admissao IS NULL OR col.data_admissao <= c.data_referencia)
          ORDER BY col.id`,
        [fechamentoId],
    )
    return result.rows
}

export async function definirTotalColaboradores(posse: Posse, total: number, ex: Executor = db) {
    await ex.query(`UPDATE fechamentos SET total_colaboradores = $3 WHERE ${daPosse}`, [posse.id, posse.tentativas, total])
}

export async function heartbeatFechamento(posse: Posse, ex: Executor = db) {
    const result = await ex.query(`UPDATE fechamentos SET heartbeat_em = now() WHERE ${daPosse}`, [posse.id, posse.tentativas])
    return (result.rowCount ?? 0) > 0
}

export async function travarEmpresa(empresaId: number, ex: Executor) {
    await ex.query('SELECT id FROM empresas WHERE id = $1 FOR UPDATE', [empresaId])
}

export async function chamadasNaUltimaHora(empresaId: number, rota: string, ex: Executor = db) {
    const result = await ex.query<{ total: number, mais_antiga: Date | null }>(
        `SELECT count(*)::int AS total, min(feita_em) AS mais_antiga
           FROM chamadas_api
          WHERE empresa_id = $1 AND rota = $2 AND feita_em > now() - interval '1 hour'`,
        [empresaId, rota],
    )
    return result.rows[0]
}

export async function reservarChamada(empresaId: number, execucaoId: number, rota: string, ex: Executor = db) {
    const result = await ex.query<{ id: string }>(
        `INSERT INTO chamadas_api (empresa_id, execucao_id, rota) VALUES ($1, $2, $3) RETURNING id`,
        [empresaId, execucaoId, rota],
    )
    return result.rows[0].id
}

export async function concluirChamada(id: string, status: number | null, duracaoMs: number, ex: Executor = db) {
    await ex.query('UPDATE chamadas_api SET http_status = $2, duracao_ms = $3 WHERE id = $1', [id, status, duracaoMs])
}

export async function buscarRegistroAnterior(
    filtro: { colaboradorId: number, empresaId: number, periodoInicio: string, dataReferencia: string },
    ex: Executor = db,
) {
    const result = await ex.query<RegistroBase>(
        `SELECT r.id, r.extra_periodo, r.negativa_periodo, r.pagas_periodo, r.banco_periodo
           FROM registros_horas r
           JOIN fechamentos f ON f.id = r.fechamento_id AND f.status = 'sucesso'
           JOIN ciclos c      ON c.id = f.ciclo_id
          WHERE r.colaborador_id = $1
            AND c.empresa_id = $2
            AND c.periodo_inicio = $3
            AND c.data_referencia < $4
          ORDER BY c.data_referencia DESC
          LIMIT 1`,
        [filtro.colaboradorId, filtro.empresaId, filtro.periodoInicio, filtro.dataReferencia],
    )
    return result.rows[0] ?? null
}

export async function saldoPeriodosAnteriores(
    filtro: { colaboradorId: number, empresaId: number, periodoInicio: string },
    ex: Executor = db,
) {
    const result = await ex.query<{ saldo: number }>(
        `SELECT coalesce(sum(x.banco_periodo - x.negativa_periodo), 0)::int AS saldo
           FROM (SELECT DISTINCT ON (c.periodo_inicio) r.banco_periodo, r.negativa_periodo
                   FROM registros_horas r
                   JOIN fechamentos f ON f.id = r.fechamento_id AND f.status = 'sucesso'
                   JOIN ciclos c      ON c.id = f.ciclo_id
                  WHERE r.colaborador_id = $1 AND c.empresa_id = $2 AND c.periodo_inicio < $3
                  ORDER BY c.periodo_inicio, c.data_referencia DESC) x`,
        [filtro.colaboradorId, filtro.empresaId, filtro.periodoInicio],
    )
    return result.rows[0].saldo
}

export async function gravarRegistro(
    fechamentoId: number, colaboradorId: number, valores: ValoresRegistro, dados: TotaisSecullum, ex: Executor = db,
) {
    await ex.query(
        `INSERT INTO registros_horas (fechamento_id, colaborador_id, extra_periodo, negativa_periodo, pagas_periodo,
                                      banco_periodo, extra_semana, negativa_semana, pagas_semana, banco_semana,
                                      saldo_banco_total, base_semana_registro_id, dados_brutos)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (fechamento_id, colaborador_id) DO UPDATE
            SET extra_periodo = EXCLUDED.extra_periodo, negativa_periodo = EXCLUDED.negativa_periodo,
                pagas_periodo = EXCLUDED.pagas_periodo, banco_periodo = EXCLUDED.banco_periodo,
                extra_semana = EXCLUDED.extra_semana, negativa_semana = EXCLUDED.negativa_semana,
                pagas_semana = EXCLUDED.pagas_semana, banco_semana = EXCLUDED.banco_semana,
                saldo_banco_total = EXCLUDED.saldo_banco_total,
                base_semana_registro_id = EXCLUDED.base_semana_registro_id, dados_brutos = EXCLUDED.dados_brutos`,
        [
            fechamentoId, colaboradorId, valores.extra_periodo, valores.negativa_periodo, valores.pagas_periodo,
            valores.banco_periodo, valores.extra_semana, valores.negativa_semana, valores.pagas_semana,
            valores.banco_semana, valores.saldo_banco_total, valores.base_semana_registro_id,
            JSON.stringify({ colunas: dados.colunas, totais: dados.totais }),
        ],
    )
}

export async function registrarErro(
    erro: { execucaoId: number, colaboradorId: number | null, etapa: EtapaErro, httpStatus?: number | null, mensagem: string },
    ex: Executor = db,
) {
    await ex.query(
        `INSERT INTO execucao_erros (execucao_id, colaborador_id, etapa, http_status, mensagem) VALUES ($1, $2, $3, $4, $5)`,
        [erro.execucaoId, erro.colaboradorId, erro.etapa, erro.httpStatus ?? null, erro.mensagem.slice(0, 2000)],
    )
}

export async function somarProgresso(execucaoId: number, processados: number, comErro: number, ex: Executor = db) {
    await ex.query(
        `UPDATE execucoes_extracao SET processados = processados + $2, com_erro = com_erro + $3 WHERE id = $1`,
        [execucaoId, processados, comErro],
    )
}

export async function finalizarExecucao(
    execucaoId: number, status: 'sucesso' | 'falhou' | 'interrompida', mensagem: string | null, ex: Executor = db,
) {
    await ex.query(
        `UPDATE execucoes_extracao SET status = $2, mensagem_erro = $3, finalizado_em = now() WHERE id = $1`,
        [execucaoId, status, mensagem],
    )
}

export async function publicarFechamento(posse: Posse, ex: Executor = db) {
    const result = await ex.query(
        `UPDATE fechamentos SET status = 'sucesso', publicado_em = now(), proxima_tentativa_em = NULL, heartbeat_em = now()
          WHERE ${daPosse}`,
        [posse.id, posse.tentativas],
    )
    return (result.rowCount ?? 0) > 0
}

export async function encerrarFechamento(posse: Posse, status: 'falhou' | 'cancelado', ex: Executor = db) {
    const result = await ex.query(
        `UPDATE fechamentos SET status = $3, proxima_tentativa_em = NULL WHERE ${daPosse}`,
        [posse.id, posse.tentativas, status],
    )
    return (result.rowCount ?? 0) > 0
}

export async function devolverFechamento(
    posse: Posse, proximaTentativaEm: Date, descontarTentativa: boolean, ex: Executor = db,
) {
    const result = await ex.query(
        `UPDATE fechamentos
            SET status = 'pendente', proxima_tentativa_em = $3,
                tentativas = CASE WHEN $4 THEN greatest(tentativas - 1, 0) ELSE tentativas END
          WHERE ${daPosse}`,
        [posse.id, posse.tentativas, proximaTentativaEm, descontarTentativa],
    )
    return (result.rowCount ?? 0) > 0
}
