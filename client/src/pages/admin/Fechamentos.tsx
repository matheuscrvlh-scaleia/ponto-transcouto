import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useSearchParams } from 'react-router-dom'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Aviso, Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { PilulaStatus } from '../../components/PilulaStatus'
import { api } from '../../lib/api'
import { formatarData, formatarDataHora, formatarDiaSemana, formatarDuracao } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { CotaSecullum, FechamentoAdmin, StatusFechamento, UnidadeAdmin } from '../../types/api'
import { DetalheFechamento, TextoReprocessar } from './DetalheFechamento'
import { estaAtrasado } from './fechamentos-util'
import { PreviaCalendario } from './PreviaCalendario'

const INTERVALO_ATUALIZACAO_MS = 10_000
const LIMITE = 300

const STATUS: { valor: StatusFechamento; rotulo: string }[] = [
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'processando', rotulo: 'Processando' },
  { valor: 'sucesso', rotulo: 'Sucesso' },
  { valor: 'falhou', rotulo: 'Falhou' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
]

export function Fechamentos() {
  useEffect(() => {
    document.title = 'Fechamentos — Copiloto de Ponto'
  }, [])

  return (
    <Routes>
      <Route index element={<PainelFechamentos />} />
      <Route path=":fechamentoId" element={<DetalheFechamento />} />
    </Routes>
  )
}

function PainelFechamentos() {
  const { empresaId, query, ehAdmin } = useEmpresaSelecionada()
  const [params, setParams] = useSearchParams()
  const [reprocessando, setReprocessando] = useState<FechamentoAdmin | null>(null)
  const filtros = {
    unidade_id: params.get('unidade') ?? '',
    status: params.get('status') ?? '',
    de: params.get('de') ?? '',
    ate: params.get('ate') ?? '',
  }
  const chaveFiltros = JSON.stringify(filtros)

  const lista = useRecurso(
    (signal) =>
      api<FechamentoAdmin[]>('/admin/fechamentos', {
        signal,
        query: { ...query, ...filtros, limite: LIMITE },
      }),
    `fechamentos-${empresaId}-${chaveFiltros}`,
  )
  const unidades = useRecurso(
    (signal) => api<UnidadeAdmin[]>('/admin/unidades', { signal, query }),
    `unidades-admin-${empresaId}`,
  )
  const cota = useRecurso(
    (signal) => api<CotaSecullum>('/admin/cota-secullum', { signal, query }),
    `cota-${empresaId}`,
  )

  const recarregarLista = lista.recarregar
  const recarregarCota = cota.recarregar
  const ativo = (lista.dados ?? []).some((f) => f.status === 'processando' || estaAtrasado(f))
  useEffect(() => {
    if (!ativo) return
    const timer = window.setInterval(() => {
      recarregarLista()
      recarregarCota()
    }, INTERVALO_ATUALIZACAO_MS)
    return () => window.clearInterval(timer)
  }, [ativo, recarregarLista, recarregarCota])

  const semanas = useMemo(() => {
    const grupos = new Map<string, FechamentoAdmin[]>()
    for (const fechamento of lista.dados ?? []) {
      const chave = `${fechamento.data_referencia}|${fechamento.tipo}`
      grupos.set(chave, [...(grupos.get(chave) ?? []), fechamento])
    }
    return [...grupos.values()]
  }, [lista.dados])

  function atualizarFiltro(chave: string, valor: string) {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (valor) proximo.set(chave, valor)
        else proximo.delete(chave)
        return proximo
      },
      { replace: true },
    )
  }

  const temFiltro = Object.values(filtros).some(Boolean)

  return (
    <section className="pagina">
      <header className="pagina-header">
        <h1>Painel de fechamentos</h1>
        <p className="pagina-sub">Extração semanal por unidade. A lista se atualiza sozinha enquanto houver processamento.</p>
      </header>

      <CartaoCota cota={cota} />

      <div className="filtros-admin" role="group" aria-label="Filtros">
        <div className="field">
          <label htmlFor="filtro-unidade">Unidade</label>
          <select id="filtro-unidade" value={filtros.unidade_id} onChange={(e) => atualizarFiltro('unidade', e.target.value)}>
            <option value="">Todas</option>
            {(unidades.dados ?? []).map((unidade) => (
              <option key={unidade.id} value={unidade.id}>
                {unidade.nome_exibicao ?? unidade.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filtro-status">Status</label>
          <select id="filtro-status" value={filtros.status} onChange={(e) => atualizarFiltro('status', e.target.value)}>
            <option value="">Todos</option>
            {STATUS.map((status) => (
              <option key={status.valor} value={status.valor}>
                {status.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filtro-de">Dados de</label>
          <input id="filtro-de" type="date" value={filtros.de} onChange={(e) => atualizarFiltro('de', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="filtro-ate">até</label>
          <input id="filtro-ate" type="date" value={filtros.ate} onChange={(e) => atualizarFiltro('ate', e.target.value)} />
        </div>
        {temFiltro && (
          <button type="button" className="btn-link" onClick={() => setParams({}, { replace: true })}>
            Limpar filtros
          </button>
        )}
      </div>

      {lista.carregando && <Carregando texto="Carregando fechamentos..." />}
      {lista.erro && <ErroCarregamento erro={lista.erro} onTentarDeNovo={lista.recarregar} />}
      {lista.dados && semanas.length === 0 && (
        <EstadoVazio titulo={temFiltro ? 'Nenhum fechamento com esses filtros' : 'Nenhum fechamento ainda'}>
          <p>
            {temFiltro
              ? 'Ajuste ou limpe os filtros.'
              : 'A régua ainda não gerou fechamentos para esta empresa — confira o calendário abaixo.'}
          </p>
        </EstadoVazio>
      )}

      {semanas.map((fechamentos, indice) => (
        <GrupoSemana
          key={`${fechamentos[0].data_referencia}-${fechamentos[0].tipo}`}
          fechamentos={fechamentos}
          aberto={indice < 2}
          onReprocessar={ehAdmin ? setReprocessando : undefined}
        />
      ))}

      {lista.dados && lista.dados.length >= LIMITE && (
        <p className="rodape-nota">Exibindo os {LIMITE} fechamentos mais recentes. Use os filtros de período para ver outros.</p>
      )}

      <PreviaCalendario podeAjustar={ehAdmin} onAjustado={lista.recarregar} />

      {reprocessando && (
        <ModalConfirmacao
          titulo={`Reprocessar ${reprocessando.unidade.nome}`}
          rotuloConfirmar="Reprocessar"
          motivo="opcional"
          onFechar={() => setReprocessando(null)}
          onConfirmar={async (motivo) => {
            await api(`/admin/fechamentos/${reprocessando.id}/reprocessar`, { method: 'POST', json: { motivo } })
            setReprocessando(null)
            lista.recarregar()
          }}
        >
          <TextoReprocessar fechamento={reprocessando} />
        </ModalConfirmacao>
      )}
    </section>
  )
}

function CartaoCota({ cota }: { cota: ReturnType<typeof useRecurso<CotaSecullum>> }) {
  if (cota.carregando) return null
  if (cota.erro || !cota.dados) {
    return (
      <p className="texto-suave" role="status">
        Não foi possível carregar a cota da Secullum.{' '}
        <button type="button" className="btn-link" onClick={cota.recarregar}>
          Tentar de novo
        </button>
      </p>
    )
  }
  const { usadas_ultima_hora: usadas, limite, disponiveis, proxima_liberacao, limite_secullum } = cota.dados
  const pct = Math.min(100, Math.round((usadas / Math.max(limite, 1)) * 100))

  return (
    <section className="card" aria-labelledby="titulo-cota">
      <div className="card-cabecalho">
        <h2 id="titulo-cota">Cota da Secullum (última hora)</h2>
        <span className={disponiveis === 0 ? 'pilula pilula-falhou' : 'pilula pilula-sucesso'}>
          {disponiveis} disponíve{disponiveis === 1 ? 'l' : 'is'}
        </span>
      </div>
      <div className="progresso">
        <div
          className="progresso-barra"
          role="progressbar"
          aria-label="Uso da cota"
          aria-valuemin={0}
          aria-valuemax={limite}
          aria-valuenow={usadas}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="resumo-linha">
          <span>
            <strong>{usadas}</strong> de <strong>{limite}</strong> chamadas de cálculo usadas
          </span>
          {limite !== limite_secullum && <span>(limite da Secullum: {limite_secullum}/h)</span>}
          {proxima_liberacao && <span>Próxima liberação: {formatarDataHora(proxima_liberacao)}</span>}
        </p>
      </div>
    </section>
  )
}

function Progresso({ fechamento }: { fechamento: FechamentoAdmin }) {
  const execucao = fechamento.ultima_execucao
  if (!execucao) return <span className="texto-suave">—</span>
  const total = execucao.total_colaboradores || fechamento.total_colaboradores || 0
  const pct = total ? Math.round((execucao.processados / total) * 100) : 0
  return (
    <div className="progresso">
      <div
        className="progresso-barra"
        role="progressbar"
        aria-label={`Progresso de ${fechamento.unidade.nome}`}
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

function Gatilho({ fechamento }: { fechamento: FechamentoAdmin }) {
  return (
    <>
      {formatarDiaSemana(fechamento.gatilho_em)}
      {fechamento.gatilho_ajustado && (
        <span className="celula-sub">
          Ajustado{fechamento.gatilho_ajustado_por ? ` por ${fechamento.gatilho_ajustado_por.nome}` : ''}
        </span>
      )}
    </>
  )
}

function UltimaExecucao({ fechamento }: { fechamento: FechamentoAdmin }) {
  const execucao = fechamento.ultima_execucao
  if (!execucao) {
    return fechamento.proxima_tentativa_em && fechamento.status === 'pendente' ? (
      <span className="celula-sub">Próxima tentativa {formatarDataHora(fechamento.proxima_tentativa_em)}</span>
    ) : (
      <span className="texto-suave">—</span>
    )
  }
  return (
    <>
      {formatarDataHora(execucao.iniciado_em)}
      <span className="celula-sub">
        {formatarDuracao(execucao.iniciado_em, execucao.finalizado_em)}
        {execucao.disparo === 'manual' && ` · manual${execucao.disparado_por ? ` (${execucao.disparado_por.nome})` : ''}`}
      </span>
    </>
  )
}

function Motivo({ fechamento }: { fechamento: FechamentoAdmin }) {
  const mensagem = fechamento.status === 'falhou' ? fechamento.ultima_execucao?.mensagem_erro : null
  if (!mensagem) return null
  return <span className="celula-motivo">{mensagem.length > 160 ? `${mensagem.slice(0, 160)}…` : mensagem}</span>
}

interface GrupoProps {
  fechamentos: FechamentoAdmin[]
  aberto: boolean
  onReprocessar?: (fechamento: FechamentoAdmin) => void
}

function GrupoSemana({ fechamentos, aberto, onReprocessar }: GrupoProps) {
  const [primeiro] = fechamentos
  const contagem = (status: StatusFechamento) => fechamentos.filter((f) => f.status === status).length
  const atrasados = fechamentos.filter(estaAtrasado).length
  const titulo = `Dados até ${formatarData(primeiro.data_referencia)}`

  return (
    <details className="card card-tabela grupo-semana detalhes-bloco" open={aberto}>
      <summary className="grupo-semana-titulo">
        <h2>
          {titulo}
          {primeiro.tipo === 'fechamento_mes' && ' · fechamento do mês'}
        </h2>
        <span className="resumo-linha">
          <span>
            {fechamentos.length} unidade{fechamentos.length === 1 ? '' : 's'}
          </span>
          {STATUS.map(({ valor, rotulo }) => {
            const n = contagem(valor)
            return n ? <span key={valor}>{`${n} ${rotulo.toLowerCase()}`}</span> : null
          })}
          {atrasados > 0 && <strong className="texto-negativo">{atrasados} atrasado{atrasados === 1 ? '' : 's'}</strong>}
        </span>
      </summary>

      {contagem('falhou') > 0 && (
        <div className="card-tabela-titulo">
          <Aviso>Há unidades com falha nesta semana. Veja o motivo e reprocesse quando a causa estiver resolvida.</Aviso>
        </div>
      )}

      <div className="table-wrap tabela-desktop tabela-fechamentos">
        <table>
          <caption className="sr-only">Fechamentos com {titulo.toLowerCase()}</caption>
          <thead>
            <tr>
              <th scope="col">Unidade</th>
              <th scope="col">Gatilho</th>
              <th scope="col">Status</th>
              <th scope="col">Última execução</th>
              <th scope="col">Progresso</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {fechamentos.map((fechamento) => (
              <tr key={fechamento.id} className={fechamento.status === 'falhou' ? 'linha-negativo' : undefined}>
                <th scope="row" className="celula-nome">
                  <Link to={String(fechamento.id)}>{fechamento.unidade.nome}</Link>
                  <span className="celula-sub">
                    {formatarData(fechamento.periodo_inicio, { ano: false })}–{formatarData(fechamento.data_referencia, { ano: false })}
                  </span>
                </th>
                <td>
                  <Gatilho fechamento={fechamento} />
                </td>
                <td>
                  <PilulaStatus status={fechamento.status} atrasado={estaAtrasado(fechamento)} />
                  <Motivo fechamento={fechamento} />
                </td>
                <td>
                  <UltimaExecucao fechamento={fechamento} />
                </td>
                <td>
                  <Progresso fechamento={fechamento} />
                </td>
                <td className="table-actions">
                  {onReprocessar && fechamento.status === 'falhou' && (
                    <button type="button" className="btn-link" onClick={() => onReprocessar(fechamento)}>
                      Reprocessar
                    </button>
                  )}
                  <Link to={String(fechamento.id)} className="btn-link" aria-label={`Detalhes de ${fechamento.unidade.nome}`}>
                    Detalhes
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="cartoes-admin" aria-label={titulo}>
        {fechamentos.map((fechamento) => (
          <li key={fechamento.id} className="cartao-admin">
            <div className="cartao-admin-topo">
              <span className="cartao-admin-titulo">{fechamento.unidade.nome}</span>
              <PilulaStatus status={fechamento.status} atrasado={estaAtrasado(fechamento)} />
            </div>
            <Motivo fechamento={fechamento} />
            <span>
              Gatilho: <Gatilho fechamento={fechamento} />
            </span>
            {fechamento.ultima_execucao && <Progresso fechamento={fechamento} />}
            <div className="barra-acoes">
              {onReprocessar && fechamento.status === 'falhou' && (
                <button type="button" className="btn-link" onClick={() => onReprocessar(fechamento)}>
                  Reprocessar
                </button>
              )}
              <Link to={String(fechamento.id)} className="btn-link">
                Ver detalhes
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </details>
  )
}
