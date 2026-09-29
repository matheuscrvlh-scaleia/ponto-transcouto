import { db, type Executor } from '../db/database'

export type CredenciaisEmpresaRow = {
    id: number
    nome: string
    secullum_usuario: string | null
    secullum_senha_cripto: string | null
    secullum_banco_id: string | null
}

export type UnidadeSincronizada = {
    documento: string
    razao_social: string
    ativo: boolean
}

export type ColaboradorSincronizado = {
    unidade_id: number
    secullum_id: number | null
    nome: string
    cpf: string
    numero_folha: string | null
    departamento: string | null
    funcao: string | null
    data_admissao: string | null
    data_demissao: string | null
    ativo: boolean
}

const comCredenciais = `e.ativo AND e.secullum_usuario IS NOT NULL AND e.secullum_senha_cripto IS NOT NULL
                       AND e.secullum_banco_id IS NOT NULL`

export async function empresasParaSincronizar(ex: Executor = db) {
    const result = await ex.query<{ id: number }>(
        `SELECT e.id
           FROM empresas e
          WHERE ${comCredenciais}
            AND (   e.sincronizado_em IS NULL
                 OR e.sincronizacao_solicitada_em > e.sincronizado_em
                 OR EXISTS (SELECT 1
                              FROM ciclos c
                              JOIN fechamentos f ON f.ciclo_id = c.id AND f.status = 'pendente'
                             WHERE c.empresa_id = e.id
                               AND c.gatilho_em <= now()
                               AND c.gatilho_em > e.sincronizado_em))
          ORDER BY e.id`,
    )
    return result.rows.map(r => r.id)
}

export async function buscarCredenciais(empresaId: number, ex: Executor = db) {
    const result = await ex.query<CredenciaisEmpresaRow>(
        `SELECT id, nome, secullum_usuario, secullum_senha_cripto, secullum_banco_id FROM empresas WHERE id = $1`,
        [empresaId],
    )
    return result.rows[0] ?? null
}

// A sincronização só desativa: unidade desativada pelo admin (ou que sumiu da Secullum) volta só por ação manual.
export async function salvarUnidades(empresaId: number, unidades: UnidadeSincronizada[], ex: Executor = db) {
    await ex.query(
        `INSERT INTO unidades (empresa_id, documento, razao_social, ativo, sincronizado_em)
         SELECT $1, u.documento, u.razao_social, u.ativo, now()
           FROM jsonb_to_recordset($2::jsonb) AS u(documento text, razao_social text, ativo boolean)
         ON CONFLICT (empresa_id, documento) DO UPDATE
            SET razao_social = EXCLUDED.razao_social, ativo = unidades.ativo AND EXCLUDED.ativo, sincronizado_em = now()`,
        [empresaId, JSON.stringify(unidades)],
    )
}

export async function desativarUnidadesAusentes(empresaId: number, documentos: string[], ex: Executor = db) {
    const result = await ex.query(
        `UPDATE unidades SET ativo = false, sincronizado_em = now()
          WHERE empresa_id = $1 AND ativo AND NOT (documento = ANY($2::text[]))`,
        [empresaId, documentos],
    )
    return result.rowCount ?? 0
}

export async function unidadesPorDocumento(empresaId: number, ex: Executor = db) {
    const result = await ex.query<{ id: number, documento: string }>(
        'SELECT id, documento FROM unidades WHERE empresa_id = $1',
        [empresaId],
    )
    return new Map(result.rows.map(r => [r.documento, r.id]))
}

export async function salvarColaboradores(empresaId: number, colaboradores: ColaboradorSincronizado[], ex: Executor = db) {
    await ex.query(
        `INSERT INTO colaboradores (empresa_id, unidade_id, secullum_id, nome, cpf, numero_folha, departamento, funcao,
                                    data_admissao, data_demissao, ativo, sincronizado_em)
         SELECT $1, c.unidade_id, c.secullum_id, c.nome, c.cpf, c.numero_folha, c.departamento, c.funcao,
                c.data_admissao, c.data_demissao, c.ativo, now()
           FROM jsonb_to_recordset($2::jsonb) AS c(unidade_id integer, secullum_id integer, nome text, cpf text,
                numero_folha text, departamento text, funcao text, data_admissao date, data_demissao date, ativo boolean)
         ON CONFLICT (empresa_id, cpf) DO UPDATE
            SET unidade_id = EXCLUDED.unidade_id, secullum_id = EXCLUDED.secullum_id, nome = EXCLUDED.nome,
                numero_folha = EXCLUDED.numero_folha, departamento = EXCLUDED.departamento, funcao = EXCLUDED.funcao,
                data_admissao = EXCLUDED.data_admissao, data_demissao = EXCLUDED.data_demissao,
                ativo = EXCLUDED.ativo, sincronizado_em = now()`,
        [empresaId, JSON.stringify(colaboradores)],
    )
}

export async function desativarColaboradoresAusentes(empresaId: number, cpfs: string[], ex: Executor = db) {
    const result = await ex.query(
        `UPDATE colaboradores SET ativo = false, sincronizado_em = now()
          WHERE empresa_id = $1 AND ativo AND NOT (cpf = ANY($2::text[]))`,
        [empresaId, cpfs],
    )
    return result.rowCount ?? 0
}

export async function marcarSincronizado(empresaId: number, ex: Executor = db) {
    await ex.query('UPDATE empresas SET sincronizado_em = now() WHERE id = $1', [empresaId])
}

export async function registrarChamadaApi(
    dados: { empresaId: number, execucaoId: number | null, rota: string, status: number | null, duracaoMs: number },
    ex: Executor = db,
) {
    await ex.query(
        `INSERT INTO chamadas_api (empresa_id, execucao_id, rota, http_status, duracao_ms) VALUES ($1, $2, $3, $4, $5)`,
        [dados.empresaId, dados.execucaoId, dados.rota, dados.status, dados.duracaoMs],
    )
}
