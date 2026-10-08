import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEmpresaAdmin, useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento } from '../../components/Estados'
import {
  IconeAlerta,
  IconeAtividade,
  IconeCalendario,
  IconeChave,
  IconeCheck,
  IconeRelogio,
  IconeSincronizar,
  IconeUsuarios,
} from '../../components/Icones'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { PilulaStatus } from '../../components/PilulaStatus'
import { alertarSucesso } from '../../lib/alertas'
import { api } from '../../lib/api'
import { formatarData, formatarDataHora, formatarHoraOuData, formatarIntervalo, formatarQuando } from '../../lib/formato'
import { mensagemAmigavel, pausaPorCota, textoDuracao } from '../../lib/mensagens'
import { NOME_PERFIL } from '../../lib/preferencias'
import { avisarSincronizacaoPedida } from '../../lib/sincronizacao'
import { useRecurso } from '../../lib/useRecurso'
import type {
  AtorIntegracao,
  ExecucaoIntegracao,
  Paginado,
  PedidoCadastrosResposta,
  PedidoTempoRealResposta,
  RegistroHistoricoIntegracao,
  StatusIntegracao,
} from '../../types/api'
import { caminhoFechamentos } from './navegacao'
import { PuxarDados } from './PuxarDados'
import './integracao.css'
import { TituloPagina } from '../../components/TituloPagina'

const INTERVALO_ATUALIZACAO_MS = 10_000
const POR_PAGINA_EXECUCOES = 10
const POR_PAGINA_HISTORICO = 10

/** "12 colaboradores entram na frente da fila; leva ~25 min para atualizar todos." */
function textoTempoRealForcado({ colaboradores, minutos_estimados }: PedidoTempoRealResposta) {
  if (colaboradores === 0) return 'Nenhum colaborador para atualizar agora.'
  const quem =
    colaboradores === 1
      ? '1 colaborador entra na frente da fila'
      : `${colaboradores.toLocaleString('pt-BR')} colaboradores entram na frente da fila`
  return minutos_estimados != null
    ? `${quem}; leva ~${formatarIntervalo(minutos_estimados)} para atualizar ${colaboradores === 1 ? 'ele' : 'todos'}.`
    : `${quem}.`
}

/* Configuração → Integração FriPonto. Equipe e RH veem a empresa toda e puxam cadastros e dados;
   o gestor vê a mesma tela, mas só puxa dados das unidades dele (o server filtra `unidades`). */
export function IntegracaoFriPonto() {
  const { perfil, telas } = useAuth()
  const { empresaId, query, ehAdmin } = useEmpresaSelecionada()
  const [pedindoCadastros, setPedindoCadastros] = useState(false)
  const [forcandoTempoReal, setForcandoTempoReal] = useState(false)
  const [paginaExecucoes, setPaginaExecucoes] = useState(1)
  const [paginaHistorico, setPaginaHistorico] = useState(1)

  useEffect(() => {
    document.title = 'Integração FriPonto Copiloto de Ponto'
  }, [])

  const status = useRecurso(
    (signal) => api<StatusIntegracao>('/integracao/status', { signal, query }),
    `integracao-status-${empresaId}`,
  )
  const execucoes = useRecurso(
    (signal) =>
      api<Paginado<ExecucaoIntegracao>>('/integracao/execucoes', {
        signal,
        query: { ...query, pagina: paginaExecucoes, por_pagina: POR_PAGINA_EXECUCOES },
      }),
    `integracao-execucoes-${empresaId}-${paginaExecucoes}`,
  )
  const historico = useRecurso(
    (signal) =>
      api<Paginado<RegistroHistoricoIntegracao>>('/integracao/historico', {
        signal,
        query: { ...query, pagina: paginaHistorico, por_pagina: POR_PAGINA_HISTORICO },
      }),
    `integracao-historico-${empresaId}-${paginaHistorico}`,
  )

  const dados = status.dados
  const podePuxarCadastros = perfil === 'admin' || perfil === 'rh'
  const linkFechamentos = caminhoFechamentos(telas)

  // atualiza sozinha enquanto houver algo andando (mesmo esquema do painel de fechamentos)
  const recarregarStatus = status.recarregar
  const recarregarExecucoes = execucoes.recarregar
  const recarregarHistorico = historico.recarregar
  const ativo =
    Boolean(dados && (dados.fila.pendentes > 0 || dados.fila.processando > 0 || dados.empresa.sincronizacao_pendente)) ||
    (execucoes.dados?.itens ?? []).some((execucao) => execucao.status === 'processando')
  useEffect(() => {
    if (!ativo) return
    const timer = window.setInterval(() => {
      recarregarStatus()
      recarregarExecucoes()
    }, INTERVALO_ATUALIZACAO_MS)
    return () => window.clearInterval(timer)
  }, [ativo, recarregarStatus, recarregarExecucoes])

  function aposPedido(texto: string) {
    alertarSucesso(texto, 'Pedido enviado')
    avisarSincronizacaoPedida()
    recarregarStatus()
    setPaginaExecucoes(1)
    recarregarExecucoes()
    setPaginaHistorico(1)
    recarregarHistorico()
  }

  // empresa em tempo real: sem fotografia semanal, "Puxar dados" vira "Refazer fechamento do mês"
  const tempoReal = Boolean(dados?.tempo_real?.ativo)
  const semCredenciais = dados ? !dados.empresa.credenciais_configuradas : false
  const bloqueio = semCredenciais ? 'Disponível depois que as credenciais do FriPonto forem configuradas.' : null
  const semUnidades =
    perfil === 'gestor'
      ? 'Nenhuma unidade vinculada a você. Peça ao RH para vincular suas unidades.'
      : 'Nenhuma unidade sincronizada ainda. Puxe os cadastros primeiro.'

  return (
    <section className="pagina integ">
      <TituloPagina>Integração FriPonto</TituloPagina>

      {status.carregando && <Carregando texto="Carregando integração..." />}
      {status.erro && <ErroCarregamento erro={status.erro} onTentarDeNovo={status.recarregar} />}

      {dados && (
        <>
          <ResumoIntegracao status={dados} ehAdmin={ehAdmin} linkFechamentos={linkFechamentos} />
          <ProgressoExtracaoLote status={dados} linkFechamentos={linkFechamentos} />
          <CartoesStatus
            status={dados}
            podeConfigurar={podePuxarCadastros}
            podeAtualizarTempoReal={!semCredenciais && dados.unidades.length > 0}
            onAtualizarTempoReal={() => setForcandoTempoReal(true)}
          />

          <div className={podePuxarCadastros ? 'integ-acoes' : 'integ-acoes integ-acoes-unica'}>
            {podePuxarCadastros && (
              <section className="integ-bloco" aria-labelledby="titulo-puxar-cadastros">
                <div className="integ-acao-titulo">
                  <span className="integ-acao-icone" aria-hidden="true">
                    <IconeUsuarios tamanho={20} />
                  </span>
                  <div>
                    <h2 id="titulo-puxar-cadastros">Puxar cadastros</h2>
                    <p className="integ-bloco-sub">Unidades e colaboradores</p>
                  </div>
                </div>
                <p className="integ-texto">
                  Atualiza as unidades e os colaboradores de <strong>{dados.empresa.nome}</strong> com o que está no FriPonto.
                  As horas já publicadas não mudam. O serviço de extração atende o pedido em até 1 minuto.
                </p>
                {dados.empresa.sincronizacao_pendente && (
                  <p className="integ-texto">
                    Já há uma sincronização na fila
                    {dados.empresa.sincronizacao_solicitada_em &&
                      `, pedida em ${formatarDataHora(dados.empresa.sincronizacao_solicitada_em)}`}
                    .
                  </p>
                )}
                {semCredenciais && <p className="integ-texto">{bloqueio}</p>}
                <dl className="integ-fatos">
                  <div>
                    <dt>Última atualização</dt>
                    <dd>{dados.empresa.sincronizado_em ? quandoMaiusculo(dados.empresa.sincronizado_em) : 'Nunca'}</dd>
                  </div>
                  <div>
                    <dt>Situação</dt>
                    <dd>{dados.empresa.sincronizacao_pendente ? 'Na fila' : 'Em dia'}</dd>
                  </div>
                </dl>
                <div className="integ-botoes integ-botoes-rodape">
                  <button
                    type="button"
                    className="integ-botao"
                    onClick={() => setPedindoCadastros(true)}
                    disabled={semCredenciais || dados.empresa.sincronizacao_pendente}
                  >
                    Puxar cadastros
                  </button>
                </div>
              </section>
            )}

            <section className="integ-bloco" aria-labelledby="titulo-puxar-dados">
              <div className="integ-acao-titulo">
                <span className="integ-acao-icone" aria-hidden="true">
                  <IconeCalendario tamanho={20} />
                </span>
                <div>
                  <h2 id="titulo-puxar-dados">{tempoReal ? 'Refazer fechamento do mês' : 'Puxar dados'}</h2>
                  <p className="integ-bloco-sub">
                    {tempoReal ? 'Fechamentos do mês de um período' : 'Horas das semanas de um período'}
                    {perfil === 'gestor' ? ' nas suas unidades' : ''}
                  </p>
                </div>
              </div>
              <PuxarDados status={dados} query={query} bloqueio={bloqueio} semUnidades={semUnidades} onPedido={aposPedido} />
            </section>
          </div>
        </>
      )}

      <section className="integ-bloco integ-bloco-tabela" aria-labelledby="titulo-execucoes">
        <div className="integ-bloco-cabecalho">
          <div>
            <h2 id="titulo-execucoes">Execuções recentes</h2>
            <p className="integ-bloco-sub">
              {ativo
                ? 'Atualiza sozinha a cada 10 segundos enquanto houver extração em andamento.'
                : 'Extrações automáticas e pedidas manualmente.'}
            </p>
          </div>
          <button type="button" className="btn-link" onClick={execucoes.recarregar}>
            Atualizar
          </button>
        </div>

        {execucoes.carregando && <Carregando texto="Carregando execuções..." />}
        {execucoes.erro && <ErroCarregamento erro={execucoes.erro} onTentarDeNovo={execucoes.recarregar} />}
        {execucoes.dados && execucoes.dados.itens.length === 0 && (
          <SemItens pagina={paginaExecucoes} texto="Nenhuma execução ainda." onVoltar={() => setPaginaExecucoes(1)} />
        )}
        {execucoes.dados && execucoes.dados.itens.length > 0 && (
          <>
            <TabelaExecucoes execucoes={execucoes.dados.itens} linkFechamentos={linkFechamentos} tempoReal={tempoReal} />
            <Paginacao
              total={execucoes.dados.total}
              pagina={paginaExecucoes}
              porPagina={POR_PAGINA_EXECUCOES}
              nome={['execução', 'execuções']}
              onMudar={setPaginaExecucoes}
            />
          </>
        )}
      </section>

      <section className="integ-bloco" aria-labelledby="titulo-historico">
        <div className="integ-bloco-cabecalho">
          <div>
            <h2 id="titulo-historico">Histórico de solicitações</h2>
            <p className="integ-bloco-sub">Quem pediu o quê, e quando.</p>
          </div>
          <button type="button" className="btn-link" onClick={historico.recarregar}>
            Atualizar
          </button>
        </div>

        {historico.carregando && <Carregando texto="Carregando histórico..." />}
        {historico.erro && <ErroCarregamento erro={historico.erro} onTentarDeNovo={historico.recarregar} />}
        {historico.dados && historico.dados.itens.length === 0 && (
          <SemItens pagina={paginaHistorico} texto="Nenhuma solicitação registrada ainda." onVoltar={() => setPaginaHistorico(1)} />
        )}
        {historico.dados && historico.dados.itens.length > 0 && (
          <>
            <ListaHistorico registros={historico.dados.itens} />
            <Paginacao
              total={historico.dados.total}
              pagina={paginaHistorico}
              porPagina={POR_PAGINA_HISTORICO}
              nome={['registro', 'registros']}
              onMudar={setPaginaHistorico}
            />
          </>
        )}
      </section>

      {pedindoCadastros && dados && (
        <ModalConfirmacao
          titulo="Puxar cadastros"
          rotuloConfirmar="Puxar cadastros"
          motivo="opcional"
          onFechar={() => setPedindoCadastros(false)}
          onConfirmar={async (motivo) => {
            const resposta = await api<PedidoCadastrosResposta>('/integracao/cadastros', {
              method: 'POST',
              query,
              json: { motivo },
            })
            setPedindoCadastros(false)
            aposPedido(
              resposta.ja_pendente
                ? `Já existe uma sincronização de cadastros na fila (pedida em ${formatarDataHora(resposta.solicitado_em)}). O serviço de extração atende em até 1 minuto.`
                : `Sincronização de cadastros pedida em ${formatarDataHora(resposta.solicitado_em)}. O serviço de extração atende em até 1 minuto.`,
            )
          }}
        >
          <p>
            Busca no FriPonto as unidades e os colaboradores de <strong>{dados.empresa.nome}</strong>. Unidades novas aparecem
            em Configuração → Unidades; as horas já publicadas não mudam.
          </p>
          {!dados.worker.online && <p>O serviço de extração está offline: o pedido fica na fila até ele voltar.</p>}
        </ModalConfirmacao>
      )}

      {forcandoTempoReal && dados && (
        <ModalConfirmacao
          titulo="Atualizar todos agora"
          rotuloConfirmar="Atualizar todos agora"
          motivo="opcional"
          onFechar={() => setForcandoTempoReal(false)}
          onConfirmar={async (motivo) => {
            // 400 (empresa fora do tempo real) e 429 (limite de pedidos) aparecem no modal com a mensagem do server
            const resposta = await api<PedidoTempoRealResposta>('/integracao/tempo-real/atualizar', {
              method: 'POST',
              query,
              json: { motivo },
            })
            setForcandoTempoReal(false)
            aposPedido(textoTempoRealForcado(resposta))
          }}
        >
          <p>
            Coloca {perfil === 'gestor' ? 'os colaboradores das suas unidades' : <>os colaboradores de <strong>{dados.empresa.nome}</strong></>}{' '}
            no início da fila do tempo real, para que os números do painel sejam atualizados antes dos demais.
          </p>
          <p>
            A cota de consultas da FriPonto continua valendo: com muitos colaboradores, atualizar todos ainda leva o tempo de
            uma rodada
            {dados.tempo_real.minutos_por_rodada != null && (
              <>
                {' '}
                (<strong>~{formatarIntervalo(dados.tempo_real.minutos_por_rodada)}</strong>)
              </>
            )}
            .
          </p>
          {!dados.worker.online && <p>O serviço de extração está offline: a atualização começa quando ele voltar.</p>}
        </ModalConfirmacao>
      )}
    </section>
  )
}

/* ---------- Progresso da extração ---------- */

type FechamentoLote = NonNullable<StatusIntegracao['progresso']>['fechamentos'][number]

function nomeCiclo(f: Pick<FechamentoLote, 'tipo' | 'periodo_inicio' | 'data_referencia'>) {
  const periodo = `${formatarData(f.periodo_inicio, { ano: false })} a ${formatarData(f.data_referencia, { ano: false })}`
  return f.tipo === 'fechamento_mes' ? `Fechamento do mês (${periodo})` : `Semana até ${formatarData(f.data_referencia, { ano: false })}`
}

/** Situação de uma unidade no lote, em palavras. */
function situacaoUnidade(f: FechamentoLote, cotaEsgotada: boolean, agora: number): { texto: string; classe: string } {
  if (f.status === 'sucesso') return { texto: 'Publicado', classe: 'pilula-sucesso' }
  if (f.status === 'falhou') return { texto: 'Falhou', classe: 'pilula-falhou' }
  if (f.status === 'processando') return { texto: 'Extraindo', classe: 'pilula-processando' }
  if (f.total > 0 && f.feitos >= f.total) return { texto: 'Publicando', classe: 'pilula-processando' }
  if (f.proxima_tentativa_em && new Date(f.proxima_tentativa_em).getTime() > agora) {
    return { texto: `Nova tentativa às ${formatarHoraOuData(f.proxima_tentativa_em)}`, classe: 'pilula-pendente' }
  }
  if (f.feitos > 0 && cotaEsgotada) return { texto: 'Aguardando cota', classe: 'pilula-pendente' }
  return { texto: 'Na fila', classe: 'pilula-inativo' }
}

function ProgressoExtracaoLote({ status, linkFechamentos }: { status: StatusIntegracao; linkFechamentos: string | null }) {
  const { progresso, cota, worker } = status
  // relógio da tela: o "em ~X" e as novas tentativas andam mesmo entre uma atualização e outra
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  if (!progresso) return null

  const { total, feitos, restantes, previsao_fim: previsao, fechamentos } = progresso
  const pct = total ? Math.floor((feitos / total) * 100) : 0
  const cotaEsgotada = cota.usadas_ultima_hora >= cota.limite_por_hora
  const publicados = fechamentos.filter((f) => f.status === 'sucesso').length
  const ciclos = [...new Map(fechamentos.map((f) => [`${f.tipo}-${f.data_referencia}`, nomeCiclo(f)])).values()]
  const variosCiclos = ciclos.length > 1
  const minutosAteFim = previsao ? (new Date(previsao).getTime() - agora) / 60_000 : null

  return (
    <section className="integ-bloco integ-progresso" aria-labelledby="titulo-progresso">
      <div className="integ-bloco-cabecalho">
        <div>
          {/* a situação (coletando / pausada) fica na faixa do topo; aqui, os números e cada unidade */}
          <h2 id="titulo-progresso">Detalhes da coleta</h2>
          <p className="integ-bloco-sub">
            {ciclos.join(' · ')} · {fechamentos.length} {fechamentos.length === 1 ? 'unidade' : 'unidades'}
          </p>
        </div>
      </div>

      <div className="integ-progresso-numeros">
        <div className="integ-progresso-numero">
          <span className="integ-progresso-valor">{pct}%</span>
          <span className="integ-sub">concluído</span>
        </div>
        <div className="integ-progresso-numero">
          <span className="integ-progresso-valor">
            {feitos}
            <small>/{total}</small>
          </span>
          <span className="integ-sub">colaboradores extraídos</span>
        </div>
        <div className="integ-progresso-numero">
          <span className="integ-progresso-valor">{restantes}</span>
          <span className="integ-sub">{restantes === 1 ? 'falta' : 'faltam'}</span>
        </div>
        <div className="integ-progresso-numero">
          <span className="integ-progresso-valor">{previsao && restantes > 0 ? formatarHoraOuData(previsao) : '—'}</span>
          <span className="integ-sub">
            {!worker.online
              ? 'serviço offline: sem previsão'
              : restantes === 0
                ? 'publicando'
                : `previsão de término${minutosAteFim != null && minutosAteFim > 0 ? ` (em ~${formatarIntervalo(minutosAteFim)})` : ''}`}
          </span>
        </div>
      </div>

      <div
        className="integ-progresso-barra"
        role="progressbar"
        aria-label="Colaboradores extraídos"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={feitos}
      >
        <span style={{ width: `${pct}%` }} />
      </div>

      <p className="integ-sub">
        {publicados} de {fechamentos.length} {fechamentos.length === 1 ? 'unidade publicada' : 'unidades publicadas'}. A FriPonto
        permite {cota.limite_por_hora} cálculos por hora (um por colaborador)
        {cotaEsgotada && cota.libera_em
          ? `; a cota está cheia e volta a liberar às ${formatarHoraOuData(cota.libera_em)}, sem precisar fazer nada.`
          : '.'}
        {linkFechamentos && (
          <>
            {' '}
            Cada unidade aparece em <Link to={linkFechamentos}>Fechamentos</Link> assim que termina.
          </>
        )}
      </p>

      <ul className="integ-progresso-unidades" aria-label="Progresso por unidade">
        {fechamentos.map((f) => {
          const situacao = situacaoUnidade(f, cotaEsgotada, agora)
          const pctUnidade = f.total ? Math.floor((f.feitos / f.total) * 100) : 0
          return (
            <li key={f.id}>
              <span className="integ-progresso-nome">
                {f.unidade}
                {variosCiclos && <span className="integ-sub">{nomeCiclo(f)}</span>}
              </span>
              <span className={`pilula ${situacao.classe}`}>{situacao.texto}</span>
              <span className="integ-progresso-mini" aria-hidden="true">
                <span style={{ width: `${pctUnidade}%` }} />
              </span>
              <span className="integ-progresso-conta">
                {f.feitos}/{f.total}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ---------- Status ---------- */

/** "hoje às 11:58" → "Hoje às 11:58" (abre a frase ou o valor do cartão). */
function quandoMaiusculo(iso: string) {
  const texto = formatarQuando(iso)
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)
}

type TomResumo = 'ok' | 'ativo' | 'pausa' | 'aviso' | 'erro'

const ICONE_RESUMO: Record<TomResumo, typeof IconeCheck> = {
  ok: IconeCheck,
  ativo: IconeSincronizar,
  pausa: IconeRelogio,
  aviso: IconeAlerta,
  erro: IconeAlerta,
}

/**
 * Faixa no topo que responde "está tudo certo?": a situação mais importante agora (sem credenciais,
 * serviço offline, coleta andando ou pausada pela cota, cadastros na fila ou tudo em dia).
 */
function ResumoIntegracao({
  status,
  ehAdmin,
  linkFechamentos,
}: {
  status: StatusIntegracao
  ehAdmin: boolean
  linkFechamentos: string | null
}) {
  const { empresa, worker, fila, progresso, cota } = status
  const coletando = progresso && progresso.restantes > 0 ? progresso : null
  const pct = coletando && coletando.total ? Math.floor((coletando.feitos / coletando.total) * 100) : null
  const cotaEsgotada = cota.usadas_ultima_hora >= cota.limite_por_hora

  let tom: TomResumo
  let titulo: string
  let texto: ReactNode
  if (!empresa.credenciais_configuradas) {
    tom = 'erro'
    titulo = 'Integração não configurada'
    texto = ehAdmin ? (
      <>
        Cadastre as credenciais da FriPonto de {empresa.nome} em <Link to="/admin/empresas">Administração → Empresas</Link> para
        as coletas começarem.
      </>
    ) : (
      'Faltam as credenciais da FriPonto, então nenhuma coleta roda. Fale com a equipe Scale IA.'
    )
  } else if (!worker.online) {
    tom = 'aviso'
    titulo = 'Serviço de extração offline'
    texto = `Os pedidos continuam sendo aceitos e começam quando ele voltar${
      worker.visto_em ? ` (último sinal ${formatarQuando(worker.visto_em)})` : ''
    }.`
  } else if (coletando && cotaEsgotada) {
    tom = 'pausa'
    titulo = cota.libera_em ? `Coleta pausada · retoma ${formatarQuando(cota.libera_em)}` : 'Coleta pausada pela cota'
    texto = `A FriPonto libera ${cota.limite_por_hora} cálculos por hora e eles acabaram. A coleta continua sozinha de onde parou: ${coletando.feitos} de ${coletando.total} colaboradores já vieram.`
  } else if (coletando) {
    tom = 'ativo'
    titulo = 'Coletando dados da FriPonto'
    texto = `${coletando.feitos} de ${coletando.total} colaboradores já vieram${
      coletando.previsao_fim ? `; término previsto ${formatarQuando(coletando.previsao_fim)}` : ''
    }.`
  } else if (empresa.sincronizacao_pendente) {
    tom = 'ativo'
    titulo = 'Atualizando cadastros'
    texto = 'Unidades e colaboradores estão sendo buscados na FriPonto; leva até 1 minuto para começar.'
  } else {
    tom = 'ok'
    titulo = 'Tudo em dia'
    texto = empresa.sincronizado_em
      ? `Nenhuma coleta na fila. Cadastros atualizados ${formatarQuando(empresa.sincronizado_em)}.`
      : 'Nenhuma coleta na fila.'
  }

  const Icone = ICONE_RESUMO[tom]
  return (
    <section className={`integ-resumo integ-resumo-${tom}`} aria-label="Situação da integração" role="status">
      <span className="integ-resumo-icone" aria-hidden="true">
        <Icone tamanho={22} />
      </span>
      <div className="integ-resumo-corpo">
        <h2>{titulo}</h2>
        <p>{texto}</p>
        {fila.falhas > 0 && (
          <p className="integ-resumo-falhas">
            {fila.falhas === 1 ? '1 fechamento falhou' : `${fila.falhas} fechamentos falharam`} nos últimos 60 dias.{' '}
            {linkFechamentos ? <Link to={linkFechamentos}>Ver em Fechamentos</Link> : 'Fale com o RH.'}
          </p>
        )}
      </div>
      {pct !== null && (
        <div className="integ-resumo-medida">
          <span className="integ-resumo-pct">{pct}%</span>
          <span className="integ-resumo-barra" aria-hidden="true">
            <span style={{ width: `${Math.max(pct, 2)}%` }} />
          </span>
        </div>
      )}
    </section>
  )
}

/** Nome do estado do serviço de extração (o worker grava em inglês técnico/curto). */
const ESTADO_WORKER: Record<string, string> = {
  ocioso: 'esperando trabalho',
  rodando: 'trabalhando',
  extraindo: 'extraindo horas',
  parado: 'parado',
}

type TomCartao = 'ok' | 'aviso' | 'erro' | 'neutro'

function CartaoStatus({
  icone: Icone,
  rotulo,
  tom,
  valor,
  children,
}: {
  icone: typeof IconeCheck
  rotulo: string
  /** Com tom, o valor ganha a bolinha de situação (verde, amarelo, vermelho ou cinza). */
  tom?: TomCartao
  valor: ReactNode
  children?: ReactNode
}) {
  return (
    <li className="integ-cartao">
      <div className="integ-cartao-topo">
        <span className="integ-cartao-icone" aria-hidden="true">
          <Icone tamanho={18} />
        </span>
        <span className="integ-rotulo">{rotulo}</span>
      </div>
      <span className={tom ? `integ-estado integ-estado-${tom}` : 'integ-estado'}>{valor}</span>
      {children}
    </li>
  )
}

interface CartoesStatusProps {
  status: StatusIntegracao
  podeConfigurar: boolean
  podeAtualizarTempoReal: boolean
  onAtualizarTempoReal: () => void
}

function CartoesStatus({ status, podeConfigurar, podeAtualizarTempoReal, onAtualizarTempoReal }: CartoesStatusProps) {
  const { empresa, worker, cota } = status
  const limite = Math.max(cota.limite_por_hora, 1)
  const pctCota = Math.min(100, Math.round((cota.usadas_ultima_hora / limite) * 100))
  const livres = Math.max(0, cota.limite_por_hora - cota.usadas_ultima_hora)
  const cotaEsgotada = livres === 0
  const estadoWorker = worker.status ? (ESTADO_WORKER[worker.status] ?? worker.status) : null

  return (
    <ul className="integ-status" aria-label="Detalhes da integração">
      <CartaoStatus
        icone={IconeChave}
        rotulo="Conexão"
        tom={empresa.credenciais_configuradas ? 'ok' : 'erro'}
        valor={empresa.credenciais_configuradas ? 'Conectada' : 'Sem credenciais'}
      >
        <span className="integ-sub">
          {empresa.credenciais_configuradas
            ? `Credenciais da FriPonto de ${empresa.nome}.`
            : 'Sem credenciais, as coletas não rodam.'}
        </span>
      </CartaoStatus>

      <CartaoStatus
        icone={IconeUsuarios}
        rotulo="Cadastros"
        tom={empresa.sincronizacao_pendente ? 'aviso' : undefined}
        valor={
          empresa.sincronizacao_pendente
            ? 'Na fila'
            : empresa.sincronizado_em
              ? quandoMaiusculo(empresa.sincronizado_em)
              : 'Nunca atualizados'
        }
      >
        <span className="integ-sub">
          {empresa.sincronizacao_pendente
            ? `Atualização pedida${
                empresa.sincronizacao_solicitada_em ? ` ${formatarQuando(empresa.sincronizacao_solicitada_em)}` : ''
              }; começa em até 1 minuto.`
            : 'Última atualização de unidades e colaboradores.'}
        </span>
      </CartaoStatus>

      <CartaoStatus
        icone={IconeAtividade}
        rotulo="Serviço de extração"
        tom={worker.online ? 'ok' : 'erro'}
        valor={worker.online ? 'Online' : 'Offline'}
      >
        <span className="integ-sub">
          {worker.online
            ? estadoWorker
              ? `${estadoWorker.charAt(0).toLocaleUpperCase('pt-BR')}${estadoWorker.slice(1)}.`
              : 'Pronto para coletar.'
            : 'Pedidos ficam na fila até ele voltar.'}
          {worker.visto_em && ` Último sinal ${formatarQuando(worker.visto_em)}.`}
        </span>
      </CartaoStatus>

      <CartaoStatus
        icone={IconeRelogio}
        rotulo="Cota da FriPonto"
        tom={cotaEsgotada ? 'aviso' : 'ok'}
        valor={cotaEsgotada ? 'Esgotada' : `${livres} ${livres === 1 ? 'cálculo livre' : 'cálculos livres'}`}
      >
        <span
          className="integ-cota-barra"
          role="progressbar"
          aria-label="Uso da cota na última hora"
          aria-valuemin={0}
          aria-valuemax={cota.limite_por_hora}
          aria-valuenow={cota.usadas_ultima_hora}
        >
          <span className={cotaEsgotada ? 'cheia' : undefined} style={{ width: `${pctCota}%` }} />
        </span>
        <span className="integ-sub">
          {cota.usadas_ultima_hora} de {cota.limite_por_hora} usados na última hora
          {cotaEsgotada && cota.libera_em ? `; volta ${formatarQuando(cota.libera_em)}.` : '.'}
        </span>
      </CartaoStatus>

      <CartaoTempoReal
        tempoReal={status.tempo_real}
        podeConfigurar={podeConfigurar}
        podeAtualizar={podeAtualizarTempoReal}
        onAtualizar={onAtualizarTempoReal}
      />
    </ul>
  )
}

interface CartaoTempoRealProps {
  tempoReal: StatusIntegracao['tempo_real'] | undefined
  podeConfigurar: boolean
  /** Sem credenciais ou sem unidades, não há quem atualizar. */
  podeAtualizar: boolean
  onAtualizar: () => void
}

function CartaoTempoReal({ tempoReal, podeConfigurar, podeAtualizar, onAtualizar }: CartaoTempoRealProps) {
  if (!tempoReal?.ativo) {
    return (
      <CartaoStatus icone={IconeCalendario} rotulo="Atualização" tom="neutro" valor="Semanal">
        <span className="integ-sub">
          Os dados são puxados uma vez por semana.
          {podeConfigurar && (
            <>
              {' '}
              <Link to="/configuracao/atualizacao">Mudar dia, hora ou modo</Link>
            </>
          )}
        </span>
      </CartaoStatus>
    )
  }

  const { colaboradores, atualizados_ultima_hora, mais_recente_em, minutos_por_rodada } = tempoReal
  return (
    <CartaoStatus icone={IconeCalendario} rotulo="Atualização" tom="ok" valor="Tempo real">
      <span className="integ-sub">
        {atualizados_ultima_hora} de {colaboradores} colaboradores atualizados na última hora
        {minutos_por_rodada != null && <> (cada um a cada ~{formatarIntervalo(minutos_por_rodada)})</>}
        {mais_recente_em && `; o mais recente ${formatarQuando(mais_recente_em)}`}.
      </span>
      <button type="button" className="integ-botao integ-cartao-botao" onClick={onAtualizar} disabled={!podeAtualizar}>
        Atualizar todos agora
      </button>
    </CartaoStatus>
  )
}

/* ---------- Execuções ---------- */

/** Quem pediu: a etiqueta "Equipe Scale IA" × "Cliente" só aparece para a própria equipe. */
function TagAtor({ ator }: { ator: AtorIntegracao }) {
  const { ehAdmin } = useEmpresaAdmin()
  if (!ehAdmin) return null
  return ator.tipo === 'equipe' ? (
    <span className="integ-tag integ-tag-equipe">{NOME_PERFIL.admin}</span>
  ) : (
    <span className="integ-tag">Cliente</span>
  )
}

function Disparo({ execucao }: { execucao: ExecucaoIntegracao }) {
  if (execucao.disparo === 'automatico') return <>Automático</>
  return (
    <span className="integ-disparo">
      Manual
      {execucao.disparado_por && (
        <>
          {` · ${execucao.disparado_por.nome}`}
          <TagAtor ator={execucao.disparado_por} />
        </>
      )}
    </span>
  )
}

function Progresso({ execucao }: { execucao: ExecucaoIntegracao }) {
  const total = execucao.total_colaboradores ?? 0
  const pct = total ? Math.min(100, Math.round((execucao.processados / total) * 100)) : 0
  return (
    <div className="progresso">
      <div
        className="progresso-barra"
        role="progressbar"
        aria-label={`Progresso de ${execucao.unidade.nome}`}
        aria-valuemin={0}
        aria-valuemax={total || undefined}
        aria-valuenow={execucao.processados}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="progresso-texto">
        {execucao.processados}/{total || '?'}
      </span>
    </div>
  )
}

function Erros({ execucao }: { execucao: ExecucaoIntegracao }) {
  return execucao.com_erro > 0 ? (
    <span className="texto-negativo">{execucao.com_erro}</span>
  ) : (
    <span className="texto-suave">0</span>
  )
}

function Horario({ execucao }: { execucao: ExecucaoIntegracao }) {
  return (
    <>
      {quandoMaiusculo(execucao.iniciado_em)}
      <span className="celula-sub">
        {execucao.finalizado_em ? `Fim ${formatarHoraOuData(execucao.finalizado_em)} · ${textoDuracao(execucao)}` : 'Em andamento'}
      </span>
    </>
  )
}

/** Parou porque a cota da FriPonto acabou: não é erro, retoma sozinha. */
const pausadaPorCota = (execucao: ExecucaoIntegracao) =>
  execucao.status === 'interrompida' && pausaPorCota(execucao.mensagem_erro)

function StatusExecucao({ execucao }: { execucao: ExecucaoIntegracao }) {
  return pausadaPorCota(execucao) ? <span className="pilula pilula-pausada">Pausada</span> : <PilulaStatus status={execucao.status} />
}

function MensagemErro({ execucao }: { execucao: ExecucaoIntegracao }) {
  if (!execucao.mensagem_erro || execucao.status === 'sucesso') return null
  const mensagem = mensagemAmigavel(execucao.mensagem_erro)
  return (
    <span className={pausadaPorCota(execucao) ? 'celula-nota' : 'celula-motivo'}>
      {mensagem.length > 160 ? `${mensagem.slice(0, 160)}…` : mensagem}
    </span>
  )
}

interface TabelaExecucoesProps {
  execucoes: ExecucaoIntegracao[]
  linkFechamentos: string | null
  /** Empresa em tempo real: as execuções são de fechamentos do mês (ou fotografias antigas), não de "semanas". */
  tempoReal: boolean
}

function TabelaExecucoes({ execucoes, linkFechamentos, tempoReal }: TabelaExecucoesProps) {
  const nomeUnidade = (execucao: ExecucaoIntegracao) =>
    linkFechamentos ? (
      <Link to={`${linkFechamentos}/${execucao.fechamento_id}`}>{execucao.unidade.nome}</Link>
    ) : (
      execucao.unidade.nome
    )

  return (
    <>
      <div className="table-wrap tabela-desktop integ-tabela">
        <table>
          <caption className="sr-only">Execuções recentes</caption>
          <thead>
            <tr>
              <th scope="col">Unidade</th>
              <th scope="col">{tempoReal ? 'Referência' : 'Semana'}</th>
              <th scope="col">Status</th>
              <th scope="col">Disparo</th>
              <th scope="col">Progresso</th>
              <th scope="col" className="num">
                Erros
              </th>
              <th scope="col">Início / fim</th>
            </tr>
          </thead>
          <tbody>
            {execucoes.map((execucao) => (
              <tr key={execucao.id} className={execucao.status === 'falhou' ? 'linha-negativo' : undefined}>
                <th scope="row" className="celula-nome">
                  {nomeUnidade(execucao)}
                </th>
                <td>Até {formatarData(execucao.data_referencia)}</td>
                <td>
                  <StatusExecucao execucao={execucao} />
                  <MensagemErro execucao={execucao} />
                </td>
                <td>
                  <Disparo execucao={execucao} />
                </td>
                <td>
                  <Progresso execucao={execucao} />
                </td>
                <td className="num">
                  <Erros execucao={execucao} />
                </td>
                <td>
                  <Horario execucao={execucao} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="cartoes-admin" aria-label="Execuções recentes">
        {execucoes.map((execucao) => (
          <li key={execucao.id} className="cartao-admin">
            <div className="cartao-admin-topo">
              <span className="cartao-admin-titulo">
                {execucao.unidade.nome}
                <span className="celula-sub">
                  {tempoReal ? 'Dados até' : 'Semana até'} {formatarData(execucao.data_referencia)}
                </span>
              </span>
              <StatusExecucao execucao={execucao} />
            </div>
            <MensagemErro execucao={execucao} />
            <Disparo execucao={execucao} />
            <Progresso execucao={execucao} />
            {execucao.com_erro > 0 && (
              <span className="texto-negativo">
                {execucao.com_erro} colaborador{execucao.com_erro === 1 ? '' : 'es'} com erro
              </span>
            )}
            <span>
              <Horario execucao={execucao} />
            </span>
            {linkFechamentos && (
              <div className="barra-acoes">
                <Link to={`${linkFechamentos}/${execucao.fechamento_id}`} className="btn-link">
                  Ver fechamento
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/* ---------- Histórico ---------- */

function motivoDe(registro: RegistroHistoricoIntegracao) {
  const motivo = registro.dados?.motivo
  return typeof motivo === 'string' && motivo.trim() ? motivo.trim() : null
}

function ListaHistorico({ registros }: { registros: RegistroHistoricoIntegracao[] }) {
  return (
    <ul className="integ-historico">
      {registros.map((registro) => {
        const motivo = motivoDe(registro)
        return (
          <li key={registro.id}>
            <time dateTime={registro.criado_em} title={formatarDataHora(registro.criado_em)}>
              {quandoMaiusculo(registro.criado_em)}
            </time>
            <div className="integ-historico-corpo">
              <span className="integ-historico-descricao">{registro.descricao}</span>
              <span className="integ-historico-ator">
                {registro.ator ? (
                  <>
                    {registro.ator.nome}
                    <TagAtor ator={registro.ator} />
                  </>
                ) : (
                  'Sistema'
                )}
              </span>
              {motivo && (
                <p className="integ-historico-motivo">
                  <strong>Motivo:</strong> {motivo}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ---------- Comuns ---------- */

function SemItens({ pagina, texto, onVoltar }: { pagina: number; texto: string; onVoltar: () => void }) {
  return (
    <p className="integ-vazio">
      {pagina > 1 ? (
        <button type="button" className="btn-link" onClick={onVoltar}>
          Voltar para a primeira página
        </button>
      ) : (
        texto
      )}
    </p>
  )
}

interface PaginacaoProps {
  total: number
  pagina: number
  porPagina: number
  nome: [string, string]
  onMudar: (pagina: number) => void
}

function Paginacao({ total, pagina, porPagina, nome, onMudar }: PaginacaoProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  return (
    <nav className="paginacao" aria-label={`Paginação de ${nome[1]}`}>
      <span>
        {total} {total === 1 ? nome[0] : nome[1]}
        {totalPaginas > 1 && ` · página ${pagina} de ${totalPaginas}`}
      </span>
      {totalPaginas > 1 && (
        <div className="barra-acoes">
          <button type="button" className="btn-secondary" disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)}>
            Anterior
          </button>
          <button type="button" className="btn-secondary" disabled={pagina >= totalPaginas} onClick={() => onMudar(pagina + 1)}>
            Próxima
          </button>
        </div>
      )}
    </nav>
  )
}
