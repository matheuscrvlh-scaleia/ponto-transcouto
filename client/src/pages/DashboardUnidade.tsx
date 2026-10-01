import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { Aviso, Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { GraficoFaixas } from '../components/GraficoFaixas'
import { Horas } from '../components/Horas'
import {
  IconeBanco,
  IconeCalendario,
  IconeMais,
  IconeMedia,
  IconeMenos,
  IconeMoeda,
  IconeRelogio,
  IconeSetaDiagonal,
} from '../components/Icones'
import { IndicadorCurva } from '../components/IndicadorCurva'
import { MedidorCurva } from '../components/MedidorCurva'
import { api } from '../lib/api'
import {
  formatarData,
  formatarDataHora,
  formatarDiaSemana,
  formatarMinutos,
  iniciais,
  normalizarBusca,
} from '../lib/formato'
import { useRecurso } from '../lib/useRecurso'
import { caminhoFechamentos } from './admin/navegacao'
import type { DashboardUnidade as Dashboard, FiltroDashboard, LinhaDashboard, Minutos } from '../types/api'
import './dashboard.css'

/** Linha da lista; no painel consolidado vem também com a unidade e os limites dela. */
type Linha = Dashboard['colaboradores'][number]

const MAX_POR_PAGINA = 500
const MAX_EM_ATENCAO = 5
const ORDEM_PADRAO = 'saldo_min.desc'

type CampoOrdem = 'nome' | 'saldo_min' | 'extra_min' | 'negativa_min' | 'pagas_min'
type Direcao = 'asc' | 'desc'

const COLUNAS: { campo: CampoOrdem; rotulo: string }[] = [
  { campo: 'saldo_min', rotulo: 'Saldo banco' },
  { campo: 'extra_min', rotulo: 'Extras' },
  { campo: 'negativa_min', rotulo: 'Negativas' },
  { campo: 'pagas_min', rotulo: 'Pagas' },
]

const FILTROS: { valor: FiltroDashboard; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'extra', rotulo: 'Com extras' },
  { valor: 'negativa', rotulo: 'Com negativas' },
  { valor: 'fora', rotulo: 'Fora da curva' },
]

const ORDENS_MOBILE: { valor: string; rotulo: string }[] = [
  { valor: 'saldo_min.desc', rotulo: 'Maior saldo' },
  { valor: 'saldo_min.asc', rotulo: 'Menor saldo' },
  { valor: 'extra_min.desc', rotulo: 'Mais extras' },
  { valor: 'negativa_min.desc', rotulo: 'Mais negativas' },
  { valor: 'nome.asc', rotulo: 'Nome (A–Z)' },
]

const CAMPOS_VALIDOS = new Set<string>(['nome', ...COLUNAS.map((coluna) => coluna.campo)])

function lerOrdem(valor: string | null): { campo: CampoOrdem; direcao: Direcao } {
  const [campo, direcao] = (valor ?? '').split('.')
  if (!CAMPOS_VALIDOS.has(campo)) return { campo: 'saldo_min', direcao: 'desc' }
  return { campo: campo as CampoOrdem, direcao: direcao === 'asc' ? 'asc' : 'desc' }
}

function lerFiltro(valor: string | null): FiltroDashboard {
  return FILTROS.some((filtro) => filtro.valor === valor) ? (valor as FiltroDashboard) : 'todos'
}

function passaNoFiltro(linha: LinhaDashboard, filtro: FiltroDashboard) {
  if (filtro === 'extra') return linha.extra_min > 0
  if (filtro === 'negativa') return linha.negativa_min > 0
  if (filtro === 'fora') return linha.fora_da_curva !== null
  return true
}

function preferirMovimentoReduzido() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function DashboardUnidade() {
  const { unidadeId } = useParams()
  // sem unidade na URL (/unidades): painel consolidado de todas as unidades do usuário
  const consolidado = !unidadeId
  const { perfil, unidades: unidadesSessao } = useAuth()
  const { query: empresaQuery, empresa: empresaEmFoco } = useEmpresaAdmin()
  // equipe abre o painel com as ações (Administração); RH, a consulta em Configuração
  const linkFechamentos = caminhoFechamentos(perfil)
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const tituloLista = useRef<HTMLHeadingElement>(null)
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) =>
      api<Dashboard>(consolidado ? '/dashboard' : `/unidades/${unidadeId}/dashboard`, {
        signal,
        // consolidado: a equipe vê só a empresa escolhida no topo (sem escolha = todas)
        query: { por_pagina: MAX_POR_PAGINA, ...(consolidado ? empresaQuery : {}) },
      }),
    `dashboard-${unidadeId ?? `todas-${empresaQuery.empresa_id ?? 'todas'}`}`,
  )

  const busca = params.get('busca') ?? ''
  const filtro = lerFiltro(params.get('filtro'))
  const ordem = lerOrdem(params.get('ordem'))

  useEffect(() => {
    const nome = dados ? (dados.unidade?.nome ?? 'Todas as unidades') : null
    document.title = nome ? `${nome} — Copiloto de Ponto` : 'Copiloto de Ponto'
  }, [dados])

  function atualizarParam(chave: string, valor: string, padrao: string) {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (!valor || valor === padrao) proximo.delete(chave)
        else proximo.set(chave, valor)
        return proximo
      },
      { replace: true },
    )
  }

  function alternarOrdem(campo: CampoOrdem) {
    const direcao: Direcao =
      ordem.campo === campo ? (ordem.direcao === 'desc' ? 'asc' : 'desc') : campo === 'nome' ? 'asc' : 'desc'
    atualizarParam('ordem', `${campo}.${direcao}`, ORDEM_PADRAO)
  }

  /** Atalho dos cards: aplica filtro/ordem na lista de colaboradores e leva até ela. */
  function abrirLista(novoFiltro: FiltroDashboard, novaOrdem: string = ORDEM_PADRAO) {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (novoFiltro === 'todos') proximo.delete('filtro')
        else proximo.set('filtro', novoFiltro)
        if (novaOrdem === ORDEM_PADRAO) proximo.delete('ordem')
        else proximo.set('ordem', novaOrdem)
        return proximo
      },
      { replace: true },
    )
    const titulo = tituloLista.current
    if (titulo) {
      titulo.scrollIntoView({ behavior: preferirMovimentoReduzido() ? 'auto' : 'smooth', block: 'start' })
      titulo.focus({ preventScroll: true })
    }
  }

  const linhas = useMemo(() => {
    const termo = normalizarBusca(busca)
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return (dados?.colaboradores ?? [])
      .filter((linha) => passaNoFiltro(linha, filtro) && normalizarBusca(linha.nome).includes(termo))
      .sort((a, b) =>
        ordem.campo === 'nome'
          ? fator * a.nome.localeCompare(b.nome, 'pt-BR')
          : fator * (a[ordem.campo] - b[ordem.campo]) || a.nome.localeCompare(b.nome, 'pt-BR'),
      )
  }, [dados, busca, filtro, ordem.campo, ordem.direcao])

  const somas = useMemo(() => {
    const lista = dados?.colaboradores ?? []
    return lista.reduce(
      (soma, linha) => ({
        saldo: soma.saldo + linha.saldo_min,
        extra: soma.extra + linha.extra_min,
        negativa: soma.negativa + linha.negativa_min,
      }),
      { saldo: 0, extra: 0, negativa: 0 },
    )
  }, [dados])

  const emAtencao = useMemo(
    () =>
      (dados?.colaboradores ?? [])
        .filter((linha) => linha.fora_da_curva !== null)
        .sort((a, b) => Math.abs(b.saldo_min) - Math.abs(a.saldo_min) || a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados],
  )

  // com uma unidade só, "todas" é a própria unidade
  if (consolidado && unidadesSessao.length === 1) return <Navigate to={`/unidades/${unidadesSessao[0].id}`} replace />
  if (carregando) return <Carregando texto={consolidado ? 'Carregando unidades...' : 'Carregando unidade...'} />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const { unidade, fechamento, limites } = dados
  const nomePainel = unidade?.nome ?? 'Todas as unidades'
  const unidadesPainel = dados.unidades ?? []
  const comDados = unidadesPainel.filter((item) => item.fechamento)
  // no consolidado, cada unidade tem o seu fechamento: período e data só valem se forem iguais em todas
  const datasIguais = comDados.every(
    (item) =>
      item.fechamento?.data_referencia === fechamento?.data_referencia &&
      item.fechamento?.periodo_inicio === fechamento?.periodo_inicio,
  )
  const limitesVariam = Boolean(dados.limites_variam)
  const todos = dados.colaboradores
  const acima = dados.resumo?.fora_positivo ?? todos.filter((linha) => linha.fora_da_curva === 'positivo').length
  const abaixo = dados.resumo?.fora_negativo ?? todos.filter((linha) => linha.fora_da_curva === 'negativo').length
  const totalPagas = dados.resumo?.pagas_total_min ?? todos.reduce((soma, linha) => soma + linha.pagas_min, 0)
  const totalColaboradores = dados.resumo?.total ?? dados.total
  const dentro = Math.max(0, totalColaboradores - acima - abaixo)
  const incompleto = dados.total > todos.length
  const origem = { de: location.pathname + location.search }
  const linkColaborador = (linha: Linha) => `/unidades/${linha.unidade_id ?? unidade?.id}/colaboradores/${linha.id}`

  // no consolidado cada linha traz o limite da empresa dela
  const limiteDe = (linha: Linha) =>
    linha.fora_da_curva === 'positivo'
      ? (linha.alerta_pos ?? limites.alerta_pos)
      : linha.fora_da_curva === 'negativo'
        ? (linha.alerta_neg ?? limites.alerta_neg)
        : undefined

  const complemento = (linha: Linha) => [consolidado ? linha.unidade_nome : null, linha.funcao].filter(Boolean).join(' · ')

  const periodo =
    fechamento?.periodo_inicio && datasIguais
      ? `${formatarData(fechamento.periodo_inicio, { ano: false })} a ${formatarData(fechamento.data_referencia, { ano: false })}`
      : null

  const colaboradoresPorUnidade = new Map<number, number>()
  for (const linha of todos) {
    if (linha.unidade_id) colaboradoresPorUnidade.set(linha.unidade_id, (colaboradoresPorUnidade.get(linha.unidade_id) ?? 0) + 1)
  }

  return (
    <section className="pagina dash">
      <header className="dash-header">
        <h1>{nomePainel}</h1>
        <p className="pagina-sub">
          {consolidado
            ? `Banco de horas de ${unidadesPainel.length} ${unidadesPainel.length === 1 ? 'unidade' : 'unidades'} juntas` +
              (empresaEmFoco ? ` · ${empresaEmFoco.nome}` : '')
            : 'Banco de horas dos colaboradores'}
          {fechamento && (
            <>
              {' — '}dados até {formatarData(fechamento.data_referencia)}
              {datasIguais && fechamento.semana_fechamento_mes && ' (fechamento do mês)'}
              {!datasIguais && ' (algumas unidades com dados anteriores)'}
            </>
          )}
        </p>
      </header>

      {dados.aviso_fechamento_mes && (
        <Aviso>Dados podem levar mais tempo para atualizar essa semana devido ao fechamento da folha.</Aviso>
      )}

      {!fechamento ? (
        <EstadoVazio
          titulo={consolidado ? 'Ainda não há dados publicados nas suas unidades' : 'Ainda não há dados consolidados para esta unidade'}
        >
          <p>
            Os dados são atualizados uma vez por semana, depois que o RH ajusta o ponto (normalmente às quartas-feiras).
          </p>
          {dados.proximo_fechamento_previsto && (
            <p>
              Próxima atualização prevista: <strong>{formatarDiaSemana(dados.proximo_fechamento_previsto)}</strong>
            </p>
          )}
          {linkFechamentos && (
            <Link to={linkFechamentos} className="btn-link">
              Ver painel de fechamentos
            </Link>
          )}
        </EstadoVazio>
      ) : (
        <>
          <div className="dash-kpis">
            <CartaoKpi
              destaque
              rotulo="Colaboradores"
              valor={totalColaboradores}
              contexto={
                consolidado
                  ? `${comDados.length} ${comDados.length === 1 ? 'unidade' : 'unidades'} com dados`
                  : `Referência ${formatarData(fechamento.data_referencia)}`
              }
              icone={<IconeCalendario tamanho={14} />}
              acao="Ver todos os colaboradores"
              onAcao={() => abrirLista('todos')}
            />
            <CartaoKpi
              rotulo="Acima do limite"
              valor={acima}
              classeValor={acima ? 'texto-positivo' : ''}
              contexto={
                limitesVariam ? 'Pelo limite de cada empresa' : `Saldo a partir de +${formatarMinutos(limites.alerta_pos)}`
              }
              icone={<IconeMais tamanho={14} />}
              acao="Ver colaboradores fora da curva, maiores saldos primeiro"
              onAcao={() => abrirLista('fora', 'saldo_min.desc')}
            />
            <CartaoKpi
              rotulo="Abaixo do limite"
              valor={abaixo}
              classeValor={abaixo ? 'texto-negativo' : ''}
              contexto={
                limitesVariam ? 'Pelo limite de cada empresa' : `Saldo de −${formatarMinutos(limites.alerta_neg)} ou menos`
              }
              icone={<IconeMenos tamanho={14} />}
              acao="Ver colaboradores fora da curva, menores saldos primeiro"
              onAcao={() => abrirLista('fora', 'saldo_min.asc')}
            />
            <CartaoKpi
              rotulo="Pagas no período"
              valor={<Horas minutos={totalPagas} />}
              contexto={
                periodo ? `Período de ${periodo}` : consolidado ? 'Soma de todas as unidades' : 'Soma de todos os colaboradores'
              }
              icone={<IconeRelogio tamanho={14} />}
              acao="Ver colaboradores ordenados por horas pagas"
              onAcao={() => abrirLista('todos', 'pagas_min.desc')}
            />
          </div>

          <div className="dash-grade">
            <article className="dash-card dash-area-faixas" aria-labelledby="titulo-faixas">
              <div className="dash-card-topo">
                <div>
                  <h2 id="titulo-faixas">Distribuição do saldo</h2>
                  <p className="dash-card-sub">Colaboradores por faixa de saldo do banco de horas</p>
                </div>
              </div>
              {todos.length > 0 ? (
                <GraficoFaixas linhas={todos} limites={limites} />
              ) : (
                <p className="dash-vazio">Nenhum colaborador neste fechamento.</p>
              )}
            </article>

            {consolidado ? (
              <article className="dash-card dash-area-atualizacao" aria-labelledby="titulo-unidades">
                <h2 id="titulo-unidades">Unidades</h2>
                <p className="dash-card-sub">Dados de cada unidade · clique para ver só ela</p>
                <ul className="dash-unidades">
                  {unidadesPainel.map((item) => (
                    <li key={item.id}>
                      <Link to={`/unidades/${item.id}`} className="dash-unidade">
                        <span className="dash-unidade-nome">{item.nome}</span>
                        <span className="dash-unidade-info">
                          {item.fechamento
                            ? `Dados até ${formatarData(item.fechamento.data_referencia)}${
                                !incompleto && colaboradoresPorUnidade.has(item.id)
                                  ? ` · ${colaboradoresPorUnidade.get(item.id)} colab.`
                                  : ''
                              }`
                            : 'Sem dados ainda'}
                        </span>
                        <IconeSetaDiagonal tamanho={16} className="dash-unidade-seta" />
                      </Link>
                    </li>
                  ))}
                </ul>
                {dados.proximo_fechamento_previsto && (
                  <p className="dash-unidades-proxima">
                    <IconeRelogio tamanho={14} />
                    Próxima atualização: {formatarDiaSemana(dados.proximo_fechamento_previsto)}
                  </p>
                )}
              </article>
            ) : (
              <article className="dash-card dash-area-atualizacao" aria-labelledby="titulo-atualizacao">
                <h2 id="titulo-atualizacao">Atualização dos dados</h2>
                <p className="dash-destaque-texto">Dados até {formatarData(fechamento.data_referencia)}</p>
                <ul className="dash-info">
                  {periodo && (
                    <li>
                      <IconeCalendario tamanho={16} />
                      <span>
                        Período de {periodo}
                        {fechamento.semana_fechamento_mes && <span className="dash-etiqueta">Fechamento do mês</span>}
                      </span>
                    </li>
                  )}
                  <li>
                    <IconeRelogio tamanho={16} />
                    <span>Publicado em {formatarDataHora(fechamento.publicado_em)}</span>
                  </li>
                  {dados.proximo_fechamento_previsto && (
                    <li>
                      <IconeSetaDiagonal tamanho={16} />
                      <span>Próxima atualização: {formatarDiaSemana(dados.proximo_fechamento_previsto)}</span>
                    </li>
                  )}
                </ul>
                {linkFechamentos && (
                  <Link to={linkFechamentos} className="dash-botao dash-botao-primario">
                    Ver painel de fechamentos
                  </Link>
                )}
              </article>
            )}

            <article className="dash-card dash-area-resumo" aria-labelledby="titulo-resumo">
              <h2 id="titulo-resumo">Resumo de horas</h2>
              <p className="dash-card-sub">
                {incompleto ? `Soma dos ${todos.length} colaboradores exibidos` : 'Soma de todos os colaboradores'}
              </p>
              <ul className="dash-resumo">
                <ItemResumo icone={<IconeBanco />} rotulo="Saldo do banco" detalhe="acumulado" minutos={somas.saldo} sinal />
                <ItemResumo icone={<IconeMais />} rotulo="Extras" detalhe="no período" minutos={somas.extra} />
                <ItemResumo icone={<IconeMenos />} rotulo="Negativas" detalhe="no período" minutos={somas.negativa} />
                <ItemResumo icone={<IconeMoeda />} rotulo="Pagas" detalhe="no período" minutos={totalPagas} />
                {todos.length > 0 && (
                  <ItemResumo
                    icone={<IconeMedia />}
                    rotulo="Saldo médio"
                    detalhe="por colaborador"
                    minutos={Math.round(somas.saldo / todos.length)}
                    sinal
                  />
                )}
              </ul>
            </article>

            <article className="dash-card dash-area-atencao" aria-labelledby="titulo-atencao">
              <div className="dash-card-topo">
                <div>
                  <h2 id="titulo-atencao">Fora da curva</h2>
                  <p className="dash-card-sub">
                    {consolidado ? 'Maiores saldos fora dos limites, em todas as unidades' : 'Maiores saldos fora dos limites da unidade'}
                  </p>
                </div>
                {emAtencao.length > 0 && (
                  <button type="button" className="dash-botao" onClick={() => abrirLista('fora')}>
                    Ver todos ({emAtencao.length})
                  </button>
                )}
              </div>
              {emAtencao.length === 0 ? (
                <p className="dash-vazio">Nenhum colaborador fora da curva nesta semana.</p>
              ) : (
                <ul className="dash-pessoas">
                  {emAtencao.slice(0, MAX_EM_ATENCAO).map((linha) => (
                    <li key={linha.id}>
                      <Link to={linkColaborador(linha)} state={origem} className="dash-pessoa">
                        <span className={`avatar avatar-${linha.fora_da_curva}`} aria-hidden="true">
                          {iniciais(linha.nome)}
                        </span>
                        <span className="dash-pessoa-texto">
                          <span className="dash-pessoa-nome">{linha.nome}</span>
                          <span className="dash-pessoa-info">
                            Saldo <Horas minutos={linha.saldo_min} sinal destacar className="forte" />
                            {complemento(linha) && ` · ${complemento(linha)}`}
                          </span>
                        </span>
                        <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe(linha)} pilula />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="dash-card dash-area-medidor" aria-labelledby="titulo-medidor">
              <h2 id="titulo-medidor">Dentro da curva</h2>
              {totalColaboradores > 0 ? (
                <MedidorCurva dentro={dentro} acima={acima} abaixo={abaixo} />
              ) : (
                <p className="dash-vazio">Sem colaboradores para calcular.</p>
              )}
            </article>

            <section className="dash-card dash-area-lista" aria-labelledby="titulo-lista">
              <div className="dash-card-topo">
                <div>
                  <h2 id="titulo-lista" ref={tituloLista} tabIndex={-1}>
                    Colaboradores
                  </h2>
                  <p className="dash-card-sub">
                    {linhas.length === todos.length
                      ? `${todos.length} ${todos.length === 1 ? 'colaborador' : 'colaboradores'}`
                      : `${linhas.length} de ${todos.length} colaboradores`}
                  </p>
                </div>
              </div>

              <div className="filtros">
                <div className="busca">
                  <label htmlFor="busca-colaborador" className="sr-only">
                    Buscar colaborador por nome
                  </label>
                  <input
                    id="busca-colaborador"
                    type="search"
                    placeholder="Buscar por nome"
                    value={busca}
                    onChange={(event) => atualizarParam('busca', event.target.value, '')}
                  />
                </div>
                <div className="segmentos" role="group" aria-label="Filtrar colaboradores">
                  {FILTROS.map((item) => (
                    <button
                      key={item.valor}
                      type="button"
                      className={item.valor === filtro ? 'segmento ativo' : 'segmento'}
                      aria-pressed={item.valor === filtro}
                      onClick={() => atualizarParam('filtro', item.valor, 'todos')}
                    >
                      {item.rotulo}
                    </button>
                  ))}
                </div>
                <div className="ordem-mobile">
                  <label htmlFor="ordem-mobile">Ordenar por</label>
                  <select
                    id="ordem-mobile"
                    value={`${ordem.campo}.${ordem.direcao}`}
                    onChange={(event) => atualizarParam('ordem', event.target.value, ORDEM_PADRAO)}
                  >
                    {!ORDENS_MOBILE.some((o) => o.valor === `${ordem.campo}.${ordem.direcao}`) && (
                      <option value={`${ordem.campo}.${ordem.direcao}`}>Personalizada</option>
                    )}
                    {ORDENS_MOBILE.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="sr-only" aria-live="polite">
                {linhas.length} de {todos.length} colaboradores exibidos
              </p>

              {linhas.length === 0 ? (
                <EstadoVazio titulo={todos.length ? 'Nenhum colaborador encontrado' : 'Nenhum colaborador neste fechamento'}>
                  {todos.length > 0 && (
                    <>
                      <p>{busca ? `Nenhum resultado para “${busca}” com o filtro atual.` : 'Nenhum colaborador neste filtro.'}</p>
                      <button type="button" className="btn-link" onClick={() => setParams({}, { replace: true })}>
                        Limpar filtros
                      </button>
                    </>
                  )}
                </EstadoVazio>
              ) : (
                <>
                  <div className="tabela-desktop">
                    <div className="table-wrap">
                      <table>
                        <caption className="sr-only">
                          Banco de horas dos colaboradores {consolidado ? 'de todas as unidades' : `de ${nomePainel}`}
                        </caption>
                        <thead>
                          <tr>
                            <CabecalhoOrdenavel campo="nome" rotulo="Nome" ordem={ordem} onClick={alternarOrdem} />
                            {COLUNAS.map((coluna) => (
                              <CabecalhoOrdenavel
                                key={coluna.campo}
                                campo={coluna.campo}
                                rotulo={coluna.rotulo}
                                ordem={ordem}
                                onClick={alternarOrdem}
                                numerico
                              />
                            ))}
                            <th scope="col">
                              <span className="sr-only">Indicador</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((linha) => (
                            <tr key={linha.id} className={linha.fora_da_curva ? `linha-${linha.fora_da_curva}` : undefined}>
                              <th scope="row" className="celula-nome">
                                <span className="celula-pessoa">
                                  <span className="avatar avatar-pequeno" aria-hidden="true">
                                    {iniciais(linha.nome)}
                                  </span>
                                  <span>
                                    <Link to={linkColaborador(linha)} state={origem}>
                                      {linha.nome}
                                    </Link>
                                    {complemento(linha) && <span className="celula-funcao">{complemento(linha)}</span>}
                                  </span>
                                </span>
                              </th>
                              <td className="num">
                                <Horas minutos={linha.saldo_min} sinal destacar className="forte" />
                              </td>
                              <td className="num">
                                <Horas minutos={linha.extra_min} />
                              </td>
                              <td className="num">
                                <Horas minutos={linha.negativa_min} />
                              </td>
                              <td className="num">
                                <Horas minutos={linha.pagas_min} />
                              </td>
                              <td>
                                <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe(linha)} pilula />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <ul className="lista-cartoes">
                    {linhas.map((linha) => (
                      <li key={linha.id}>
                        <Link
                          to={linkColaborador(linha)}
                          state={origem}
                          className={linha.fora_da_curva ? `cartao-colab linha-${linha.fora_da_curva}` : 'cartao-colab'}
                        >
                          <span className="cartao-colab-topo">
                            <span className="avatar avatar-pequeno" aria-hidden="true">
                              {iniciais(linha.nome)}
                            </span>
                            <span className="cartao-colab-nome">{linha.nome}</span>
                            <span className="cartao-colab-saldo">
                              <Horas minutos={linha.saldo_min} sinal destacar />
                              <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe(linha)} compacto />
                            </span>
                          </span>
                          <span className="cartao-colab-detalhe">
                            {consolidado && linha.unidade_nome && `${linha.unidade_nome} · `}
                            Extras <Horas minutos={linha.extra_min} /> · Neg. <Horas minutos={linha.negativa_min} /> · Pagas{' '}
                            <Horas minutos={linha.pagas_min} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>

          {incompleto && (
            <p className="rodape-nota">
              Exibindo {todos.length} de {dados.total} colaboradores (limite por página).
            </p>
          )}
          <p className="rodape-nota">Somente leitura. Ajustes de ponto são feitos pelo RH na FriPonto.</p>
        </>
      )}
    </section>
  )
}

interface CartaoKpiProps {
  rotulo: string
  valor: ReactNode
  contexto: string
  icone: ReactNode
  acao: string
  onAcao: () => void
  destaque?: boolean
  classeValor?: string
}

function CartaoKpi({ rotulo, valor, contexto, icone, acao, onAcao, destaque = false, classeValor = '' }: CartaoKpiProps) {
  return (
    <div className={destaque ? 'dash-kpi dash-kpi-destaque' : 'dash-kpi'}>
      <div className="dash-kpi-topo">
        <p className="dash-kpi-rotulo">{rotulo}</p>
        <button type="button" className="dash-kpi-acao" onClick={onAcao} aria-label={acao} title={acao}>
          <IconeSetaDiagonal tamanho={18} />
        </button>
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

function ItemResumo({
  icone,
  rotulo,
  detalhe,
  minutos,
  sinal = false,
}: {
  icone: ReactNode
  rotulo: string
  detalhe: string
  minutos: Minutos
  sinal?: boolean
}) {
  return (
    <li>
      <span className="dash-resumo-icone" aria-hidden="true">
        {icone}
      </span>
      <span className="dash-resumo-texto">
        <span className="dash-resumo-rotulo">{rotulo}</span>
        <span className="dash-resumo-detalhe">{detalhe}</span>
      </span>
      <Horas minutos={minutos} sinal={sinal} destacar={sinal} className="dash-resumo-valor" />
    </li>
  )
}

interface CabecalhoProps {
  campo: CampoOrdem
  rotulo: string
  ordem: { campo: CampoOrdem; direcao: Direcao }
  onClick: (campo: CampoOrdem) => void
  numerico?: boolean
}

function CabecalhoOrdenavel({ campo, rotulo, ordem, onClick, numerico = false }: CabecalhoProps) {
  const ativo = ordem.campo === campo
  const ariaSort = ativo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'

  return (
    <th scope="col" aria-sort={ariaSort} className={numerico ? 'num' : undefined}>
      <button type="button" className={ativo ? 'ordenar ativo' : 'ordenar'} onClick={() => onClick(campo)}>
        {rotulo}
        <span aria-hidden="true" className="ordenar-seta">
          {ativo ? (ordem.direcao === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}
