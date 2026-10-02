import type { Perfil } from '../../types/api'

export interface ItemMenu {
  caminho: string
  rotulo: string
  /** Perfis que veem este item; sem isso, valem os perfis padrão da seção. */
  perfis?: Perfil[]
}

/** Tela do menu que junta várias abas (cada aba continua sendo uma rota com seus perfis). */
export interface GrupoMenu {
  id: string
  rotulo: string
  /** caminhos dos itens da seção, na ordem das abas */
  abas: string[]
}

export interface SecaoAdmin {
  id: 'configuracao' | 'administracao'
  titulo: string
  /** Prefixo das rotas da seção (ex.: '/configuracao'). */
  base: string
  /** Perfis padrão dos itens (cada item pode ter os seus em `perfis`). */
  perfis: Perfil[]
  itens: ItemMenu[]
  /** Sem grupos, cada item é uma entrada no menu. */
  grupos?: GrupoMenu[]
}

/** Fonte única para o menu da sidebar e para as rotas de Configuração e Administração. */
export const SECAO_CONFIGURACAO: SecaoAdmin = {
  id: 'configuracao',
  titulo: 'Configuração',
  base: '/configuracao',
  perfis: ['admin', 'rh'],
  itens: [
    { caminho: 'usuarios', rotulo: 'Usuários' },
    // o gestor entra só aqui (puxa dados das unidades dele)
    { caminho: 'integracao', rotulo: 'Integração FriPonto', perfis: ['admin', 'rh', 'gestor'] },
    // modo (semanal / tempo real), dia e hora: RH e equipe
    { caminho: 'atualizacao', rotulo: 'Atualização dos dados', perfis: ['admin', 'rh'] },
    { caminho: 'unidades', rotulo: 'Unidades' },
    { caminho: 'alertas', rotulo: 'Alertas e horas pagas' },
    { caminho: 'fechamentos', rotulo: 'Fechamentos' },
    { caminho: 'permissoes', rotulo: 'Permissões' },
  ],
  grupos: [
    { id: 'usuarios', rotulo: 'Usuários', abas: ['usuarios', 'permissoes'] },
    { id: 'integracoes', rotulo: 'Integrações', abas: ['integracao', 'atualizacao'] },
    { id: 'configuracoes', rotulo: 'Configurações', abas: ['unidades', 'alertas', 'fechamentos'] },
  ],
}

export const SECAO_ADMINISTRACAO: SecaoAdmin = {
  id: 'administracao',
  titulo: 'Administração',
  base: '/admin',
  perfis: ['admin'],
  itens: [
    { caminho: 'empresas', rotulo: 'Empresas' },
    // equipe Scale IA (tabela usuarios)
    { caminho: 'equipe', rotulo: 'Usuários gestão' },
    { caminho: 'colunas', rotulo: 'Mapeamento de colunas' },
    { caminho: 'calendario', rotulo: 'Calendário de extração' },
  ],
  grupos: [
    { id: 'empresas', rotulo: 'Empresas', abas: ['empresas'] },
    { id: 'equipe', rotulo: 'Usuários gestão', abas: ['equipe'] },
    { id: 'configuracoes', rotulo: 'Configurações', abas: ['colunas', 'calendario'] },
  ],
}

/** Perfis que acessam um item da seção. */
export function perfisDoItem(secao: SecaoAdmin, caminho: string): Perfil[] {
  return secao.itens.find((item) => item.caminho === caminho)?.perfis ?? secao.perfis
}

/** Itens da seção que o perfil vê. */
export function itensPermitidos(secao: SecaoAdmin, perfil: Perfil | null): ItemMenu[] {
  return perfil ? secao.itens.filter((item) => (item.perfis ?? secao.perfis).includes(perfil)) : []
}

/** Perfis que veem ao menos um item da seção (guarda de rota da seção inteira). */
export function perfisDaSecao(secao: SecaoAdmin): Perfil[] {
  return [...new Set(secao.itens.flatMap((item) => item.perfis ?? secao.perfis))]
}

/** Seções que o perfil vê, já só com os itens permitidos a ele. */
export function secoesPermitidas(perfil: Perfil | null): SecaoAdmin[] {
  return [SECAO_CONFIGURACAO, SECAO_ADMINISTRACAO]
    .map((secao) => ({ ...secao, itens: itensPermitidos(secao, perfil) }))
    .filter((secao) => secao.itens.length > 0)
}

/** Entrada do menu: um grupo (com abas) ou um item sozinho. */
export interface EntradaMenu {
  chave: string
  rotulo: string
  /** aba que o link do menu abre (a primeira que o perfil vê) */
  caminho: string
  abas: ItemMenu[]
}

/** Entradas do menu de uma seção já filtrada por perfil (secoesPermitidas): grupos sem abas visíveis somem. */
export function entradasDaSecao(secao: SecaoAdmin): EntradaMenu[] {
  if (!secao.grupos) return secao.itens.map((item) => ({ chave: item.caminho, rotulo: item.rotulo, caminho: item.caminho, abas: [item] }))
  return secao.grupos
    .map((grupo) => {
      const abas = grupo.abas
        .map((caminho) => secao.itens.find((item) => item.caminho === caminho))
        .filter((item): item is ItemMenu => Boolean(item))
      return { chave: grupo.id, rotulo: grupo.rotulo, caminho: abas[0]?.caminho ?? '', abas }
    })
    .filter((entrada) => entrada.abas.length > 0)
}

/** Painel de fechamentos que o perfil acessa (as ações de equipe aparecem conforme o perfil). */
export function caminhoFechamentos(perfil: Perfil | null) {
  return perfil === 'admin' || perfil === 'rh' ? '/configuracao/fechamentos' : null
}
