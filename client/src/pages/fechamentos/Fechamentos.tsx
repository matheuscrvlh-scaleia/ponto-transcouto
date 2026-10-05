import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { Aviso, Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { IconeAtividade, IconeCalendario, IconeRelogio, IconeSetaDiagonal, IconeSincronizar } from '../../components/Icones'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { TituloPagina } from '../../components/TituloPagina'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { alertarSucesso } from '../../lib/alertas'
import { api } from '../../lib/api'
import {
  dataDoInstante,
  formatarData,
  formatarDiaPorExtenso,
  formatarDiaSemana,
  formatarHora,
  formatarHoraOuData,
  formatarQuando,
  hojeISO,
  somarDias,
} from '../../lib/formato'
import { mensagemAmigavel, textoDuracao } from '../../lib/mensagens'
import { useRecurso } from '../../lib/useRecurso'
import type { CicloCalendario, CotaSecullum, FechamentoAdmin, TipoCiclo } from '../../types/api'
import { ComEmpresa } from '../admin/AdminLayout'
import { ModalGatilho, type CicloParaAjuste } from '../admin/ModalGatilho'
import { DetalheFechamento, TextoReprocessar } from './DetalheFechamento'
import {
  aguardandoRetomada,
  estaAtrasado,
  inicioExecucao,
  NOME_TIPO,
  pausadoPorCota,
  SITUACOES,
  situacaoDo,
  type Situacao,
} from './fechamentos-util'
import { SituacaoFechamento } from './SituacaoFechamento'
import '../dashboard.css'
import './fechamentos.css'

/* Gestão → Fechamentos: as extrações da FriPonto por unidade, a cada semana e no fechamento do mês.
   RH e gestores acompanham; as ações (reprocessar, publicar, ajustar gatilho) são da equipe Scale IA. */

const INTERVALO_ATUALIZACAO_MS = 10_000
/** Só esperando a cota voltar: confere de minuto em minuto. */
const INTERVALO_PAUSA_MS = 60_000
const LIMITE = 1000
/** Ciclos que já abrem expandidos na lista. */
const CICLOS_ABERTOS = 2

const PERIODOS = [
  { meses: 1, rotulo: 'Último mês' },
  { meses: 3, rotulo: 'Últimos 3 meses' },
  { meses: 6, rotulo: 'Últimos 6 meses' },
  { meses: 12, rotulo: 'Último ano' },
]
const PERIODO_PADRAO = 3

interface Ciclo {
  id: number
  tipo: TipoCiclo
  periodo_inicio: string
  data_referencia: string
  gatilho_em: string
  gatilho_ajustado: boolean
  fechamentos: FechamentoAdmin[]
}

function agruparPorCiclo(fechamentos: FechamentoAdmin[]): Ciclo[] {
  const ciclos = new Map<number, Ciclo>()
  for (const f of fechamentos) {
    const ciclo = ciclos.get(f.ciclo_id)
    if (ciclo) ciclo.fechamentos.push(f)
    else
      ciclos.set(f.ciclo_id, {
        id: f.ciclo_id,
        tipo: f.tipo,
        periodo_inicio: f.periodo_inicio,
        data_referencia: f.data_referencia,
        gatilho_em: f.gatilho_em,
        gatilho_ajustado: f.gatilho_ajustado,
        fechamentos: [f],
      })
  }
  const nome = (f: FechamentoAdmin) => f.unidade.nome
  return [...ciclos.values()]
    .map((ciclo) => ({
      ...ciclo,
      fechamentos: ciclo.fechamentos.sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR')),
    }))
    .sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))
}

function plural(n: number, um: string, varios: string) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
}

export function Fechamentos() {
  useEffect(() => {
    document.title = 'Fechamentos — Copiloto de Ponto'
  }, [])

  return (
    <Routes>
      {/* o detalhe abre direto (ex.: link da Integração), sem depender da empresa escolhida */}
      <Route path=":fechamentoId" element={<DetalheFechamento />} />
      <Route element={<ComEmpresa />}>
        <Route index element={<PainelFechamentos />} />
      </Route>
    </Routes>
  )
}

function lerSituacao(valor: string | null): Situacao | null {
  return SITUACOES.some((s) => s.valor === valor) ? (valor as Situacao) : null
}

function lerTipo(valor: string | null): TipoCiclo | null {
  return valor === 'semanal' || valor === 'fechamento_mes' ? valor : null
}

function PainelFechamentos() {
  const { empresaId, query, ehAdmin } = useEmpresaSelecionada()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [reprocessando, setReprocessando] = useState<FechamentoAdmin | null>(null)
  const [ajustando, setAjustando] = useState<CicloParaAjuste | null>(null)

  const situacao = lerSituacao(params.get('situacao'))
  const tipo = lerTipo(params.get('tipo'))
  const unidadeId = Number(params.get('unidade')) || null
  const meses = PERIODOS.find((p) => String(p.meses) === params.get('periodo'))?.meses ?? PERIODO_PADRAO
  const de = somarDias(hojeISO(), -31 * meses)

  const lista = useRecurso(
    (signal) =>
      api<FechamentoAdmin[]>('/admin/fechamentos', {
        signal,
        query: { ...query, de, limite: LIMITE },
      }),
    `fechamentos-${empresaId}-${de}`,
  )
  const cota = useRecurso((signal) => api<CotaSecullum>('/admin/cota-secullum', { signal, query }), `cota-${empresaId}`)
  const calendario = useRecurso(
    (signal) =>
      api<CicloCalendario[]>('/admin/calendario', {
        signal,
        query: { ...query, meses: 2 },
      }),
    `calendario-${empresaId}`,
  )

  // enquanto houver extração andando, atrasada ou pausada pela cota, a tela se atualiza sozinha
  const { recarregar: recarregarLista } = lista
  const { recarregar: recarregarCota } = cota
  const rodando = (lista.dados ?? []).some((f) => f.status === 'processando' || estaAtrasado(f))
  const pausado = (lista.dados ?? []).some(aguardandoRetomada)
  const ativo = rodando || pausado
  useEffect(() => {
    if (!ativo) return
    const timer = window.setInterval(
      () => {
        recarregarLista()
        recarregarCota()
      },
      rodando ? INTERVALO_ATUALIZACAO_MS : INTERVALO_PAUSA_MS,
    )
    return () => window.clearInterval(timer)
  }, [ativo, rodando, recarregarLista, recarregarCota])

  const todos = useMemo(() => lista.dados ?? [], [lista.dados])
  const ciclos = useMemo(() => agruparPorCiclo(todos), [todos])
  const unidades = useMemo(() => {
    const porId = new Map(todos.map((f) => [f.unidade.id, f.unidade.nome]))
    return [...porId].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [todos])

  const filtrados = useMemo(
    () =>
      ciclos
        .filter((ciclo) => !tipo || ciclo.tipo === tipo)
        .map((ciclo) => ({
          ...ciclo,
          fechamentos: ciclo.fechamentos.filter(
            (f) => (!unidadeId || f.unidade.id === unidadeId) && (!situacao || situacaoDo(f) === situacao),
          ),
        }))
        .filter((ciclo) => ciclo.fechamentos.length > 0),
    [ciclos, tipo, unidadeId, situacao],
  )

  function atualizar(chave: string, valor: string | number | null) {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (valor === null || valor === '') proximo.delete(chave)
        else proximo.set(chave, String(valor))
        return proximo
      },
      { replace: true },
    )
  }

  const comFiltro = Boolean(situacao || tipo || unidadeId)
  const contagem = (valor: Situacao) => todos.filter((f) => situacaoDo(f) === valor).length
  const emAtencao = contagem('atencao')
  const origemLink = { de: location.pathname + location.search }

  return (
    <section className="pagina dash fech">
      <header className="dash-header">
        <TituloPagina>Fechamentos</TituloPagina>
        <p className="pagina-sub">
          Extração das horas da FriPonto por unidade, a cada semana e no fechamento do mês.
          {ativo && ' A lista se atualiza sozinha enquanto há extração em andamento.'}
        </p>
      </header>

      <div className="dash-kpis">
        <KpiUltimoCiclo ciclos={ciclos} carregando={lista.carregando} />
        <KpiProximo calendario={calendario.dados} carregando={calendario.carregando} />
        <Kpi
          rotulo="Precisam de atenção"
          valor={lista.dados ? String(emAtencao) : '—'}
          classeValor={emAtencao > 0 ? 'texto-negativo' : ''}
          icone={<IconeAtividade tamanho={14} />}
          contexto={emAtencao > 0 ? 'Falhas e atrasos no período' : 'Nenhuma falha no período'}
          acao={emAtencao > 0 ? 'Ver as que precisam de atenção' : undefined}
          onAcao={() => atualizar('situacao', 'atencao')}
        />
        <KpiCota cota={cota.dados} carregando={cota.carregando} />
      </div>

      <div className="fech-grade">
        <section className="dash-card fech-lista" aria-labelledby="titulo-extracoes">
          <div className="dash-card-topo">
            <div>
              <h2 id="titulo-extracoes">Extrações por ciclo</h2>
              <p className="dash-card-sub" aria-live="polite">
                {lista.dados
                  ? `${plural(filtrados.length, 'ciclo', 'ciclos')} · ${plural(
                      filtrados.reduce((soma, c) => soma + c.fechamentos.length, 0),
                      'extração',
                      'extrações',
                    )}${comFiltro ? ' com os filtros atuais' : ''}`
                  : ' '}
              </p>
            </div>
          </div>

          <div className="fech-filtros">
            <div className="segmentos" role="group" aria-label="Filtrar por situação">
              <button
                type="button"
                className={situacao ? 'segmento' : 'segmento ativo'}
                aria-pressed={!situacao}
                onClick={() => atualizar('situacao', null)}
              >
                Todos
              </button>
              {SITUACOES.map((item) => {
                const n = contagem(item.valor)
                return (
                  <button
                    key={item.valor}
                    type="button"
                    className={item.valor === situacao ? 'segmento ativo' : 'segmento'}
                    aria-pressed={item.valor === situacao}
                    onClick={() => atualizar('situacao', item.valor === situacao ? null : item.valor)}
                  >
                    {item.rotulo}
                    {lista.dados && n > 0 && <span className="fech-segmento-n">{n}</span>}
                  </button>
                )
              })}
            </div>

            <div className="fech-campos">
              {unidades.length > 1 && (
                <label className="fech-campo">
                  <span>Unidade</span>
                  <select value={unidadeId ?? ''} onChange={(e) => atualizar('unidade', e.target.value)}>
                    <option value="">Todas</option>
                    {unidades.map((unidade) => (
                      <option key={unidade.id} value={unidade.id}>
                        {unidade.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="fech-campo">
                <span>Tipo</span>
                <select value={tipo ?? ''} onChange={(e) => atualizar('tipo', e.target.value)}>
                  <option value="">Todos</option>
                  <option value="semanal">{NOME_TIPO.semanal}</option>
                  <option value="fechamento_mes">{NOME_TIPO.fechamento_mes}</option>
                </select>
              </label>
              <label className="fech-campo">
                <span>Período</span>
                <select
                  value={meses}
                  onChange={(e) => atualizar('periodo', Number(e.target.value) === PERIODO_PADRAO ? null : e.target.value)}
                >
                  {PERIODOS.map((p) => (
                    <option key={p.meses} value={p.meses}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              {comFiltro && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() =>
                    // limpa unidade, situação e tipo; o período escolhido fica
                    setParams(
                      (atual): Record<string, string> => {
                        const periodo = atual.get('periodo')
                        return periodo ? { periodo } : {}
                      },
                      { replace: true },
                    )
                  }
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {lista.carregando && !lista.dados ? (
            <Carregando texto="Carregando fechamentos..." />
          ) : lista.erro ? (
            <ErroCarregamento erro={lista.erro} onTentarDeNovo={lista.recarregar} />
          ) : filtrados.length === 0 ? (
            comFiltro ? (
              <EstadoVazio titulo="Nenhuma extração com esses filtros">
                <p>Ajuste ou limpe os filtros para ver as outras.</p>
              </EstadoVazio>
            ) : (
              <EstadoVazio titulo="Nenhum fechamento no período">
                <p>As extrações aparecem aqui a partir do primeiro gatilho do calendário. Veja ao lado quando será o próximo.</p>
              </EstadoVazio>
            )
          ) : (
            <div className="fech-ciclos">
              {filtrados.map((ciclo, indice) => (
                <BlocoCiclo
                  key={ciclo.id}
                  ciclo={ciclo}
                  aberto={indice < CICLOS_ABERTOS || comFiltro}
                  ehAdmin={ehAdmin}
                  origemLink={origemLink}
                  onReprocessar={setReprocessando}
                />
              ))}
            </div>
          )}

          {todos.length >= LIMITE && (
            <p className="rodape-nota">Exibindo os {LIMITE} fechamentos mais recentes do período. Escolha um período menor.</p>
          )}
        </section>

        <CartaoCalendario
          dados={calendario.dados}
          carregando={calendario.carregando}
          erro={calendario.erro}
          onTentarDeNovo={calendario.recarregar}
          onAjustar={ehAdmin ? setAjustando : undefined}
        />
      </div>

      <p className="rodape-nota">
        Cada extração publicada vira a fotografia que o Dashboard e Colaboradores mostram para aquela unidade; ela fica congelada
        até um novo fechamento ser publicado.
      </p>

      {reprocessando && (
        <ModalConfirmacao
          titulo={`Reprocessar ${reprocessando.unidade.nome}`}
          rotuloConfirmar="Reprocessar"
          motivo="opcional"
          onFechar={() => setReprocessando(null)}
          onConfirmar={async (motivo) => {
            await api(`/admin/fechamentos/${reprocessando.id}/reprocessar`, {
              method: 'POST',
              json: { motivo },
            })
            setReprocessando(null)
            alertarSucesso('Fechamento enviado para a fila de reprocessamento.')
            lista.recarregar()
          }}
        >
          <TextoReprocessar fechamento={reprocessando} />
        </ModalConfirmacao>
      )}

      {ajustando && (
        <ModalGatilho
          ciclo={ajustando}
          onFechar={() => setAjustando(null)}
          onSalvo={() => {
            setAjustando(null)
            alertarSucesso('Gatilho do ciclo ajustado.')
            calendario.recarregar()
            lista.recarregar()
          }}
        />
      )}
    </section>
  )
}

/* ---------- KPIs ---------- */

interface KpiProps {
  rotulo: string
  valor: ReactNode
  contexto: ReactNode
  icone: ReactNode
  destaque?: boolean
  classeValor?: string
  acao?: string
  onAcao?: () => void
}

function Kpi({ rotulo, valor, contexto, icone, destaque = false, classeValor = '', acao, onAcao }: KpiProps) {
  return (
    <div className={destaque ? 'dash-kpi dash-kpi-destaque' : 'dash-kpi'}>
      <div className="dash-kpi-topo">
        <p className="dash-kpi-rotulo">{rotulo}</p>
        {acao && onAcao && (
          <button type="button" className="dash-kpi-acao" onClick={onAcao} aria-label={acao} title={acao}>
            <IconeSetaDiagonal tamanho={18} />
          </button>
        )}
      </div>
      <p className={`dash-kpi-valor ${classeValor}`}>{valor}</p>
      <p className="dash-kpi-contexto">
        <span className="dash-kpi-contexto-icone" aria-hidden="true">
          {icone}
        </span>
        {contexto}
      </p>
    </div>
  )
}

function KpiUltimoCiclo({ ciclos, carregando }: { ciclos: Ciclo[]; carregando: boolean }) {
  // o ciclo mais recente cujo gatilho já passou (os futuros ainda estão só agendados)
  const [agora] = useState(() => Date.now())
  const ultimo = ciclos.find((ciclo) => new Date(ciclo.gatilho_em).getTime() <= agora) ?? null
  const publicados = ultimo?.fechamentos.filter((f) => f.status === 'sucesso').length ?? 0
  const total = ultimo?.fechamentos.length ?? 0

  return (
    <Kpi
      destaque
      rotulo="Último fechamento"
      valor={
        ultimo ? (
          <>
            {publicados}
            <span className="fech-kpi-de">/{total}</span>
          </>
        ) : carregando ? (
          '…'
        ) : (
          '—'
        )
      }
      icone={<IconeCalendario tamanho={14} />}
      contexto={
        ultimo
          ? `Unidades publicadas · dados até ${formatarData(ultimo.data_referencia, { ano: false })}${
              ultimo.tipo === 'fechamento_mes' ? ' (mês)' : ''
            }`
          : 'Nenhuma extração ainda'
      }
    />
  )
}

function KpiProximo({ calendario, carregando }: { calendario: CicloCalendario[] | null; carregando: boolean }) {
  const [agora] = useState(() => Date.now())
  const proximo = (calendario ?? []).find((ciclo) => new Date(ciclo.gatilho_em).getTime() > agora) ?? null
  const dia = proximo ? dataDoInstante(proximo.gatilho_em) : null

  return (
    <Kpi
      rotulo="Próxima extração"
      valor={proximo && dia ? formatarData(dia, { ano: false }) : carregando ? '…' : '—'}
      icone={<IconeRelogio tamanho={14} />}
      contexto={
        proximo && dia
          ? `${formatarDiaPorExtenso(dia)} às ${formatarHora(proximo.gatilho_em)} · ${NOME_TIPO[proximo.tipo].toLowerCase()}`
          : 'Nada agendado nos próximos 2 meses'
      }
    />
  )
}

function KpiCota({ cota, carregando }: { cota: CotaSecullum | null; carregando: boolean }) {
  return (
    <Kpi
      rotulo="Cota da FriPonto"
      valor={cota ? cota.disponiveis : carregando ? '…' : '—'}
      classeValor={cota?.disponiveis === 0 ? 'texto-negativo' : ''}
      icone={<IconeSincronizar tamanho={14} />}
      contexto={
        cota
          ? cota.disponiveis === 0 && cota.proxima_liberacao
            ? `Esgotada · libera às ${formatarHora(cota.proxima_liberacao)}`
            : `Cálculos livres · ${cota.usadas_ultima_hora} de ${cota.limite} usados na última hora`
          : 'Não foi possível consultar'
      }
    />
  )
}

/* ---------- Ciclos ---------- */

interface BlocoCicloProps {
  ciclo: Ciclo
  aberto: boolean
  ehAdmin: boolean
  origemLink: { de: string }
  onReprocessar: (fechamento: FechamentoAdmin) => void
}

function BlocoCiclo({ ciclo, aberto, ehAdmin, origemLink, onReprocessar }: BlocoCicloProps) {
  const { fechamentos } = ciclo
  const total = fechamentos.length
  const publicados = fechamentos.filter((f) => f.status === 'sucesso').length
  const comFalha = fechamentos.filter((f) => f.status === 'falhou').length
  const atrasados = fechamentos.filter(estaAtrasado).length
  const andamento = fechamentos.filter((f) => f.status === 'processando').length
  const pausados = fechamentos.filter(pausadoPorCota)
  // a primeira unidade pausada a voltar (todas usam a mesma cota da empresa)
  const retomaEm = pausados
    .map((f) => f.proxima_tentativa_em as string)
    .sort()
    .at(0)
  const pct = total ? Math.round((publicados / total) * 100) : 0
  const [agora] = useState(() => Date.now())
  const futuro = new Date(ciclo.gatilho_em).getTime() > agora
  const titulo = `Dados até ${formatarData(ciclo.data_referencia)}`

  return (
    <details className={comFalha || atrasados ? 'fech-ciclo com-falha' : 'fech-ciclo'} open={aberto}>
      <summary className="fech-ciclo-resumo">
        <span className="fech-ciclo-info">
          <span className="fech-ciclo-titulo">
            <h3>{titulo}</h3>
            {ciclo.tipo === 'fechamento_mes' && <span className="badge badge-alerta">Fechamento do mês</span>}
          </span>
          <span className="fech-ciclo-sub">
            {formatarData(ciclo.periodo_inicio, { ano: false })} a {formatarData(ciclo.data_referencia, { ano: false })}
            {' · '}
            {futuro ? 'coleta prevista para' : publicados === total ? 'coletado' : 'coleta iniciada'}{' '}
            {formatarDiaSemana(ciclo.gatilho_em)}
            {ciclo.gatilho_ajustado && ' (ajustado)'}
          </span>
        </span>

        <span className="fech-ciclo-placar">
          <span className="fech-ciclo-contas">
            {andamento > 0 && <span className="fech-conta conta-andamento">{andamento} em andamento</span>}
            {pausados.length > 0 && retomaEm && (
              <span
                className="fech-conta conta-pausa"
                title="A cota de cálculos da FriPonto (100 por hora) acabou; a coleta continua sozinha"
              >
                {plural(pausados.length, 'pausada', 'pausadas')} · retoma {formatarQuando(retomaEm)}
              </span>
            )}
            {comFalha > 0 && <span className="fech-conta conta-falha">{plural(comFalha, 'falha', 'falhas')}</span>}
            {atrasados > 0 && <span className="fech-conta conta-falha">{plural(atrasados, 'atrasada', 'atrasadas')}</span>}
          </span>
          <span className="fech-ciclo-progresso">
            <span
              className="fech-barra"
              role="progressbar"
              aria-label={`Unidades publicadas — ${titulo.toLowerCase()}`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={publicados}
            >
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="fech-ciclo-n">
              <strong>{publicados}</strong>/{total} publicadas
            </span>
          </span>
        </span>
      </summary>

      {comFalha > 0 && ehAdmin && (
        <div className="fech-ciclo-aviso">
          <Aviso>Há unidades com falha neste ciclo. Veja o motivo e reprocesse quando a causa estiver resolvida.</Aviso>
        </div>
      )}

      <div className="tabela-desktop">
        <div className="table-wrap">
          <table className="fech-tabela">
            <caption className="sr-only">Extrações com {titulo.toLowerCase()}</caption>
            <thead>
              <tr>
                <th scope="col">Unidade</th>
                <th scope="col">Situação</th>
                <th scope="col">Última execução</th>
                <th scope="col">Colaboradores</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fechamentos.map((f) => (
                <tr key={f.id} className={situacaoDo(f) === 'atencao' ? 'linha-negativo' : undefined}>
                  <th scope="row" className="fech-unidade">
                    <Link to={String(f.id)} state={origemLink}>
                      {f.unidade.nome}
                    </Link>
                    {f.publicado_em && (
                      <span className="celula-sub">Publicado {formatarHoraOuData(f.publicado_em, { comData: true })}</span>
                    )}
                  </th>
                  <td>
                    <SituacaoFechamento fechamento={f} />
                    <Motivo fechamento={f} />
                  </td>
                  <td>
                    <UltimaExecucao fechamento={f} />
                  </td>
                  <td>
                    <Progresso fechamento={f} />
                  </td>
                  <td className="table-actions">
                    {ehAdmin && f.status === 'falhou' && (
                      <button type="button" className="btn-link" onClick={() => onReprocessar(f)}>
                        Reprocessar
                      </button>
                    )}
                    <Link to={String(f.id)} state={origemLink} className="btn-link" aria-label={`Detalhes de ${f.unidade.nome}`}>
                      Detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="lista-cartoes fech-cartoes" aria-label={titulo}>
        {fechamentos.map((f) => (
          <li key={f.id} className={situacaoDo(f) === 'atencao' ? 'fech-cartao linha-negativo' : 'fech-cartao'}>
            <div className="fech-cartao-topo">
              <Link to={String(f.id)} state={origemLink} className="fech-cartao-nome">
                {f.unidade.nome}
              </Link>
              <SituacaoFechamento fechamento={f} />
            </div>
            <Motivo fechamento={f} />
            {f.ultima_execucao && <Progresso fechamento={f} />}
            {ehAdmin && f.status === 'falhou' && (
              <button type="button" className="btn-link fech-cartao-acao" onClick={() => onReprocessar(f)}>
                Reprocessar
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

function Progresso({ fechamento }: { fechamento: FechamentoAdmin }) {
  const execucao = fechamento.ultima_execucao
  if (!execucao) {
    return <span className="texto-suave">{fechamento.total_colaboradores ?? '—'}</span>
  }
  const total = execucao.total_colaboradores || fechamento.total_colaboradores || 0
  const pct = total ? Math.round((execucao.processados / total) * 100) : 0
  return (
    <div className="progresso">
      <div
        className="progresso-barra"
        role="progressbar"
        aria-label={`Colaboradores processados em ${fechamento.unidade.nome}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={execucao.processados}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="progresso-texto">
        {execucao.processados}/{total || '?'}
        {execucao.com_erro > 0 && <span className="texto-negativo"> · {execucao.com_erro} com erro</span>}
      </span>
    </div>
  )
}

function UltimaExecucao({ fechamento }: { fechamento: FechamentoAdmin }) {
  const execucao = fechamento.ultima_execucao
  if (!execucao) {
    return fechamento.proxima_tentativa_em && fechamento.status === 'pendente' ? (
      <span className="celula-sub">Próxima tentativa {formatarQuando(fechamento.proxima_tentativa_em)}</span>
    ) : (
      <span className="texto-suave">—</span>
    )
  }
  return (
    <>
      {inicioExecucao(execucao)}
      <span className="celula-sub">
        {textoDuracao(execucao)}
        {execucao.disparo === 'manual' && ` · manual${execucao.disparado_por ? ` por ${execucao.disparado_por.nome}` : ''}`}
      </span>
    </>
  )
}

function Motivo({ fechamento }: { fechamento: FechamentoAdmin }) {
  const bruta = fechamento.status === 'falhou' ? fechamento.ultima_execucao?.mensagem_erro : null
  if (!bruta) return null
  const mensagem = mensagemAmigavel(bruta)
  return <span className="celula-motivo">{mensagem.length > 160 ? `${mensagem.slice(0, 160)}…` : mensagem}</span>
}

/* ---------- Calendário ---------- */

interface CartaoCalendarioProps {
  dados: CicloCalendario[] | null
  carregando: boolean
  erro: Parameters<typeof ErroCarregamento>[0]['erro'] | null
  onTentarDeNovo: () => void
  onAjustar?: (ciclo: CicloParaAjuste) => void
}

function CartaoCalendario({ dados, carregando, erro, onTentarDeNovo, onAjustar }: CartaoCalendarioProps) {
  const [agora] = useState(() => Date.now())
  const proximos = (dados ?? []).filter((ciclo) => new Date(ciclo.gatilho_em).getTime() > agora)

  return (
    <section className="dash-card fech-calendario" aria-labelledby="titulo-calendario">
      <div className="dash-card-topo">
        <div>
          <h2 id="titulo-calendario">Próximas extrações</h2>
          <p className="dash-card-sub">Próximos 2 meses, horário de Brasília</p>
        </div>
      </div>

      {carregando && !dados ? (
        <Carregando texto="Calculando calendário..." />
      ) : erro ? (
        <ErroCarregamento erro={erro} onTentarDeNovo={onTentarDeNovo} />
      ) : proximos.length === 0 ? (
        <p className="dash-vazio">Nenhuma extração prevista.</p>
      ) : (
        <ol className="fech-agenda">
          {proximos.map((ciclo) => {
            const dia = dataDoInstante(ciclo.gatilho_em)
            const [, mes, d] = dia.split('-')
            return (
              <li key={`${ciclo.data_referencia}-${ciclo.tipo}`} className={ciclo.tipo === 'fechamento_mes' ? 'mes' : undefined}>
                <span className="fech-agenda-data" aria-hidden="true">
                  <strong>{d}</strong>
                  <span>/{mes}</span>
                </span>
                <span className="fech-agenda-texto">
                  <span className="fech-agenda-titulo">
                    {formatarDiaPorExtenso(dia)} às {formatarHora(ciclo.gatilho_em)}
                  </span>
                  <span className="fech-agenda-sub">
                    {NOME_TIPO[ciclo.tipo]} · dados de {formatarData(ciclo.periodo_inicio, { ano: false })} a{' '}
                    {formatarData(ciclo.data_referencia, { ano: false })}
                    {ciclo.ajustado && ` · ajustado (regra: ${formatarDiaSemana(ciclo.gatilho_previsto_em)})`}
                  </span>
                </span>
                {onAjustar && ciclo.ciclo_id && (
                  <button
                    type="button"
                    className="btn-link fech-agenda-acao"
                    onClick={() =>
                      onAjustar({
                        ciclo_id: ciclo.ciclo_id as number,
                        titulo: `dados até ${formatarData(ciclo.data_referencia, { ano: false })}`,
                        tipo: ciclo.tipo,
                        data_referencia: ciclo.data_referencia,
                        gatilho_em: ciclo.gatilho_em,
                        gatilho_previsto_em: ciclo.gatilho_previsto_em,
                      })
                    }
                  >
                    Ajustar
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <p className="fech-calendario-nota">
        Na semana do fechamento da folha (dia 25/26) a extração espera o ajuste final do RH, por isso pode cair em outro dia.
      </p>
    </section>
  )
}
