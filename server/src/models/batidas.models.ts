import { db, type Executor } from '../db/database'
import { unidadesPermitidasSql } from '../db/escopo'
import type { MarcacaoSecullum } from '../integrations/secullum/tipos'
import type { Ator } from '../types/auth.types'
import type { Batida, ListarBatidasQuery } from '../types/batidas.types'
import { comCredenciais } from './sincronizacao.models'

export type ImportacaoBatidas = {
    empresa_id: number
    fuso_horario: string
    proximo_id: string | null
    revisado_em: Date | null
}

/** Empresas com credenciais cuja última tentativa de importar batidas foi há mais de `intervaloMin`. */
export async function empresasParaImportar(intervaloMin: number, ex: Executor = db) {
    const { rows } = await ex.query<ImportacaoBatidas>(
        `SELECT e.id AS empresa_id, coalesce(cf.fuso_horario, 'America/Sao_Paulo') AS fuso_horario,
                bi.proximo_id::text AS proximo_id, bi.revisado_em
           FROM empresas e
           LEFT JOIN configuracoes cf ON cf.empresa_id = e.id
           LEFT JOIN batidas_importacao bi ON bi.empresa_id = e.id
          WHERE ${comCredenciais}
            AND (bi.empresa_id IS NULL OR bi.tentado_em <= now() - make_interval(mins => $1))
          ORDER BY bi.tentado_em NULLS FIRST, e.id`,
        [intervaloMin],
    )
    return rows
}

/** Marca a tentativa antes de chamar a Secullum: uma falha não faz o worker insistir a cada rodada. */
export async function marcarTentativa(empresaId: number, ex: Executor = db) {
    await ex.query(
        `INSERT INTO batidas_importacao (empresa_id, tentado_em) VALUES ($1, now())
         ON CONFLICT (empresa_id) DO UPDATE SET tentado_em = now()`,
        [empresaId],
    )
}

/** "Forçar sincronização": a empresa entra na próxima rodada do worker, sem esperar o intervalo. */
export async function liberarImportacao(empresaId: number, ex: Executor = db) {
    await ex.query(
        `INSERT INTO batidas_importacao (empresa_id, tentado_em) VALUES ($1, timestamptz '2000-01-01')
         ON CONFLICT (empresa_id) DO UPDATE SET tentado_em = timestamptz '2000-01-01'`,
        [empresaId],
    )
}

export async function registrarSucesso(
    empresaId: number,
    dados: { proximoId: number | null, revisadoEm: Date | null },
    ex: Executor = db,
) {
    await ex.query(
        `UPDATE batidas_importacao
            SET proximo_id = coalesce($2, proximo_id), importado_em = now(),
                revisado_em = coalesce($3, revisado_em),
                ultimo_erro = NULL, ultimo_erro_em = NULL
          WHERE empresa_id = $1`,
        [empresaId, dados.proximoId, dados.revisadoEm],
    )
}

export async function registrarErro(empresaId: number, mensagem: string, ex: Executor = db) {
    await ex.query(
        `UPDATE batidas_importacao SET ultimo_erro = $2, ultimo_erro_em = now() WHERE empresa_id = $1`,
        [empresaId, mensagem.slice(0, 1000)],
    )
}

/** Colaborador da marcação: pelo Id do funcionário na Secullum ou, numa readmissão, pelo CPF. */
const colaboradorDaMarcacao = (idSecullum: string, cpf: string) => `
    SELECT c.id, c.unidade_id
      FROM colaboradores c
     WHERE c.empresa_id = $1 AND (c.secullum_id = ${idSecullum} OR c.cpf = ${cpf})
     ORDER BY (c.secullum_id IS NOT DISTINCT FROM ${idSecullum}) DESC, c.ativo DESC
     LIMIT 1`

/** Grava (upsert pelo Id da FonteDados) e já vincula ao colaborador. */
export async function gravarMarcacoes(empresaId: number, marcacoes: MarcacaoSecullum[], ex: Executor = db) {
    if (marcacoes.length === 0) return 0
    // a mesma marcação duas vezes no mesmo comando quebraria o ON CONFLICT
    const unicas = [...new Map(marcacoes.map(m => [m.id, m])).values()]
    const linhas = unicas.map(m => ({
        id: m.id,
        funcionario_id: m.funcionarioId,
        cpf: m.cpf,
        data: m.data,
        hora: m.hora,
        tipo: m.tipo,
        origem: m.origem,
        equipamento_id: m.equipamentoId,
        incluida_em: m.incluidaEm,
    }))
    const result = await ex.query(
        `INSERT INTO batidas (empresa_id, fonte_dados_id, colaborador_id, unidade_id, funcionario_secullum_id, cpf,
                              data, hora, tipo, origem, equipamento_id, incluida_em)
         SELECT $1, m.id, col.id, col.unidade_id, m.funcionario_id, m.cpf,
                m.data, m.hora, m.tipo, m.origem, m.equipamento_id, m.incluida_em
           FROM jsonb_to_recordset($2::jsonb) AS m(id bigint, funcionario_id integer, cpf text, data date, hora time,
                tipo smallint, origem smallint, equipamento_id integer, incluida_em timestamp)
           LEFT JOIN LATERAL (${colaboradorDaMarcacao('m.funcionario_id', 'm.cpf')}) col ON true
         ON CONFLICT (empresa_id, fonte_dados_id) DO UPDATE
            SET data = EXCLUDED.data, hora = EXCLUDED.hora, tipo = EXCLUDED.tipo, origem = EXCLUDED.origem,
                equipamento_id = EXCLUDED.equipamento_id, incluida_em = EXCLUDED.incluida_em,
                funcionario_secullum_id = EXCLUDED.funcionario_secullum_id, cpf = EXCLUDED.cpf,
                colaborador_id = coalesce(batidas.colaborador_id, EXCLUDED.colaborador_id),
                unidade_id = CASE WHEN batidas.colaborador_id IS NULL THEN EXCLUDED.unidade_id ELSE batidas.unidade_id END,
                atualizada_em = now()`,
        [empresaId, JSON.stringify(linhas)],
    )
    return result.rowCount ?? 0
}

/** Batidas de funcionários que ainda não tinham chegado pela sincronização de cadastros. */
export async function vincularPendentes(empresaId: number, ex: Executor = db) {
    const result = await ex.query(
        `UPDATE batidas b
            SET (colaborador_id, unidade_id) = (${colaboradorDaMarcacao('b.funcionario_secullum_id', 'b.cpf')}),
                atualizada_em = now()
          WHERE b.empresa_id = $1 AND b.colaborador_id IS NULL
            AND EXISTS (SELECT 1 FROM colaboradores c
                         WHERE c.empresa_id = $1 AND (c.secullum_id = b.funcionario_secullum_id OR c.cpf = b.cpf))`,
        [empresaId],
    )
    return result.rowCount ?? 0
}

/* ---------- Leitura (tela de batidas) ---------- */

const condicoesTipo: Record<NonNullable<ListarBatidasQuery['tipo']>, string> = {
    todas: 'true',
    validas: 'b.tipo <> 3',
    manuais: '(b.tipo = 1 OR b.origem = 2)',
    desconsideradas: 'b.tipo = 3',
}

/** Filtros do log. `$1` é o ator: só entram batidas das unidades que ele pode ver. */
function filtrosSql(ator: Ator, empresaId: number | null, q: ListarBatidasQuery) {
    const params: unknown[] = [ator.id]
    const p = (valor: unknown) => {
        params.push(valor)
        return `$${params.length}`
    }

    const condicoes = [`b.unidade_id IN (SELECT ${unidadesPermitidasSql(ator)})`, condicoesTipo[q.tipo]]
    if (empresaId != null) condicoes.push(`b.empresa_id = ${p(empresaId)}`)
    if (q.unidade_id) condicoes.push(`b.unidade_id = ${p(q.unidade_id)}`)
    if (q.colaborador_id) condicoes.push(`b.colaborador_id = ${p(q.colaborador_id)}`)
    if (q.busca) condicoes.push(`col.nome ILIKE '%' || ${p(q.busca)} || '%'`)
    if (q.de) condicoes.push(`b.data >= ${p(q.de)}`)
    if (q.ate) condicoes.push(`b.data <= ${p(q.ate)}`)
    if (q.origem !== undefined) condicoes.push(`b.origem = ${p(q.origem)}`)

    return { where: condicoes.join(' AND '), params, p }
}

/** Log de batidas, da mais recente para a mais antiga. */
export async function listar(ator: Ator, empresaId: number | null, q: ListarBatidasQuery) {
    const { where, params, p } = filtrosSql(ator, empresaId, q)
    const paramsFiltro = [...params]

    const { rows } = await db.query<Batida & { total: number }>(
        `SELECT b.id, b.data::text AS data, to_char(b.hora, 'HH24:MI') AS hora, b.tipo, b.origem,
                b.equipamento_id, to_char(b.incluida_em, 'YYYY-MM-DD"T"HH24:MI:SS') AS incluida_em,
                json_build_object('id', col.id, 'nome', col.nome, 'funcao', col.funcao) AS colaborador,
                json_build_object('id', un.id, 'nome', coalesce(un.nome_exibicao, un.razao_social)) AS unidade,
                count(*) OVER ()::int AS total
           FROM batidas b
           JOIN colaboradores col ON col.id = b.colaborador_id
           JOIN unidades un ON un.id = b.unidade_id
          WHERE ${where}
          ORDER BY b.data DESC, b.hora DESC, b.fonte_dados_id DESC
          LIMIT ${p(q.por_pagina)} OFFSET ${p((q.pagina - 1) * q.por_pagina)}`,
        params,
    )
    if (rows[0]) return { itens: rows.map(({ total: _total, ...batida }) => batida), total: rows[0].total }

    // página além do fim: o total vem de uma contagem à parte
    const contagem = await db.query<{ total: number }>(
        `SELECT count(*)::int AS total
           FROM batidas b
           JOIN colaboradores col ON col.id = b.colaborador_id
          WHERE ${where}`,
        paramsFiltro,
    )
    return { itens: [], total: contagem.rows[0].total }
}

/** Última importação entre as empresas visíveis (o "atualizado às" da tela). */
export async function ultimaImportacao(ator: Ator, empresaId: number | null) {
    const { rows } = await db.query<{ importado_em: Date | null }>(
        `SELECT max(bi.importado_em) AS importado_em
           FROM batidas_importacao bi
          WHERE bi.empresa_id IN (SELECT un.empresa_id FROM unidades un
                                   WHERE un.id IN (SELECT ${unidadesPermitidasSql(ator)}))
            AND ($2::int IS NULL OR bi.empresa_id = $2)`,
        [ator.id, empresaId],
    )
    return rows[0]?.importado_em ?? null
}
