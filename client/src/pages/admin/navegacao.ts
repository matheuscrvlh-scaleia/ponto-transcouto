import type { Perfil, Tela } from '../../types/api'

export interface ItemMenu {
  caminho: string
  rotulo: string
  /** Tela que o grupo de permissão precisa liberar (Configuração). */
  tela?: Tela
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
  // cada item vale pela tela liberada no grupo de permissão (Configuração → Permissões)
  perfis: ['admin', 'rh', 'gestor'],
  itens: [
    { caminho: 'usuarios', rotulo: 'Usuários', tela: 'usuarios' },
    { caminho: 'integracao', rotulo: 'Integração FriPonto', tela: 'integracao' },
    { caminho: 'atualizacao', rotulo: 'Atualização dos dados', tela: 'atualizacao' },
    { caminho: 'unidades', rotulo: 'Unidades', tela: 'unidades' },
    { caminho: 'alertas', rotulo: 'Alertas e horas pagas', tela: 'alertas' },
    { caminho: 'permissoes', rotulo: 'Permissões', tela: 'permissoes' },
  ],
  grupos: [
    { id: 'usuarios', rotulo: 'Usuários', abas: ['usuarios', 'permissoes'] },
    { id: 'integracoes', rotulo: 'Integrações', abas: ['integracao', 'atualizacao'] },
    { id: 'configuracoes', rotulo: 'Configurações', abas: ['unidades', 'alertas'] },
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

/** O usuário (perfil + telas do grupo) vê o item? */
export function itemPermitido(secao: SecaoAdmin, item: ItemMenu, perfil: Perfil | null, telas: Tela[]) {
  if (!perfil) return false
  if (item.tela && !telas.includes(item.tela)) return false
  return secao.perfis.includes(perfil)
}

export function itensPermitidos(secao: SecaoAdmin, perfil: Perfil | null, telas: Tela[]): ItemMenu[] {
  return secao.itens.filter((item) => itemPermitido(secao, item, perfil, telas))
}

/** Seções que o usuário vê, já só com os itens permitidos a ele. */
export function secoesPermitidas(perfil: Perfil | null, telas: Tela[]): SecaoAdmin[] {
  return [SECAO_CONFIGURACAO, SECAO_ADMINISTRACAO]
    .map((secao) => ({ ...secao, itens: itensPermitidos(secao, perfil, telas) }))
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

/** Tela de Fechamentos (Gestão), se o grupo libera a tela (as ações de equipe aparecem conforme o perfil). */
export function caminhoFechamentos(telas: Tela[]) {
  return telas.includes('fechamentos') ? '/fechamentos' : null
}
