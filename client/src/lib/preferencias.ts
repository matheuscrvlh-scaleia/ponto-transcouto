import type { Perfil, UsuarioSessao } from '../types/api'

export const NOME_PERFIL: Record<Perfil, string> = {
  admin: 'Equipe Scale IA',
  rh: 'RH',
  gestor: 'Gestor',
}

/** Identifica a pessoa no navegador: ids de equipe e de clientes podem coincidir. */
type Dono = Pick<UsuarioSessao, 'id' | 'tipo'>

function idDono(usuario: Dono) {
  return `${usuario.tipo}-${usuario.id}`
}

const CHAVE_EMPRESA = 'copiloto.empresa-admin'

export function lerEmpresaAdmin(): number | null {
  try {
    const valor = Number(window.localStorage.getItem(CHAVE_EMPRESA))
    return Number.isInteger(valor) && valor > 0 ? valor : null
  } catch {
    return null
  }
}

/** null = "todas as empresas" (equipe). */
export function salvarEmpresaAdmin(id: number | null) {
  try {
    if (id == null) window.localStorage.removeItem(CHAVE_EMPRESA)
    else window.localStorage.setItem(CHAVE_EMPRESA, String(id))
  } catch {
    /* sem persistência */
  }
}

/** Momento (ISO) da publicação mais recente que o usuário já viu no sino. */
function chaveNotificacoes(usuario: Dono) {
  return `copiloto.notificacoes-vistas.${idDono(usuario)}`
}

export function lerNotificacoesVistas(usuario: Dono): string | null {
  try {
    return window.localStorage.getItem(chaveNotificacoes(usuario))
  } catch {
    return null
  }
}

export function salvarNotificacoesVistas(usuario: Dono, iso: string) {
  try {
    window.localStorage.setItem(chaveNotificacoes(usuario), iso)
  } catch {
    /* sem persistência */
  }
}

/** Seções da sidebar que o usuário deixou recolhidas (ex.: ['administracao']). */
function chaveMenuRecolhido(usuario: Dono) {
  return `copiloto.menu-recolhido.${idDono(usuario)}`
}

export function lerMenuRecolhido(usuario: Dono): string[] {
  try {
    const valor: unknown = JSON.parse(window.localStorage.getItem(chaveMenuRecolhido(usuario)) ?? '[]')
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function salvarMenuRecolhido(usuario: Dono, secoes: string[]) {
  try {
    window.localStorage.setItem(chaveMenuRecolhido(usuario), JSON.stringify(secoes))
  } catch {
    /* sem persistência */
  }
}
