import { db } from '../db/database'
import type { Perfil, UnidadeResumo, UsuarioSessao } from '../types/auth.types'

type UsuarioComSenha = UsuarioSessao & {
    senha: string
    ativo: boolean
    token_versao: number
}

const colunas = 'id, nome, email, perfil, empresa_id, deve_trocar_senha, ativo, token_versao, senha'

export async function buscarPorEmail(email: string) {
    const result = await db.query<UsuarioComSenha>(
        `SELECT ${colunas} FROM usuarios WHERE lower(email) = lower($1)`,
        [email],
    )
    return result.rows[0] ?? null
}

export async function buscarPorCpf(cpf: string) {
    const result = await db.query<UsuarioComSenha>(`SELECT ${colunas} FROM usuarios WHERE cpf = $1`, [cpf])
    return result.rows[0] ?? null
}

export async function buscarPorId(id: number) {
    const result = await db.query<UsuarioComSenha>(`SELECT ${colunas} FROM usuarios WHERE id = $1`, [id])
    return result.rows[0] ?? null
}

export async function registrarLogin(id: number) {
    await db.query('UPDATE usuarios SET ultimo_login_em = now() WHERE id = $1', [id])
}

export async function atualizarSenha(id: number, senhaHash: string) {
    const result = await db.query<{ token_versao: number }>(
        `UPDATE usuarios
            SET senha = $2, deve_trocar_senha = false, token_versao = token_versao + 1
          WHERE id = $1
      RETURNING token_versao`,
        [id, senhaHash],
    )
    return result.rows[0].token_versao
}

export async function listarUnidadesPermitidas(usuarioId: number) {
    const result = await db.query<UnidadeResumo>(
        `SELECT u.id, u.nome_exibicao
           FROM unidades u
          WHERE u.id IN (SELECT unidades_permitidas($1))
            AND u.nome_exibicao IS NOT NULL
          ORDER BY u.nome_exibicao`,
        [usuarioId],
    )
    return result.rows
}

export function sessao(usuario: UsuarioComSenha): UsuarioSessao {
    return {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil as Perfil,
        empresa_id: usuario.empresa_id,
        deve_trocar_senha: usuario.deve_trocar_senha,
    }
}
