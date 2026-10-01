import type { UsuarioAutenticado } from '../types/auth.types'
import { invalido } from '../utils/errors'

/** Equipe Scale IA escolhe a empresa (ou nenhuma = todas); cliente fica sempre na própria. */
export function empresaDoUsuario(usuario: UsuarioAutenticado, informada?: number | null) {
    if (usuario.tipo === 'equipe') return informada ?? null
    return usuario.empresaId
}

export function exigirEmpresa(usuario: UsuarioAutenticado, informada?: number | null) {
    const empresaId = empresaDoUsuario(usuario, informada)
    if (empresaId == null) throw invalido('Informe empresa_id.')
    return empresaId
}
