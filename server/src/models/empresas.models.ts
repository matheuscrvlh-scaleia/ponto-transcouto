import { db, type Executor } from '../db/database'
import { CAMPOS_CADASTRO, type DadosEmpresa, type Empresa } from '../types/empresas.types'

const selecao = `
    SELECT e.id, e.nome, e.secullum_usuario, e.secullum_banco_id,
           e.secullum_senha_cripto IS NOT NULL AS possui_senha,
           e.ativo, e.sincronizacao_solicitada_em, e.sincronizado_em, e.criado_em, e.atualizado_em,
           ${CAMPOS_CADASTRO.map(campo => `e.${campo}`).join(', ')},
           (SELECT count(*)::int FROM unidades un WHERE un.empresa_id = e.id) AS qtd_unidades,
           (SELECT count(*)::int FROM clientes c WHERE c.empresa_id = e.id AND c.ativo) AS qtd_usuarios
      FROM empresas e`

/** Colunas gravadas a partir de DadosEmpresa, na ordem dos parâmetros ($1, $2, ...). */
const COLUNAS = [
    'nome',
    'secullum_usuario',
    'secullum_senha_cripto',
    'secullum_banco_id',
    'ativo',
    ...CAMPOS_CADASTRO,
] as const satisfies readonly (keyof DadosEmpresa)[]

const valores = (dados: DadosEmpresa) => COLUNAS.map(coluna => dados[coluna])

export async function listar() {
    const { rows } = await db.query<Empresa>(`${selecao} ORDER BY e.nome`)
    return rows
}

export async function buscar(id: number, executor: Executor = db) {
    const { rows } = await executor.query<Empresa>(`${selecao} WHERE e.id = $1`, [id])
    return rows[0] ?? null
}

export async function buscarCredenciais(id: number) {
    const { rows } = await db.query<{ secullum_usuario: string | null; secullum_senha_cripto: string | null }>(
        'SELECT secullum_usuario, secullum_senha_cripto FROM empresas WHERE id = $1',
        [id],
    )
    return rows[0] ?? null
}

/** Campo que já pertence a outra empresa: nome, CNPJ ou banco Secullum. */
export async function conflitos(dados: Pick<DadosEmpresa, 'nome' | 'cnpj' | 'secullum_banco_id'>, ignorarId: number | null) {
    const { rows } = await db.query<{ campo: string }>(
        `SELECT CASE WHEN lower(nome) = lower($1) THEN 'nome'
                     WHEN cnpj = $2 THEN 'cnpj'
                     ELSE 'secullum_banco_id' END AS campo
           FROM empresas
          WHERE (lower(nome) = lower($1) OR cnpj = $2 OR secullum_banco_id = $3)
            AND ($4::int IS NULL OR id <> $4)
          LIMIT 1`,
        [dados.nome, dados.cnpj, dados.secullum_banco_id, ignorarId],
    )
    return rows[0]?.campo ?? null
}

export async function criar(dados: DadosEmpresa, executor: Executor) {
    const { rows } = await executor.query<{ id: number }>(
        `INSERT INTO empresas (${COLUNAS.join(', ')})
         VALUES (${COLUNAS.map((_, i) => `$${i + 1}`).join(', ')})
      RETURNING id`,
        valores(dados),
    )
    return rows[0].id
}

export async function atualizar(id: number, dados: DadosEmpresa, executor: Executor) {
    await executor.query(
        `UPDATE empresas
            SET ${COLUNAS.map((coluna, i) => `${coluna} = $${i + 2}`).join(', ')}
          WHERE id = $1`,
        [id, ...valores(dados)],
    )
}
