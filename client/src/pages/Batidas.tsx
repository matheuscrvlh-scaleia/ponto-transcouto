import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { api } from '../lib/api'
import {
  dataDoInstante,
  datasDoPeriodo,
  formatarData,
  formatarDiaPorExtenso,
  formatarHoraOuData,
  hojeISO,
  iniciais,
  PERIODOS_RAPIDOS,
  periodoRapidoDe,
  type PeriodoRapido,
} from '../lib/formato'
import { useRecurso } from '../lib/useRecurso'
import type { Batida, BatidasResposta, FiltroTipoBatida } from '../types/api'
import './dashboard.css'
import './batidas.css'
import { TituloPagina } from '../components/TituloPagina'

const POR_PAGINA = 50
/** O worker traz as batidas novas a cada ~5 min; a primeira página se atualiza sozinha. */
const INTERVALO_ATUALIZACAO_MS = 2 * 60_000
const ESPERA_BUSCA_MS = 350

const TIPOS: { valor: FiltroTipoBatida; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'validas', rotulo: 'Válidas' },
  { valor: 'manuais', rotulo: 'Manuais' },
  { valor: 'desconsideradas', rotulo: 'Desconsideradas' },
]

/** Origem da marcação na FriPonto (FonteDados). */
const ORIGENS: Record<number, string> = {
  0: 'Desconhecida',
  1: 'Relógio de ponto',
  2: 'Incluída manualmente',
  3: 'Pré-assinalada',
  4: 'Check-in',
  5: 'Central do Funcionário (web)',
  6: 'Aplicativo',
  7: 'Aplicativo (offline)',
  8: 'Integração externa',
}
const ORIGENS_NO_FILTRO = [1, 6, 7, 5, 4, 2, 3, 8]

type Situacao = { rotulo: string; classe: 'original' | 'manual' | 'pre' | 'desconsiderada' }

function situacaoDa(batida: Batida): Situacao {
  if (batida.tipo === 3) return { rotulo: 'Desconsiderada', classe: 'desconsiderada' }
  if (batida.tipo === 1 || batida.origem === 2) return { rotulo: 'Manual', classe: 'manual' }
  if (batida.tipo === 2) return { rotulo: 'Pré-assinalada', classe: 'pre' }
  return { rotulo: 'Original', classe: 'original' }
}

const origemDa = (batida: Batida) => ORIGENS[batida.origem] ?? `Origem ${batida.origem}`

/** "lançada em 01/10 às 09:12" — só quando a marcação entrou na FriPonto em outro dia ou horário. */
function textoInclusao(batida: Batida) {
  if (!batida.incluida_em) return null
  const [dia, horario = ''] = batida.incluida_em.split('T')
  const hora = horario.slice(0, 5)
  if (dia === batida.data && hora === batida.hora) return null
  return `lançada em ${formatarData(dia, { ano: false })} às ${hora}`
}

function lerTipo(valor: string | null): FiltroTipoBatida {
  return TIPOS.some((tipo) => tipo.valor === valor) ? (valor as FiltroTipoBatida) : 'todas'
}

function lerNumero(valor: string | null) {
  const numero = Number(valor)
  return valor && Number.isInteger(numero) && numero >= 0 ? numero : undefined
}

const lerData = (valor: string | null) => (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined)

/** Horário em destaque e a data da batida ao lado. */
function DataHoraBatida({ batida }: { batida: Batida }) {
  return (
    <>
      <span className="batida-horario">{batida.hora.slice(0, 5)}</span>
      <span className="batida-data">{formatarData(batida.data)}</span>
    </>
  )
}

export function Batidas() {
  const { unidades } = useAuth()
  const { ehAdmin, empresaId, query: empresaQuery } = useEmpresaAdmin()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const topoLista = useRef<HTMLDivElement>(null)

  const busca = params.get('busca') ?? ''
  const colaboradorId = lerNumero(params.get('colaborador'))
  const unidadeId = lerNumero(params.get('unidade'))
  const de = lerData(params.get('de'))
  const ate = lerData(params.get('ate'))
  const tipo = lerTipo(params.get('tipo'))
  const origemFiltro = lerNumero(params.get('origem'))
  const pagina = Math.max(lerNumero(params.get('pagina')) ?? 1, 1)

  // a busca digitada vai para a URL (e para o servidor) depois de uma pausa
  const [textoBusca, setTextoBusca] = useState(busca)
  // 'Limpar filtros' e voltar/avançar do navegador trazem a busca da URL de volta para o campo
  const [buscaDaUrl, setBuscaDaUrl] = useState(busca)
  if (busca !== buscaDaUrl) {
    setBuscaDaUrl(busca)
    setTextoBusca(busca)
  }
  useEffect(() => {
    const alvo = textoBusca.trim()
    if (alvo === busca) return
    const timer = window.setTimeout(() => {
      setParams(
        (atual) => {
          const proximo = new URLSearchParams(atual)
          if (alvo) proximo.set('busca', alvo)
          else proximo.delete('busca')
          proximo.delete('pagina')
          return proximo
        },
        { replace: true },
      )
    }, ESPERA_BUSCA_MS)
    return () => window.clearTimeout(timer)
  }, [textoBusca, busca, setParams])

  const query = {
    busca: busca || undefined,
    colaborador_id: colaboradorId,
    unidade_id: unidadeId,
    de,
    ate,
    tipo: tipo === 'todas' ? undefined : tipo,
    origem: origemFiltro,
    pagina,
    por_pagina: POR_PAGINA,
    ...empresaQuery,
  }
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<BatidasResposta>('/batidas', { signal, query }),
    `batidas-${JSON.stringify(query)}`,
  )

  useEffect(() => {
    document.title = 'Batidas — Copiloto de Ponto'
  }, [])

  useEffect(() => {
    if (pagina !== 1) return
    const timer = window.setInterval(recarregar, INTERVALO_ATUALIZACAO_MS)
    return () => window.clearInterval(timer)
  }, [pagina, recarregar])

  /** Muda filtros na URL; qualquer filtro novo volta para a primeira página. */
  function atualizar(mudancas: Record<string, string | number | undefined>) {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        for (const [chave, valor] of Object.entries(mudancas)) {
          if (valor === undefined || valor === '') proximo.delete(chave)
          else proximo.set(chave, String(valor))
        }
        if (!('pagina' in mudancas)) proximo.delete('pagina')
        return proximo
      },
      { replace: !('pagina' in mudancas) },
    )
  }

  function irParaPagina(nova: number) {
    atualizar({ pagina: nova > 1 ? nova : undefined })
    topoLista.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const unidadesVisiveis = (ehAdmin && empresaId != null ? unidades.filter((u) => u.empresa_id === empresaId) : unidades)
    .slice()
    .sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, 'pt-BR'))
  const variasUnidades = unidadesVisiveis.length > 1
  const comFiltro = Boolean(busca || colaboradorId || unidadeId || de || ate || tipo !== 'todas' || origemFiltro !== undefined)
  const origemLink = { de: location.pathname + location.search }
  const hoje = hojeISO()

  const itens = dados?.itens ?? []
  const total = dados?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const primeiro = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1
  const ultimo = Math.min(pagina * POR_PAGINA, total)
  const nomeColaborador = colaboradorId ? itens.find((b) => b.colaborador.id === colaboradorId)?.colaborador.nome : null

  const linkColaborador = (batida: Batida) => `/unidades/${batida.unidade.id}/colaboradores/${batida.colaborador.id}`

  return (
    <section className="pagina dash batidas">
      <header className="dash-header">
        <TituloPagina>Batidas</TituloPagina>
        <p className="pagina-sub">
          Marcações de ponto vindas da FriPonto, da mais recente para a mais antiga
          {dados?.importado_em &&
            ` · atualizado ${dataDoInstante(dados.importado_em) === hoje ? 'às' : 'em'} ${formatarHoraOuData(dados.importado_em)}`}
        </p>
      </header>

      <section className="dash-card batidas-card" aria-labelledby="titulo-batidas">
        <div className="dash-card-topo" ref={topoLista}>
          <div>
            <h2 id="titulo-batidas">Log de batidas</h2>
            <p className="dash-card-sub" aria-live="polite">
              {dados ? (total === 1 ? '1 batida' : `${total.toLocaleString('pt-BR')} batidas`) : ' '}
              {comFiltro && dados && ' com os filtros atuais'}
            </p>
          </div>
        </div>

        <div className="filtros batidas-filtros">
          <div className="busca">
            <label htmlFor="busca-batidas" className="sr-only">
              Buscar colaborador por nome
            </label>
            <input
              id="busca-batidas"
              type="search"
              placeholder="Buscar colaborador"
              value={textoBusca}
              onChange={(event) => setTextoBusca(event.target.value)}
            />
          </div>

          {variasUnidades && (
            <label className="batidas-campo">
              <span>Unidade</span>
              <select value={unidadeId ?? ''} onChange={(event) => atualizar({ unidade: event.target.value })}>
                <option value="">Todas</option>
                {unidadesVisiveis.map((unidade) => (
                  <option key={unidade.id} value={unidade.id}>
                    {unidade.nome_exibicao}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="batidas-campo">
            <span>Período</span>
            <select
              value={periodoRapidoDe(de, ate, hoje) ?? (de || ate ? 'livre' : '')}
              onChange={(event) => {
                const valor = event.target.value
                if (valor === '') atualizar({ de: undefined, ate: undefined })
                else if (valor !== 'livre') atualizar(datasDoPeriodo(valor as PeriodoRapido, hoje))
              }}
            >
              <option value="">Qualquer data</option>
              {PERIODOS_RAPIDOS.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.rotulo}
                </option>
              ))}
              {/* datas escolhidas à mão: só aparece enquanto não batem com nenhuma seleção rápida */}
              {periodoRapidoDe(de, ate, hoje) === null && (de || ate) && <option value="livre">Personalizado</option>}
            </select>
          </label>
          <label className="batidas-campo">
            <span>De</span>
            <input type="date" value={de ?? ''} max={ate ?? hoje} onChange={(event) => atualizar({ de: event.target.value })} />
          </label>
          <label className="batidas-campo">
            <span>Até</span>
            <input type="date" value={ate ?? ''} min={de} max={hoje} onChange={(event) => atualizar({ ate: event.target.value })} />
          </label>

          <label className="batidas-campo">
            <span>Origem</span>
            <select value={origemFiltro ?? ''} onChange={(event) => atualizar({ origem: event.target.value })}>
              <option value="">Todas</option>
              {ORIGENS_NO_FILTRO.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {ORIGENS[codigo]}
                </option>
              ))}
            </select>
          </label>

          <div className="segmentos" role="group" aria-label="Filtrar por situação">
            {TIPOS.map((item) => (
              <button
                key={item.valor}
                type="button"
                className={item.valor === tipo ? 'segmento ativo' : 'segmento'}
                aria-pressed={item.valor === tipo}
                onClick={() => atualizar({ tipo: item.valor === 'todas' ? undefined : item.valor })}
              >
                {item.rotulo}
              </button>
            ))}
          </div>
        </div>

        {(colaboradorId || comFiltro) && (
          <div className="batidas-ativos">
            {colaboradorId && (
              <span className="batidas-chip">
                Colaborador: {nomeColaborador ?? 'selecionado'}
                <button type="button" onClick={() => atualizar({ colaborador: undefined })} aria-label="Remover filtro de colaborador">
                  ×
                </button>
              </span>
            )}
            {comFiltro && (
              <button type="button" className="btn-link" onClick={() => setParams({}, { replace: true })}>
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {carregando && !dados ? (
          <Carregando texto="Carregando batidas..." />
        ) : erro ? (
          <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />
        ) : itens.length === 0 ? (
          comFiltro || pagina > 1 ? (
            <EstadoVazio titulo="Nenhuma batida encontrada">
              <p>Nenhuma marcação com os filtros atuais.</p>
              <button type="button" className="btn-link" onClick={() => setParams({}, { replace: true })}>
                Limpar filtros
              </button>
            </EstadoVazio>
          ) : (
            <EstadoVazio titulo="Nenhuma batida ainda">
              <p>
                As batidas chegam da FriPonto automaticamente, a cada poucos minutos, depois que a integração da empresa está
                configurada.
              </p>
            </EstadoVazio>
          )
        ) : (
          <>
            <div className="tabela-desktop">
              <div className="table-wrap">
                <table className="batidas-tabela">
                  <caption className="sr-only">Batidas de ponto, da mais recente para a mais antiga</caption>
                  <thead>
                    <tr>
                      <th scope="col">Data e hora</th>
                      <th scope="col">Colaborador</th>
                      {variasUnidades && <th scope="col">Unidade</th>}
                      <th scope="col">Origem</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((batida, i) => {
                      const novoDia = i === 0 || itens[i - 1].data !== batida.data
                      const situacao = situacaoDa(batida)
                      const inclusao = textoInclusao(batida)
                      return (
                        <Fragment key={batida.id}>
                          {novoDia && (
                            <tr className="batidas-dia">
                              <th scope="colgroup" colSpan={variasUnidades ? 5 : 4}>
                                {formatarDiaPorExtenso(batida.data)}
                                <span>{formatarData(batida.data)}</span>
                              </th>
                            </tr>
                          )}
                          <tr className={situacao.classe === 'desconsiderada' ? 'batida-desconsiderada' : undefined}>
                            <td className="batida-hora">
                              <DataHoraBatida batida={batida} />
                            </td>
                            <td>
                              <span className="celula-pessoa">
                                <span className="avatar avatar-pequeno" aria-hidden="true">
                                  {iniciais(batida.colaborador.nome)}
                                </span>
                                <span>
                                  <Link to={linkColaborador(batida)} state={origemLink}>
                                    {batida.colaborador.nome}
                                  </Link>
                                  {batida.colaborador.funcao && <span className="celula-funcao">{batida.colaborador.funcao}</span>}
                                </span>
                              </span>
                            </td>
                            {variasUnidades && <td>{batida.unidade.nome}</td>}
                            <td>{origemDa(batida)}</td>
                            <td>
                              <span className={`batida-situacao situacao-${situacao.classe}`}>{situacao.rotulo}</span>
                              {inclusao && <span className="batida-inclusao">{inclusao}</span>}
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="lista-cartoes batidas-cartoes">
              {itens.map((batida, i) => {
                const novoDia = i === 0 || itens[i - 1].data !== batida.data
                const situacao = situacaoDa(batida)
                return (
                  <Fragment key={batida.id}>
                    {novoDia && (
                      <li className="batidas-dia-mobile">
                        {formatarDiaPorExtenso(batida.data)} <span>{formatarData(batida.data)}</span>
                      </li>
                    )}
                    <li>
                      <Link
                        to={linkColaborador(batida)}
                        state={origemLink}
                        className={situacao.classe === 'desconsiderada' ? 'cartao-colab batida-desconsiderada' : 'cartao-colab'}
                      >
                        <span className="cartao-colab-topo">
                          <span className="batida-hora">
                            <DataHoraBatida batida={batida} />
                          </span>
                          <span className="cartao-colab-nome">{batida.colaborador.nome}</span>
                          <span className={`batida-situacao situacao-${situacao.classe}`}>{situacao.rotulo}</span>
                        </span>
                        <span className="cartao-colab-detalhe">
                          {[variasUnidades ? batida.unidade.nome : null, origemDa(batida), textoInclusao(batida)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </Link>
                    </li>
                  </Fragment>
                )
              })}
            </ul>

            <nav className="batidas-paginacao" aria-label="Paginação das batidas">
              <span>
                {primeiro.toLocaleString('pt-BR')}–{ultimo.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
                {totalPaginas > 1 && ` · página ${pagina} de ${totalPaginas}`}
              </span>
              {totalPaginas > 1 && (
                <span className="batidas-paginacao-botoes">
                  <button type="button" className="btn-secondary" disabled={pagina <= 1} onClick={() => irParaPagina(pagina - 1)}>
                    Mais recentes
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pagina >= totalPaginas}
                    onClick={() => irParaPagina(pagina + 1)}
                  >
                    Mais antigas
                  </button>
                </span>
              )}
            </nav>
          </>
        )}
      </section>

      <p className="rodape-nota">Somente leitura. Ajustes de ponto são feitos pelo RH na FriPonto.</p>
    </section>
  )
}
