import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Aviso, Carregando, ErroCarregamento } from '../../components/Estados'
import { IconeCalendario, IconeUsuarios } from '../../components/Icones'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { PilulaStatus } from '../../components/PilulaStatus'
import { api } from '../../lib/api'
import { formatarData, formatarDataHora, formatarDuracao, formatarHoraOuData, formatarIntervalo } from '../../lib/formato'
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
  const [mensagem, setMensagem] = useState('')
  const [pedindoCadastros, setPedindoCadastros] = useState(false)
  const [forcandoTempoReal, setForcandoTempoReal] = useState(false)
  const [paginaExecucoes, setPaginaExecucoes] = useState(1)
  const [paginaHistorico, setPaginaHistorico] = useState(1)

  useEffect(() => {
    document.title = 'Integração FriPonto — Copiloto de Ponto'
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
    setMensagem(texto)
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
      <header className="pagina-header">
        <TituloPagina>Integração FriPonto</TituloPagina>
        <p className="pagina-sub">Situação da conexão com o FriPonto e pedidos de nova extração de cadastros e de horas.</p>
      </header>

      {mensagem && (
        <p className="form-ok" role="status">
          {mensagem}
        </p>
      )}

      {status.carregando && <Carregando texto="Carregando integração..." />}
      {status.erro && <ErroCarregamento erro={status.erro} onTentarDeNovo={status.recarregar} />}

      {dados && (
        <>
          <AvisosStatus status={dados} ehAdmin={ehAdmin} />
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
                <div className="integ-botoes">
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

/* ---------- Status ---------- */

function AvisosStatus({ status, ehAdmin }: { status: StatusIntegracao; ehAdmin: boolean }) {
  const { empresa, worker } = status
  if (empresa.credenciais_configuradas && worker.online) return null

  return (
    <div className="integ-avisos">
      {!empresa.credenciais_configuradas && (
        <Aviso>
          As credenciais do FriPonto de {empresa.nome} ainda não foram configuradas, então nenhuma extração roda.{' '}
          {ehAdmin ? (
            <>
              Configure em <Link to="/admin/empresas">Administração → Empresas</Link>.
            </>
          ) : (
            'A equipe Scale IA configura isso em Administração → Empresas; fale com ela.'
          )}
        </Aviso>
      )}
      {!worker.online && (
        <Aviso>
          O serviço de extração está offline
          {worker.visto_em ? ` (último sinal em ${formatarDataHora(worker.visto_em)})` : ''}. Os pedidos continuam sendo
          aceitos e ficam na fila até ele voltar.
        </Aviso>
      )}
    </div>
  )
}

interface CartoesStatusProps {
  status: StatusIntegracao
  podeConfigurar: boolean
  podeAtualizarTempoReal: boolean
  onAtualizarTempoReal: () => void
}

function CartoesStatus({ status, podeConfigurar, podeAtualizarTempoReal, onAtualizarTempoReal }: CartoesStatusProps) {
  const { empresa, worker, cota, fila } = status
  const limite = Math.max(cota.limite_por_hora, 1)
  const pctCota = Math.min(100, Math.round((cota.usadas_ultima_hora / limite) * 100))
  const cotaEsgotada = cota.usadas_ultima_hora >= cota.limite_por_hora

  return (
    <ul className="integ-status" aria-label="Situação da integração">
      <li className="integ-cartao">
        <div className="integ-cartao-topo">
          <span className="integ-rotulo">Conexão</span>
          <span className={empresa.credenciais_configuradas ? 'pilula pilula-sucesso' : 'pilula pilula-falhou'}>
            {empresa.credenciais_configuradas ? 'Configurada' : 'Sem credenciais'}
          </span>
        </div>
        <span className="integ-valor integ-valor-menor">{empresa.nome}</span>
        <span className="integ-sub">
          {empresa.credenciais_configuradas
            ? 'Credenciais do FriPonto cadastradas.'
            : 'Sem credenciais, as extrações não rodam.'}
        </span>
      </li>

      <li className="integ-cartao">
        <div className="integ-cartao-topo">
          <span className="integ-rotulo">Cadastros</span>
          {empresa.sincronizacao_pendente && <span className="pilula pilula-pendente">Na fila</span>}
        </div>
        <span className="integ-valor integ-valor-menor">
          {empresa.sincronizado_em ? formatarDataHora(empresa.sincronizado_em) : 'Nunca sincronizado'}
        </span>
        <span className="integ-sub">
          {empresa.sincronizacao_pendente
            ? `Sincronização pedida${
                empresa.sincronizacao_solicitada_em ? ` em ${formatarDataHora(empresa.sincronizacao_solicitada_em)}` : ''
              }, aguardando o serviço de extração.`
            : 'Última sincronização de unidades e colaboradores.'}
        </span>
      </li>

      <li className="integ-cartao">
        <div className="integ-cartao-topo">
          <span className="integ-rotulo">Serviço de extração</span>
          <span className={worker.online ? 'pilula pilula-sucesso' : 'pilula pilula-falhou'}>
            {worker.online ? 'Online' : 'Offline'}
          </span>
        </div>
        <span className="integ-valor integ-valor-menor">{worker.visto_em ? formatarDataHora(worker.visto_em) : 'Nunca visto'}</span>
        <span className="integ-sub">
          Último sinal do serviço{worker.status ? ` · ${worker.status}` : ''}
          {!worker.online && '. Pedidos ficam na fila.'}
        </span>
      </li>

      <li className="integ-cartao">
        <div className="integ-cartao-topo">
          <span className="integ-rotulo">Cota na última hora</span>
          {cotaEsgotada && <span className="pilula pilula-falhou">Esgotada</span>}
        </div>
        <span className="integ-valor">
          {cota.usadas_ultima_hora}/{cota.limite_por_hora}
        </span>
        <div className="progresso">
          <div
            className="progresso-barra"
            role="progressbar"
            aria-label="Uso da cota na última hora"
            aria-valuemin={0}
            aria-valuemax={cota.limite_por_hora}
            aria-valuenow={cota.usadas_ultima_hora}
          >
            <span style={{ width: `${pctCota}%` }} />
          </div>
        </div>
        <span className="integ-sub">Chamadas de cálculo ao FriPonto.</span>
      </li>

      <li className="integ-cartao">
        <div className="integ-cartao-topo">
          <span className="integ-rotulo">Fila</span>
          {fila.processando > 0 && <span className="pilula pilula-processando">Em andamento</span>}
        </div>
        <div className="integ-fila">
          <span>
            <strong>{fila.pendentes}</strong> pendente{fila.pendentes === 1 ? '' : 's'}
          </span>
          <span>
            <strong>{fila.processando}</strong> processando
          </span>
          <span className={fila.falhas > 0 ? 'texto-negativo' : undefined}>
            <strong>{fila.falhas}</strong> com falha
          </span>
        </div>
        <span className="integ-sub">Fechamentos esperando ou em extração.</span>
      </li>

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
      <li className="integ-cartao">
        <div className="integ-cartao-topo">
          <span className="integ-rotulo">Tempo real</span>
          <span className="pilula pilula-inativo">Desligado</span>
        </div>
        <span className="integ-valor integ-valor-menor">Atualização semanal</span>
        <span className="integ-sub">
          Os dados são puxados uma vez por semana.
          {podeConfigurar && (
            <>
              {' '}
              Ativar em <Link to="/configuracao/atualizacao">Configuração → Atualização dos dados</Link>.
            </>
          )}
        </span>
      </li>
    )
  }

  const { colaboradores, atualizados_ultima_hora, mais_antigo_em, mais_recente_em, minutos_por_rodada } = tempoReal
  return (
    <li className="integ-cartao">
      <div className="integ-cartao-topo">
        <span className="integ-rotulo">Tempo real</span>
        <span className="pilula pilula-sucesso">Ativo</span>
      </div>
      <span className="integ-valor">
        {atualizados_ultima_hora}/{colaboradores}
      </span>
      <span className="integ-sub">
        Colaboradores atualizados na última hora.
        {minutos_por_rodada != null && (
          <>
            {' '}
            Cada um a cada <strong>~{formatarIntervalo(minutos_por_rodada)}</strong>.
          </>
        )}
      </span>
      {(mais_antigo_em || mais_recente_em) && (
        <span className="integ-sub">
          {mais_antigo_em && <>Mais antigo: {formatarHoraOuData(mais_antigo_em)}</>}
          {mais_antigo_em && mais_recente_em && ' · '}
          {mais_recente_em && <>mais recente: {formatarHoraOuData(mais_recente_em)}</>}
        </span>
      )}
      <span className="integ-sub">Sem fotografia semanal: só o fechamento do mês é gravado como registro oficial.</span>
      <button type="button" className="integ-botao integ-cartao-botao" onClick={onAtualizar} disabled={!podeAtualizar}>
        Atualizar todos agora
      </button>
    </li>
  )
}

/* ---------- Execuções ---------- */

function TagAtor({ ator }: { ator: AtorIntegracao }) {
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
      {formatarDataHora(execucao.iniciado_em)}
      <span className="celula-sub">
        {execucao.finalizado_em
          ? `Fim ${formatarDataHora(execucao.finalizado_em)} · ${formatarDuracao(execucao.iniciado_em, execucao.finalizado_em)}`
          : 'Em andamento'}
      </span>
    </>
  )
}

function MensagemErro({ execucao }: { execucao: ExecucaoIntegracao }) {
  const mensagem = execucao.mensagem_erro
  if (!mensagem || execucao.status === 'sucesso') return null
  return <span className="celula-motivo">{mensagem.length > 160 ? `${mensagem.slice(0, 160)}…` : mensagem}</span>
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
                  <PilulaStatus status={execucao.status} />
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
              <PilulaStatus status={execucao.status} />
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
            <time dateTime={registro.criado_em}>{formatarDataHora(registro.criado_em)}</time>
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
