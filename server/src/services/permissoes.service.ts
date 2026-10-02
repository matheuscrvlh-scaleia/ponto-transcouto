import type { UsuarioAutenticado } from '../types/auth.types'
import type { Alcance, Tela } from '../types/permissoes.types'

/*
 * Regra de "não passar do que você tem", usada nos grupos de permissão e nos usuários.
 * A equipe Scale IA pode tudo. Um cliente só lida com grupos da própria empresa, que
 * não liberem telas que ele não vê, que só tenham alcance "empresa toda" se ele também
 * tiver, e que não sejam o grupo dele (ninguém se tranca para fora nem se promove).
 */

/** O ator tem todas estas telas e este alcance? */
export function cabeNoAtor(ator: UsuarioAutenticado, telas: Tela[], alcance: Alcance) {
    if (ator.tipo === 'equipe') return true
    if (alcance === 'empresa' && ator.perfil !== 'rh') return false
    return telas.every(tela => ator.telas.includes(tela))
}

/** O ator pode editar este grupo ou colocar/tirar usuários dele? */
export function podeGerenciarGrupo(
    ator: UsuarioAutenticado,
    grupo: { id: number; empresa_id: number; telas: Tela[]; alcance: Alcance },
) {
    if (ator.tipo === 'equipe') return true
    return grupo.empresa_id === ator.empresaId && grupo.id !== ator.grupoId && cabeNoAtor(ator, grupo.telas, grupo.alcance)
}
