import type { Perfil } from '../../types/api'

export interface ItemMenu {
  caminho: string
  rotulo: string
}

export interface SecaoAdmin {
  id: 'configuracao' | 'administracao'
  titulo: string
  /** Prefixo das rotas da seção (ex.: '/configuracao'). */
  base: string
  perfis: Perfil[]
  itens: ItemMenu[]
}

/** Fonte única para o menu da sidebar e para as rotas de Configuração e Administração. */
export const SECAO_CONFIGURACAO: SecaoAdmin = {
  id: 'configuracao',
  titulo: 'Configuração',
  base: '/configuracao',
  perfis: ['admin', 'rh'],
  itens: [
    { caminho: 'usuarios', rotulo: 'Usuários' },
    { caminho: 'unidades', rotulo: 'Unidades' },
    { caminho: 'alertas', rotulo: 'Alertas e horas pagas' },
    { caminho: 'fechamentos', rotulo: 'Fechamentos' },
    { caminho: 'permissoes', rotulo: 'Permissões' },
  ],
}

export const SECAO_ADMINISTRACAO: SecaoAdmin = {
  id: 'administracao',
  titulo: 'Administração',
  base: '/admin',
  perfis: ['admin'],
  itens: [
    { caminho: 'empresas', rotulo: 'Empresas' },
    { caminho: 'colunas', rotulo: 'Mapeamento de colunas' },
    { caminho: 'fechamentos', rotulo: 'Fechamentos' },
    { caminho: 'calendario', rotulo: 'Calendário de extração' },
    { caminho: 'equipe', rotulo: 'Equipe' },
  ],
}

export function secoesPermitidas(perfil: Perfil | null) {
  return perfil ? [SECAO_CONFIGURACAO, SECAO_ADMINISTRACAO].filter((secao) => secao.perfis.includes(perfil)) : []
}

/** Painel de fechamentos mais completo que o perfil acessa (equipe: Administração, com as ações). */
export function caminhoFechamentos(perfil: Perfil | null) {
  if (perfil === 'admin') return '/admin/fechamentos'
  if (perfil === 'rh') return '/configuracao/fechamentos'
  return null
}
