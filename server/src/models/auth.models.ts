import { db } from '../db/database'
import { unidadesPermitidasSql } from '../db/escopo'
import type { Ator, Perfil, TipoUsuario, UnidadeResumo, UsuarioSessao } from '../types/auth.types'

export type UsuarioComSenha = UsuarioSessao & {
    senha: string
    ativo: boolean
    token_versao: number
}

/* Equipe (usuarios) e clientes têm as mesmas colunas de login; a equipe não
   tem empresa. O tipo vem como coluna para a sessão saber de onde veio. */
const colunasEquipe = `id, 'equipe' AS tipo, nome, email, perfil, NULL::int AS empresa_id,
                       deve_trocar_senha, ativo, token_versao, senha`
const colunasCliente = `id, 'cliente' AS tipo, nome, email, perfil, empresa_id,
                        deve_trocar_senha, ativo, token_versao, senha`

const tabela: Record<TipoUsuario, string> = { equipe: 'usuarios', cliente: 'clientes' }

/** E-mail e CPF são únicos entre as duas tabelas (trigger garantir_login_unico). */
async function buscarLogin(condicao: string, valor: string) {
    const { rows } = await db.query<UsuarioComSenha>(
        `SELECT ${colunasEquipe} FROM usuarios WHERE ${condicao}
         UNION ALL
         SELECT ${colunasCliente} FROM clientes WHERE ${condicao}
         LIMIT 1`,
        [valor],
    )
    return rows[0] ?? null
}

export function buscarPorEmail(email: string) {
    return buscarLogin('lower(email) = lower($1)', email)
}

export function buscarPorCpf(cpf: string) {
    return buscarLogin('cpf = $1', cpf)
}

export async function buscarPorId(ator: Ator) {
    const colunas = ator.tipo === 'equipe' ? colunasEquipe : colunasCliente
    const { rows } = await db.query<UsuarioComSenha>(`SELECT ${colunas} FROM ${tabela[ator.tipo]} WHERE id = $1`, [ator.id])
    return rows[0] ?? null
}

export async function registrarLogin(ator: Ator) {
    await db.query(`UPDATE ${tabela[ator.tipo]} SET ultimo_login_em = now() WHERE id = $1`, [ator.id])
}

export async function atualizarSenha(ator: Ator, senhaHash: string) {
    const result = await db.query<{ token_versao: number }>(
        `UPDATE ${tabela[ator.tipo]}
            SET senha = $2, deve_trocar_senha = false, token_versao = token_versao + 1
          WHERE id = $1
      RETURNING token_versao`,
        [ator.id, senhaHash],
    )
    return result.rows[0].token_versao
}

/** E-mail/CPF já usado por alguém da equipe ou por um cliente (o login é único entre as duas tabelas). */
export async function loginEmUso(email: string | null, cpf: string | null, ignorar: Ator | null) {
    const { rows } = await db.query(
        `SELECT 1 FROM usuarios
          WHERE (lower(email) = lower($1) OR cpf = $2) AND NOT ($3::text = 'equipe' AND id = $4)
         UNION ALL
         SELECT 1 FROM clientes
          WHERE (lower(email) = lower($1) OR cpf = $2) AND NOT ($3::text = 'cliente' AND id = $4)
         LIMIT 1`,
        [email, cpf, ignorar?.tipo ?? '', ignorar?.id ?? 0],
    )
    return rows.length > 0
}

export async function listarUnidadesPermitidas(ator: Ator) {
    const result = await db.query<UnidadeResumo>(
        `SELECT u.id, u.nome_exibicao, u.empresa_id
           FROM unidades u
          WHERE u.id IN (SELECT ${unidadesPermitidasSql(ator)})
            AND u.nome_exibicao IS NOT NULL
          ORDER BY u.nome_exibicao`,
        [ator.id],
    )
    return result.rows
}

export function sessao(usuario: UsuarioComSenha): UsuarioSessao {
    return {
        id: usuario.id,
        tipo: usuario.tipo,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil as Perfil,
        empresa_id: usuario.empresa_id,
        deve_trocar_senha: usuario.deve_trocar_senha,
    }
}
