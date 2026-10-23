import type { Tela } from '../types/api'

/* Catálogo das telas que um grupo de permissão pode liberar. Mesma lista do servidor
   (server/src/types/permissoes.types.ts) e do CHECK grupos_telas_chk no banco. */

export interface InfoTela {
  id: Tela
  rotulo: string
  descricao: string
  secao: 'Gestão' | 'Configuração'
  /** Endereço da tela no app (primeira tela liberada vira a página inicial). */
  caminho: string
}

export const TELAS: InfoTela[] = [
  { id: 'dashboard', rotulo: 'Dashboard', secao: 'Gestão', caminho: '/unidades', descricao: 'Indicadores do banco de horas e quem está fora da curva' },
  { id: 'batidas', rotulo: 'Batidas', secao: 'Gestão', caminho: '/batidas', descricao: 'Log das marcações de ponto vindas da FriPonto' },
  { id: 'colaboradores', rotulo: 'Colaboradores', secao: 'Gestão', caminho: '/colaboradores', descricao: 'Lista de colaboradores com saldo, extras, negativas e pagas' },
  { id: 'fechamentos', rotulo: 'Fechamentos', secao: 'Gestão', caminho: '/fechamentos', descricao: 'Extrações semanais e do fechamento do mês, por unidade' },
  { id: 'usuarios', rotulo: 'Usuários', secao: 'Configuração', caminho: '/configuracao/usuarios', descricao: 'Cadastrar usuários, escolher o grupo, vincular unidades e redefinir senha' },
  { id: 'permissoes', rotulo: 'Permissões', secao: 'Configuração', caminho: '/configuracao/permissoes', descricao: 'Criar grupos de permissão e escolher as telas de cada um' },
  { id: 'integracao', rotulo: 'Integração FriPonto', secao: 'Configuração', caminho: '/configuracao/integracao', descricao: 'Situação da conexão, puxar dados e histórico de pedidos' },
  { id: 'atualizacao', rotulo: 'Atualização dos dados', secao: 'Configuração', caminho: '/configuracao/atualizacao', descricao: 'Semanal ou tempo real, dia e hora, forçar sincronização e congelar dados passados (Configurações → Dados)' },
  { id: 'unidades', rotulo: 'Unidades', secao: 'Configuração', caminho: '/configuracao/unidades', descricao: 'Nome de exibição e ativação das unidades' },
  { id: 'alertas', rotulo: 'Alertas e horas pagas', secao: 'Configuração', caminho: '/configuracao/alertas', descricao: 'Teto de horas pagas e limites de fora da curva' },
]

export const SECOES_TELAS = ['Gestão', 'Configuração'] as const
