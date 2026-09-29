import { useEffect, useMemo } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Aviso, Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { Horas } from '../components/Horas'
import { IndicadorCurva } from '../components/IndicadorCurva'
import { api } from '../lib/api'
import { formatarData, formatarDataHora, formatarDiaSemana, normalizarBusca } from '../lib/formato'
import { salvarUltimaUnidade } from '../lib/preferencias'
import { useRecurso } from '../lib/useRecurso'
import type { DashboardUnidade as Dashboard, FiltroDashboard, LinhaDashboard } from '../types/api'

const MAX_POR_PAGINA = 500

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

export function DashboardUnidade() {
  const { unidadeId } = useParams()
  const { perfil } = useAuth()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<Dashboard>(`/unidades/${unidadeId}/dashboard`, { signal, query: { por_pagina: MAX_POR_PAGINA } }),
    `dashboard-${unidadeId}`,
  )

  const busca = params.get('busca') ?? ''
  const filtro = lerFiltro(params.get('filtro'))
  const ordem = lerOrdem(params.get('ordem'))

  useEffect(() => {
    if (unidadeId) salvarUltimaUnidade(Number(unidadeId))
  }, [unidadeId])

  useEffect(() => {
    document.title = dados ? `${dados.unidade.nome} — Copiloto de Ponto` : 'Copiloto de Ponto'
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
    atualizarParam('ordem', `${campo}.${direcao}`, 'saldo_min.desc')
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

  if (carregando) return <Carregando texto="Carregando unidade..." />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const { unidade, fechamento, limites } = dados
  const todos = dados.colaboradores
  const acima = dados.resumo?.fora_positivo ?? todos.filter((linha) => linha.fora_da_curva === 'positivo').length
  const abaixo = dados.resumo?.fora_negativo ?? todos.filter((linha) => linha.fora_da_curva === 'negativo').length
  const totalPagas = dados.resumo?.pagas_total_min ?? todos.reduce((soma, linha) => soma + linha.pagas_min, 0)
  const totalColaboradores = dados.resumo?.total ?? dados.total
  const incompleto = dados.total > todos.length
  const origem = { de: location.pathname + location.search }

  const limiteDe = (linha: LinhaDashboard) =>
    linha.fora_da_curva === 'positivo' ? limites.alerta_pos : linha.fora_da_curva === 'negativo' ? limites.alerta_neg : undefined

  return (
    <section className="pagina">
      <header className="pagina-header">
        <h1>{unidade.nome}</h1>
        {fechamento && (
          <p className="pagina-sub">
            Dados atualizados em {formatarDataHora(fechamento.publicado_em)}
            {' — '}
            {fechamento.periodo_inicio
              ? `período de ${formatarData(fechamento.periodo_inicio, { ano: false })} a ${formatarData(fechamento.data_referencia, { ano: false })}`
              : `dados até ${formatarData(fechamento.data_referencia)}`}
            {fechamento.semana_fechamento_mes && ' (fechamento do mês)'}
          </p>
        )}
      </header>

      {dados.aviso_fechamento_mes && (
        <Aviso>Dados podem levar mais tempo para atualizar essa semana devido ao fechamento da folha.</Aviso>
      )}

      {!fechamento ? (
        <EstadoVazio titulo="Ainda não há dados consolidados para esta unidade">
          <p>
            Os dados são atualizados uma vez por semana, depois que o RH ajusta o ponto (normalmente às quartas-feiras).
          </p>
          {dados.proximo_fechamento_previsto && (
            <p>
              Próxima atualização prevista: <strong>{formatarDiaSemana(dados.proximo_fechamento_previsto)}</strong>
            </p>
          )}
          {perfil === 'admin' && (
            <Link to="/admin/fechamentos" className="btn-link">
              Ver painel de fechamentos
            </Link>
          )}
        </EstadoVazio>
      ) : (
        <>
          <dl className="kpis">
            <div className="kpi">
              <dt>Colaboradores</dt>
              <dd>{totalColaboradores}</dd>
            </div>
            <div className="kpi">
              <dt>Acima do limite</dt>
              <dd className={acima ? 'texto-positivo' : ''}>{acima}</dd>
            </div>
            <div className="kpi">
              <dt>Abaixo do limite</dt>
              <dd className={abaixo ? 'texto-negativo' : ''}>{abaixo}</dd>
            </div>
            <div className="kpi">
              <dt>Pagas no período</dt>
              <dd>
                <Horas minutos={totalPagas} />
              </dd>
            </div>
          </dl>

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
                onChange={(event) => atualizarParam('ordem', event.target.value, 'saldo_min.desc')}
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
              <div className="card card-tabela tabela-desktop">
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Banco de horas dos colaboradores de {unidade.nome}</caption>
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
                            <Link to={`/unidades/${unidade.id}/colaboradores/${linha.id}`} state={origem}>
                              {linha.nome}
                            </Link>
                            {linha.funcao && <span className="celula-funcao">{linha.funcao}</span>}
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
                            <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe(linha)} />
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
                      to={`/unidades/${unidade.id}/colaboradores/${linha.id}`}
                      state={origem}
                      className={linha.fora_da_curva ? `cartao-colab linha-${linha.fora_da_curva}` : 'cartao-colab'}
                    >
                      <span className="cartao-colab-topo">
                        <span className="cartao-colab-nome">{linha.nome}</span>
                        <span className="cartao-colab-saldo">
                          <Horas minutos={linha.saldo_min} sinal destacar />
                          <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe(linha)} compacto />
                        </span>
                      </span>
                      <span className="cartao-colab-detalhe">
                        Extras <Horas minutos={linha.extra_min} /> · Neg. <Horas minutos={linha.negativa_min} /> · Pagas{' '}
                        <Horas minutos={linha.pagas_min} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

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
