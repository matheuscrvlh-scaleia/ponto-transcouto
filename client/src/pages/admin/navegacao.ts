import type { Perfil } from '../../types/api'

export interface ItemAdmin {
  caminho: string
  rotulo: string
  perfis: Perfil[]
}

/** Fonte única para o menu e para as guardas de rota da área admin. */
export const ITENS_ADMIN: ItemAdmin[] = [
  { caminho: 'fechamentos', rotulo: 'Fechamentos', perfis: ['admin', 'rh'] },
  { caminho: 'unidades', rotulo: 'Unidades', perfis: ['admin', 'rh'] },
  { caminho: 'configuracoes', rotulo: 'Configurações', perfis: ['admin', 'rh'] },
  { caminho: 'colunas', rotulo: 'Mapeamento de colunas', perfis: ['admin'] },
  { caminho: 'acessos', rotulo: 'Acessos', perfis: ['admin', 'rh'] },
  { caminho: 'empresas', rotulo: 'Empresas', perfis: ['admin'] },
]

export function itensPermitidos(perfil: Perfil | null) {
  return perfil ? ITENS_ADMIN.filter((item) => item.perfis.includes(perfil)) : []
}
