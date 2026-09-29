import type { UsuarioAutenticado } from '../types/auth.types'
import { invalido } from '../utils/errors'

export function empresaDoUsuario(usuario: UsuarioAutenticado, informada?: number | null) {
    if (usuario.perfil === 'admin') return informada ?? null
    return usuario.empresaId
}

export function exigirEmpresa(usuario: UsuarioAutenticado, informada?: number | null) {
    const empresaId = empresaDoUsuario(usuario, informada)
    if (empresaId == null) throw invalido('Informe empresa_id.')
    return empresaId
}
