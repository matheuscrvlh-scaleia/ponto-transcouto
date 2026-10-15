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

/** Telas que um grupo de permissão libera (catálogo em lib/telas.ts). */
export type Tela =
  | 'dashboard'
  | 'batidas'
  | 'colaboradores'
  | 'usuarios'
  | 'permissoes'
  | 'integracao'
  | 'atualizacao'
  | 'unidades'
  | 'alertas'
  | 'fechamentos'

/** 'empresa' = todas as unidades da empresa; 'unidades' = só as vinculadas ao usuário. */
export type AlcanceGrupo = 'empresa' | 'unidades'

/** GET /permissoes/grupos */
export interface GrupoPermissao {
  id: number
  empresa_id: number
  nome: string
  descricao: string | null
  alcance: AlcanceGrupo
  telas: Tela[]
  /** grupos criados pelo sistema (não podem ser excluídos) */
  padrao: 'rh' | 'gestor' | null
  usuarios: number
  atualizado_em: DataHoraISO
  /** quem está vendo pode editar/excluir (não passa do que ele tem e não é o grupo dele) */
  pode_editar: boolean
  /** é o grupo de quem está vendo */
  proprio: boolean
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
  /** Telas liberadas pelo grupo (a equipe Scale IA tem todas). */
  telas: Tela[]
  /** Grupo de permissão do cliente; null para a equipe. */
  grupo: { id: number; nome: string } | null
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

/**
 * Como os dados de uma empresa são atualizados: fotografia semanal ou tempo real (sem fotografia semanal:
 * dados ao vivo, histórico por dia e só o fechamento do mês como registro oficial).
 */
export type ModoExtracao = 'semanal' | 'tempo_real'
/** De onde vem o número exibido: atualização ao vivo ou fotografia publicada (semanal ou fechamento do mês). */
export type FonteDados = 'tempo_real' | 'fechamento'

/** Situação do tempo real no painel (no consolidado, `ativo` = alguma empresa em tempo real). */
export interface TempoRealDashboard {
  ativo: boolean
  colaboradores_ao_vivo: number
  /** Horário mais antigo e mais recente das atualizações ao vivo exibidas. */
  atualizado_de: DataHoraISO | null
  atualizado_ate: DataHoraISO | null
  /** Data até onde vão os dados ao vivo (normalmente hoje). */
  dados_ate: DataISO | null
}

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
  fonte: FonteDados
  /** Hora da atualização ao vivo (com fonte 'tempo_real'). */
  atualizado_em: DataHoraISO | null
  /** Período dos números da linha: os dias desse intervalo somam o mesmo. */
  periodo_inicio: DataISO
  dados_ate: DataISO
}

/** Resposta de GET /horas-dia: extras e negativas somadas por colaborador num intervalo. */
export interface HorasNoIntervalo {
  de: DataISO
  ate: DataISO
  /** Último dia com horas gravadas até `ate` (null: nenhum). */
  dados_ate: DataISO | null
  colaboradores: {
    id: number
    extra_min: Minutos
    negativa_min: Minutos
    /** Dias que passaram do limite diário da empresa. */
    dias_extra_acima: number
    dias_negativa_acima: number
  }[]
}

/** Resposta de GET /colaboradores/:id/dias. */
export interface DiasColaborador {
  de: DataISO
  ate: DataISO
  /** 0 = sem alerta diário. */
  limites: { extra_dia: Minutos; negativa_dia: Minutos }
  dias: {
    dia: DataISO
    extra_min: Minutos
    negativa_min: Minutos
    /** Entradas e saídas do dia ("09:33"). */
    marcacoes: string[]
    extra_acima: boolean
    negativa_acima: boolean
  }[]
}

/** Batida do log da FriPonto dentro de um dia (GET /colaboradores/:id/dias-detalhe). */
export interface BatidaDoDia {
  /** 'HH:MM' */
  hora: string
  /** 0 Original, 1 Manual, 2 Pré-assinalada, 3 Desconsiderada */
  tipo: TipoBatida
  /** Mesma tabela de origens de Batida. */
  origem: number
  equipamento_id: number | null
  /** Quando a marcação entrou na FriPonto (horário local, sem fuso). */
  incluida_em: string | null
}

/** Resposta de GET /colaboradores/:id/dias-detalhe: dias com horas calculadas, batidas e marca de limite diário. */
export interface DiasDetalhe {
  de: DataISO
  ate: DataISO
  /** 0 = sem alerta diário. */
  limites: { extra_dia: Minutos; negativa_dia: Minutos }
  dias: {
    dia: DataISO
    /** false: o dia só tem batidas, ainda sem horas calculadas pela coleta. */
    tem_calculo: boolean
    extra_min: Minutos
    negativa_min: Minutos
    /** Entradas e saídas que entraram no cálculo, na ordem das colunas; pode trazer 'FOLGA', 'FALTA' etc. */
    marcacoes: string[]
    extra_acima: boolean
    negativa_acima: boolean
    batidas: BatidaDoDia[]
  }[]
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
  /** empresa da unidade em tempo real */
  tempo_real?: boolean
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
  /** Última fotografia publicada (no tempo real, o último fechamento do mês); pode vir null com `colaboradores` já preenchido. */
  fechamento: FechamentoPublicado | null
  tempo_real: TempoRealDashboard
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
  /** Modo da empresa do colaborador: no tempo real o histórico é por dia. */
  modo_extracao: ModoExtracao
  resumo: {
    /** null quando a fonte é o tempo real. */
    fechamento_id: number | null
    /** No tempo real, a data até onde vão os dados (hoje). */
    data_referencia: DataISO
    /** Início do período de apuração dos números. */
    periodo_inicio: DataISO
    fonte: FonteDados
    atualizado_em: DataHoraISO | null
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

/** Item de GET /colaboradores/:id/historico-diario (empresa em tempo real), do dia mais recente para o mais antigo. */
export interface DiaHistorico {
  dia: DataISO
  periodo_inicio: DataISO
  unidade: { id: number; nome: string }
  /** Diferença para o dia anterior registrado no mesmo período; null no primeiro dia registrado do período. */
  extra_dia: Minutos | null
  negativa_dia: Minutos | null
  pagas_dia: Minutos | null
  banco_dia: Minutos | null
  extra_periodo: Minutos
  negativa_periodo: Minutos
  pagas_periodo: Minutos
  banco_periodo: Minutos
  saldo_total: Minutos
  atualizado_em: DataHoraISO
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
  /** RH e gestores ativos */
  qtd_usuarios: number
  razao_social: string | null
  /** só dígitos */
  cnpj: string | null
  /** data URL (PNG, JPG ou WebP, até 256px) */
  logo: string | null
  responsavel: string | null
  email_contato: string | null
  /** só dígitos, com DDD */
  telefone: string | null
  cidade: string | null
  uf: string | null
  observacoes: string | null
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
  /** Modo, dia e hora: RH e equipe alteram; o resto do calendário é só da equipe. */
  modo_extracao: ModoExtracao
  /** 0 = domingo … 6 = sábado */
  dia_semana_extracao: number
  hora_extracao: string
  dia_fechamento_mes: number
  dias_apos_fechamento_mes: number
  origem_horas_pagas: 'teto' | 'coluna_secullum'
  teto_horas_pagas_minutos: Minutos
  teto_periodicidade: 'semanal' | 'mensal'
  alerta_saldo_positivo_minutos: Minutos
  alerta_saldo_negativo_minutos: Minutos
  /** Limites diários: passou disso num dia, o dia é marcado. 0 = sem alerta. */
  alerta_extra_dia_minutos: Minutos
  alerta_negativa_dia_minutos: Minutos
  fuso_horario: string
  cota_calcular_por_hora: number
  atualizado_em: DataHoraISO
  atualizado_por: Pessoa | null
  /** Só leitura: a regra de horas pagas ou o mapeamento mudou e o saldo do histórico ainda está sendo recalculado. */
  recalculo_pendente: boolean
  /** Só leitura: quanto leva para atualizar todo mundo uma vez no tempo real (null sem colaboradores). */
  tempo_real_estimativa: { colaboradores: number; minutos_por_rodada: number | null }
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
  /** derivado do alcance do grupo: rh = empresa toda, gestor = unidades vinculadas */
  perfil: PerfilCliente
  grupo: { id: number; nome: string; alcance: AlcanceGrupo; telas: Tela[] }
  cargo: string | null
  telefone: string | null
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
  cargo: string | null
  telefone: string | null
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

/* ---------- Integração FriPonto (Configuração → Integração FriPonto) ---------- */

/** Quem disparou uma ação: equipe Scale IA ou usuário da empresa cliente. */
export interface AtorIntegracao {
  tipo: TipoUsuario
  nome: string
}

/** GET /integracao/status */
export interface StatusIntegracao {
  empresa: {
    id: number
    nome: string
    credenciais_configuradas: boolean
    sincronizado_em: DataHoraISO | null
    sincronizacao_solicitada_em: DataHoraISO | null
    sincronizacao_pendente: boolean
  }
  worker: { online: boolean; visto_em: DataHoraISO | null; status: string | null }
  /** `libera_em`: com a cota cheia, quando abre a próxima vaga. */
  cota: { usadas_ultima_hora: number; limite_por_hora: number; libera_em: DataHoraISO | null }
  fila: { pendentes: number; processando: number; falhas: number }
  /** Lote em extração (ciclos com fechamento na fila); null sem nada na fila. */
  progresso: ProgressoExtracao | null
  tempo_real: {
    ativo: boolean
    colaboradores: number
    atualizados_ultima_hora: number
    mais_antigo_em: DataHoraISO | null
    mais_recente_em: DataHoraISO | null
    minutos_por_rodada: number | null
  }
  /** Unidades que este usuário pode puxar (gestor: só as dele). */
  unidades: { id: number; nome: string }[]
}

/** Em colaboradores (uma chamada de cálculo por colaborador). */
export interface ProgressoExtracao {
  total: number
  feitos: number
  restantes: number
  /** Estimativa pela cota da FriPonto; null com o serviço de extração offline. */
  previsao_fim: DataHoraISO | null
  fechamentos: {
    id: number
    status: StatusFechamento
    tentativas: number
    proxima_tentativa_em: DataHoraISO | null
    tipo: TipoCiclo
    periodo_inicio: DataISO
    data_referencia: DataISO
    unidade: string
    total: number
    feitos: number
  }[]
}

/** POST /integracao/cadastros (202) */
export interface PedidoCadastrosResposta {
  solicitado_em: DataHoraISO
  /** já havia uma sincronização na fila: nada novo foi pedido */
  ja_pendente?: boolean
}

/** GET /integracao/atividade: o que está sendo puxado da FriPonto agora e falhas recentes. */
export interface AtividadeIntegracao {
  sincronizando: boolean
  tarefas: { cadastros: number; fechamentos: number; tempo_real: number; batidas: number }
  worker_online: boolean
  /** Só para RH e equipe; vazio para o gestor. */
  erros: { chave: string; origem: string; empresa: string; mensagem: string; em: DataHoraISO }[]
  /** Colaboradores do lote em extração (barra do indicador); null sem lote ou sem empresa em foco. */
  progresso: { total: number; feitos: number } | null
  /** Extração parada esperando a cota da FriPonto (ou nova tentativa): quando volta. */
  retoma_em: DataHoraISO | null
}

/** POST /integracao/sincronizar (Atualização dos dados → Forçar sincronização). */
export interface ForcarSincronizacaoResposta {
  cadastros: { solicitado_em: DataHoraISO; ja_pendente: boolean }
  batidas: boolean
  /** Só para empresa em tempo real. */
  tempo_real: PedidoTempoRealResposta | null
}

/** POST /integracao/tempo-real/atualizar (202): colaboradores do escopo postos no início da fila do tempo real. */
export interface PedidoTempoRealResposta {
  colaboradores: number
  /** Quanto leva para atualizar todos (cota da FriPonto); null sem estimativa. */
  minutos_estimados: number | null
}

/** Item da prévia de "Puxar dados"; no tempo real só vêm fechamentos do mês (`tipo` sempre 'fechamento_mes'). */
export interface SemanaPrevia {
  data_referencia: DataISO
  periodo_inicio: DataISO
  tipo: TipoCiclo
  /** Semana que ainda não tinha sido puxada (será criada). */
  nova: boolean
  /** Semana depois do fim, já publicada, refeita junto para manter os saldos. */
  dependente: boolean
}

/** GET /integracao/dados/previa */
export interface PreviaDadosIntegracao {
  semanas: SemanaPrevia[]
  fechamentos: number
  dependentes: number
  ignorados_em_processamento: number
  colaboradores_estimados: number
  chamadas_estimadas: number
  horas_estimadas: number
}

/** POST /integracao/dados (202) */
export interface PedidoDadosResposta {
  fechamentos: number
  ciclos_criados: number
  dependentes: number
}

/** Item de GET /integracao/execucoes */
export interface ExecucaoIntegracao {
  id: number
  fechamento_id: number
  unidade: { id: number; nome: string }
  data_referencia: DataISO
  status: ExecucaoResumo['status']
  disparo: ExecucaoResumo['disparo']
  disparado_por: AtorIntegracao | null
  processados: number
  total_colaboradores: number | null
  com_erro: number
  iniciado_em: DataHoraISO
  finalizado_em: DataHoraISO | null
  mensagem_erro: string | null
}

/** Item de GET /integracao/historico */
export interface RegistroHistoricoIntegracao {
  id: number
  criado_em: DataHoraISO
  acao: string
  /** Texto pronto em português. */
  descricao: string
  ator: AtorIntegracao | null
  dados: Record<string, unknown> | null
}

/* ---------- Batidas (log de marcações da FriPonto) ---------- */

/** 0 Original, 1 Manual, 2 Pré-assinalada, 3 Desconsiderada (FonteDados da Secullum). */
export type TipoBatida = 0 | 1 | 2 | 3
export type FiltroTipoBatida = 'todas' | 'validas' | 'manuais' | 'desconsideradas'

export interface Batida {
  id: number
  data: DataISO
  /** 'HH:MM' no horário local da empresa */
  hora: string
  tipo: TipoBatida
  /** 0 Desconhecida, 1 Relógio, 2 Incluída manualmente, 3 Pré-assinalada, 4 Check-in, 5 Web, 6 App, 7 App offline, 8 Integração */
  origem: number
  equipamento_id: number | null
  /** quando a marcação entrou na FriPonto (horário local, sem fuso) */
  incluida_em: string | null
  colaborador: { id: number; nome: string; funcao: string | null }
  unidade: { id: number; nome: string }
}

export interface BatidasResposta extends Paginado<Batida> {
  importado_em: DataHoraISO | null
}
