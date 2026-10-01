/** 'admin' = equipe Scale IA; 'rh' e 'gestor' = usuários das empresas clientes. */
export type Perfil = 'admin' | 'rh' | 'gestor'
/** 'equipe' = tabela usuarios (Scale IA); 'cliente' = tabela clientes (empresas atendidas). */
export type TipoUsuario = 'equipe' | 'cliente'
/** Perfis possíveis de um usuário cliente. */
export type PerfilCliente = Exclude<Perfil, 'admin'>
/** Sempre inteiro; negativo = débito. */
export type Minutos = number
/** 'YYYY-MM-DD' */
export type DataISO = string
/** ISO 8601 com fuso */
export type DataHoraISO = string

export interface ErroApi {
  error: string
  campos?: Record<string, string[] | undefined>
  detalhes?: unknown
}

export interface UnidadeRef {
  id: number
  nome_exibicao: string
  empresa_id: number
}

export interface UsuarioSessao {
  /** Ids de equipe e clientes podem coincidir: use `tipo` junto para identificar a pessoa. */
  id: number
  tipo: TipoUsuario
  nome: string
  email: string | null
  perfil: Perfil
  empresa_id: number | null
  deve_trocar_senha: boolean
}

export interface LoginResposta {
  token: string
  expira_em: DataHoraISO
  usuario: UsuarioSessao
  unidades: UnidadeRef[]
}

export interface MeResposta {
  usuario: UsuarioSessao
  unidades: UnidadeRef[]
}

export interface TrocarSenhaResposta {
  token: string
}

export interface UnidadeResumo extends UnidadeRef {
  total_colaboradores?: number
  fora_da_curva?: number
  ultimo_fechamento: { id?: number; data_referencia: DataISO; publicado_em: DataHoraISO } | null
}

export type ForaDaCurva = 'positivo' | 'negativo' | null
export type FiltroDashboard = 'todos' | 'extra' | 'negativa' | 'fora'

export interface Limites {
  alerta_pos: Minutos
  alerta_neg: Minutos
}

export interface LinhaDashboard {
  id: number
  nome: string
  funcao: string | null
  extra_min: Minutos
  negativa_min: Minutos
  pagas_min: Minutos
  banco_min: Minutos
  saldo_min: Minutos
  fora_da_curva: ForaDaCurva
}

export interface FechamentoPublicado {
  id: number
  periodo_inicio: DataISO
  data_referencia: DataISO
  publicado_em: DataHoraISO
  semana_fechamento_mes: boolean
}

export interface ResumoDashboard {
  total: number
  fora_positivo: number
  fora_negativo: number
  pagas_total_min: Minutos
}

/** Unidade dentro do painel consolidado (GET /dashboard). */
export interface UnidadePainel {
  id: number
  nome: string
  fechamento: FechamentoPublicado | null
  alerta_pos: Minutos
  alerta_neg: Minutos
}

/** Linha do painel consolidado: traz a unidade e os limites da empresa dela. */
export interface LinhaDashboardGeral extends LinhaDashboard {
  unidade_id: number
  unidade_nome: string
  alerta_pos: Minutos
  alerta_neg: Minutos
}

/**
 * Resposta de GET /unidades/:id/dashboard (uma unidade) e de GET /dashboard
 * (todas as unidades: `unidade` vem null e chegam `unidades` e `limites_variam`).
 */
export interface DashboardUnidade {
  unidade: { id: number; nome: string } | null
  unidades?: UnidadePainel[]
  fechamento: FechamentoPublicado | null
  aviso_fechamento_mes: boolean
  proximo_fechamento_previsto: DataHoraISO | null
  limites: Limites
  limites_variam?: boolean
  resumo: ResumoDashboard | null
  colaboradores: (LinhaDashboard & Partial<Omit<LinhaDashboardGeral, keyof LinhaDashboard>>)[]
  total: number
  pagina: number
  por_pagina: number
}

export interface ColaboradorDetalhe {
  id: number
  nome: string
  funcao: string | null
  departamento: string | null
  ativo: boolean
  unidade: { id: number; nome: string }
  resumo: {
    fechamento_id: number
    data_referencia: DataISO
    extra_min: Minutos
    negativa_min: Minutos
    pagas_min: Minutos
    banco_min: Minutos
    saldo_min: Minutos
    fora_da_curva: ForaDaCurva
  } | null
  fora_da_curva: ForaDaCurva
  limites: Limites
}

export interface SemanaHistorico {
  fechamento_id: number
  periodo_inicio: DataISO
  data_referencia: DataISO
  semana_fechamento_mes: boolean
  unidade: { id: number; nome: string }
  extra_semana: Minutos
  negativa_semana: Minutos
  pagas_semana: Minutos
  banco_semana: Minutos
  extra_periodo: Minutos
  negativa_periodo: Minutos
  pagas_periodo: Minutos
  banco_periodo: Minutos
  saldo_total: Minutos
}

/* ---------- Admin ---------- */

export interface Pessoa {
  id: number
  nome: string
}

export interface Paginado<T> {
  itens: T[]
  total: number
  pagina: number
  por_pagina: number
}

export interface Empresa {
  id: number
  nome: string
  secullum_usuario: string | null
  secullum_banco_id: string | null
  possui_senha: boolean
  ativo: boolean
  sincronizacao_solicitada_em: DataHoraISO | null
  sincronizado_em: DataHoraISO | null
  criado_em: DataHoraISO
  atualizado_em: DataHoraISO
  qtd_unidades: number
}

export type TesteConexao =
  | { ok: true; bancos: { id: string; nome: string }[]; banco_configurado_encontrado: boolean | null }
  | { ok: false; erro: string }

export type StatusFechamento = 'pendente' | 'processando' | 'sucesso' | 'falhou' | 'cancelado'
export type TipoCiclo = 'semanal' | 'fechamento_mes'

export interface ExecucaoResumo {
  id: number
  disparo: 'automatico' | 'manual'
  disparado_por: Pessoa | null
  status: 'processando' | 'sucesso' | 'falhou' | 'interrompida'
  total_colaboradores: number
  processados: number
  com_erro: number
  mensagem_erro: string | null
  iniciado_em: DataHoraISO
  finalizado_em: DataHoraISO | null
}

export interface FechamentoAdmin {
  id: number
  empresa: Pessoa
  unidade: Pessoa
  ciclo_id: number
  tipo: TipoCiclo
  periodo_inicio: DataISO
  data_referencia: DataISO
  gatilho_em: DataHoraISO
  gatilho_previsto_em: DataHoraISO
  gatilho_ajustado: boolean
  gatilho_ajustado_por: Pessoa | null
  status: StatusFechamento
  tentativas: number
  proxima_tentativa_em: DataHoraISO | null
  total_colaboradores: number | null
  registros: number
  publicado_em: DataHoraISO | null
  ultima_execucao: ExecucaoResumo | null
}

export interface ErroExecucao {
  id: number
  execucao_id: number
  etapa: string
  http_status: number | null
  mensagem: string
  colaborador: Pessoa | null
  criado_em: DataHoraISO
}

export interface FechamentoDetalhe extends FechamentoAdmin {
  execucoes: ExecucaoResumo[]
  erros: ErroExecucao[]
}

export interface CotaSecullum {
  empresa_id: number
  usadas_ultima_hora: number
  limite: number
  limite_secullum: number
  disponiveis: number
  proxima_liberacao: DataHoraISO | null
  por_rota: { rota: string; usadas: number }[]
}

export interface CicloCalendario {
  ciclo_id: number | null
  tipo: TipoCiclo
  periodo_inicio: DataISO
  data_referencia: DataISO
  gatilho_em: DataHoraISO
  gatilho_previsto_em: DataHoraISO
  semana_fechamento_mes: boolean
  ajustado: boolean
}

export interface UnidadeAdmin {
  id: number
  empresa_id: number
  cnpj: string
  razao_social: string
  nome_exibicao: string | null
  ativo: boolean
  sincronizado_em: DataHoraISO | null
  qtd_colaboradores: number
}

export interface Configuracoes {
  empresa_id: number
  dia_semana_extracao: number
  hora_extracao: string
  dia_fechamento_mes: number
  dias_apos_fechamento_mes: number
  origem_horas_pagas: 'teto' | 'coluna_secullum'
  teto_horas_pagas_minutos: Minutos
  teto_periodicidade: 'semanal' | 'mensal'
  alerta_saldo_positivo_minutos: Minutos
  alerta_saldo_negativo_minutos: Minutos
  fuso_horario: string
  cota_calcular_por_hora: number
  atualizado_em: DataHoraISO
  atualizado_por: Pessoa | null
}

export type CampoMapeado = 'extra' | 'negativa' | 'pagas' | 'saldo_banco' | 'ignorar'

export interface MapeamentoColuna {
  coluna_secullum: string
  campo: CampoMapeado
}

export interface MapeamentoResposta {
  mapeamento: MapeamentoColuna[]
  colunas_detectadas: string[]
}

/** Usuário de uma empresa cliente (GET /clientes). */
export interface ClienteAdmin {
  id: number
  nome: string
  email: string | null
  perfil: PerfilCliente
  empresa_id: number
  ativo: boolean
  deve_trocar_senha: boolean
  ultimo_login_em: DataHoraISO | null
  criado_em: DataHoraISO | null
  unidades: { id: number; nome_exibicao: string | null }[]
  cpf_mascarado: string | null
}

/** Membro da equipe Scale IA (GET /equipe). */
export interface MembroEquipe {
  id: number
  nome: string
  email: string | null
  cpf_mascarado: string | null
  ativo: boolean
  deve_trocar_senha: boolean
  ultimo_login_em: DataHoraISO | null
  criado_em: DataHoraISO | null
}

/** Resposta de POST /clientes e POST /equipe. */
export interface ContaCriada<T> {
  id: number
  senha_temporaria: string
  usuario: T | null
}
