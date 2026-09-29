import type { Perfil } from '../types/api'

const CHAVE_UNIDADE = 'copiloto.unidade'

export function lerUltimaUnidade(): number | null {
  try {
    const valor = Number(window.localStorage.getItem(CHAVE_UNIDADE))
    return Number.isInteger(valor) && valor > 0 ? valor : null
  } catch {
    return null
  }
}

export function salvarUltimaUnidade(id: number) {
  try {
    window.localStorage.setItem(CHAVE_UNIDADE, String(id))
  } catch {
    /* sem persistência */
  }
}

export const NOME_PERFIL: Record<Perfil, string> = {
  admin: 'Administrador',
  rh: 'RH',
  gestor: 'Gestor',
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

export function salvarEmpresaAdmin(id: number) {
  try {
    window.localStorage.setItem(CHAVE_EMPRESA, String(id))
  } catch {
    /* sem persistência */
  }
}
