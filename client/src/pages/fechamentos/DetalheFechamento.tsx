import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Aviso, Carregando, ErroCarregamento } from '../../components/Estados'
import { IconeAtividade, IconeCalendario, IconeRelogio, IconeUsuarios } from '../../components/Icones'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { PilulaStatus } from '../../components/PilulaStatus'
import { TituloPagina } from '../../components/TituloPagina'
import { useEmpresaAdmin } from '../../context/EmpresaAdminContext'
import { alertarSucesso } from '../../lib/alertas'
import { api } from '../../lib/api'
import { dataDoInstante, formatarData, formatarDataHora, formatarDiaSemana, formatarDuracao, formatarHora } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { ErroExecucao, FechamentoAdmin, FechamentoDetalhe } from '../../types/api'
import { ModalGatilho } from '../admin/ModalGatilho'
import { estaAtrasado, NOME_TIPO } from './fechamentos-util'
import '../admin/admin.css'
import '../dashboard.css'
import './fechamentos.css'

const INTERVALO_ATUALIZACAO_MS = 10_000

type Acao = 'reprocessar' | 'publicar' | 'gatilho' | null

export function TextoReprocessar({ fechamento }: { fechamento: FechamentoAdmin }) {
  return (
    <>
      <p>
        O fechamento de <strong>{fechamento.unidade.nome}</strong> (dados até {formatarData(fechamento.data_referencia)})
        volta para a fila e será extraído de novo da FriPonto assim que houver cota.
      </p>
      {fechamento.status === 'sucesso' && (
        <p>
          <strong>Atenção:</strong> este fechamento já está publicado; o reprocessamento substitui os números que os
          gestores estão vendo.
        </p>
      )}
    </>
  )
}

export function DetalheFechamento() {
  const { fechamentoId } = useParams()
  const location = useLocation()
  const [acao, setAcao] = useState<Acao>(null)
  const { ehAdmin } = useEmpresaAdmin()
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<FechamentoDetalhe>(`/admin/fechamentos/${fechamentoId}`, { signal }),
    `fechamento-${fechamentoId}`,
  )
  // volta para a lista com os filtros que estavam abertos
  const voltarPara = (location.state as { de?: string } | null)?.de ?? '/fechamentos'

  const emAndamento = dados?.status === 'processando' || (dados ? estaAtrasado(dados) : false)
  useEffect(() => {
    if (!emAndamento) return
    const timer = window.setInterval(recarregar, INTERVALO_ATUALIZACAO_MS)
    return () => window.clearInterval(timer)
  }, [emAndamento, recarregar])

  useEffect(() => {
    if (dados) document.title = `${dados.unidade.nome} ${formatarData(dados.data_referencia)} — Fechamentos`
  }, [dados])

  if (carregando) return <Carregando texto="Carregando fechamento..." />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const podePublicar = dados.status !== 'sucesso' && dados.status !== 'processando' && dados.registros > 0
  const podeAjustarGatilho = dados.status !== 'sucesso' && dados.status !== 'processando'
  const execucao = dados.ultima_execucao
  const totalExecucao = execucao ? execucao.total_colaboradores || dados.total_colaboradores || 0 : 0
  const pct = execucao && totalExecucao ? Math.round((execucao.processados / totalExecucao) * 100) : 0

  function concluir(mensagem: string) {
    setAcao(null)
    alertarSucesso(mensagem)
    recarregar()
  }

  return (
    <section className="pagina dash fech fech-detalhe">
      <Link to={voltarPara} className="voltar">
        ← Voltar para Fechamentos
      </Link>

      <header className="fech-detalhe-topo">
        <div>
          <TituloPagina>{dados.unidade.nome}</TituloPagina>
          <div className="fech-detalhe-titulo">
            <h2>Dados até {formatarData(dados.data_referencia)}</h2>
            <PilulaStatus status={dados.status} atrasado={estaAtrasado(dados)} />
            {dados.tipo === 'fechamento_mes' && <span className="badge badge-alerta">Fechamento do mês</span>}
          </div>
          <p className="pagina-sub">
            {dados.empresa.nome} · período de {formatarData(dados.periodo_inicio)} a{' '}
            {formatarData(dados.data_referencia)}
          </p>
        </div>
        {ehAdmin && (
          <div className="fech-detalhe-acoes">
            {podeAjustarGatilho && (
              <button type="button" className="dash-botao" onClick={() => setAcao('gatilho')}>
                Ajustar gatilho
              </button>
            )}
            {podePublicar && (
              <button type="button" className="dash-botao" onClick={() => setAcao('publicar')}>
                Publicar mesmo assim
              </button>
            )}
            <button
              type="button"
              className="dash-botao dash-botao-primario"
              onClick={() => setAcao('reprocessar')}
              disabled={dados.status === 'processando'}
            >
              Reprocessar
            </button>
          </div>
        )}
      </header>

      {dados.status === 'falhou' && execucao?.mensagem_erro && <Aviso>Última falha: {execucao.mensagem_erro}</Aviso>}

      <div className="dash-kpis">
        <div className="dash-kpi dash-kpi-destaque">
          <p className="dash-kpi-rotulo">Colaboradores processados</p>
          <p className="dash-kpi-valor">
            {execucao ? execucao.processados : '—'}
            {execucao && <span className="fech-kpi-de">/{totalExecucao || '?'}</span>}
          </p>
          <p className="dash-kpi-contexto">
            <span className="dash-kpi-contexto-icone" aria-hidden="true">
              <IconeUsuarios tamanho={14} />
            </span>
            {execucao ? `${pct}% na última execução` : 'Ainda não executado'}
          </p>
        </div>
        <div className="dash-kpi">
          <p className="dash-kpi-rotulo">Registros de horas</p>
          <p className="dash-kpi-valor">{dados.registros}</p>
          <p className="dash-kpi-contexto">
            <span className="dash-kpi-contexto-icone" aria-hidden="true">
              <IconeAtividade tamanho={14} />
            </span>
            {dados.total_colaboradores != null ? `de ${dados.total_colaboradores} colaboradores` : 'extraídos da FriPonto'}
          </p>
        </div>
        <div className="dash-kpi">
          <p className="dash-kpi-rotulo">Gatilho</p>
          <p className="dash-kpi-valor">{formatarData(dataDoInstante(dados.gatilho_em), { ano: false })}</p>
          <p className="dash-kpi-contexto">
            <span className="dash-kpi-contexto-icone" aria-hidden="true">
              <IconeRelogio tamanho={14} />
            </span>
            {formatarHora(dados.gatilho_em)}
            {dados.gatilho_ajustado
              ? ` · ajustado${dados.gatilho_ajustado_por ? ` por ${dados.gatilho_ajustado_por.nome}` : ''}`
              : ` · ${NOME_TIPO[dados.tipo].toLowerCase()}`}
          </p>
        </div>
        <div className="dash-kpi">
          <p className="dash-kpi-rotulo">Publicado</p>
          <p className="dash-kpi-valor">{dados.publicado_em ? formatarData(dataDoInstante(dados.publicado_em), { ano: false }) : '—'}</p>
          <p className="dash-kpi-contexto">
            <span className="dash-kpi-contexto-icone" aria-hidden="true">
              <IconeCalendario tamanho={14} />
            </span>
            {dados.publicado_em
              ? `às ${formatarHora(dados.publicado_em)}`
              : dados.proxima_tentativa_em
                ? `Próxima tentativa ${formatarDataHora(dados.proxima_tentativa_em)}`
                : 'Ainda não publicado'}
          </p>
        </div>
      </div>

      <section className="dash-card" aria-labelledby="titulo-execucoes">
        <div className="dash-card-topo">
          <div>
            <h2 id="titulo-execucoes">Execuções</h2>
            <p className="dash-card-sub">
              {dados.tentativas} {dados.tentativas === 1 ? 'tentativa' : 'tentativas'}
              {dados.gatilho_ajustado && ` · regra original: ${formatarDiaSemana(dados.gatilho_previsto_em)}`}
            </p>
          </div>
        </div>
        {dados.execucoes.length === 0 ? (
          <p className="dash-vazio">Nenhuma execução ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="fech-tabela">
              <caption className="sr-only">Histórico de execuções</caption>
              <thead>
                <tr>
                  <th scope="col">Início</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Disparo</th>
                  <th scope="col" className="num">
                    Processados
                  </th>
                  <th scope="col" className="num">
                    Com erro
                  </th>
                  <th scope="col">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {dados.execucoes.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {formatarDataHora(item.iniciado_em)}
                      <span className="celula-sub">{formatarDuracao(item.iniciado_em, item.finalizado_em)}</span>
                    </td>
                    <td>
                      <PilulaStatus status={item.status} />
                    </td>
                    <td>
                      {item.disparo === 'manual' ? 'Manual' : 'Automático'}
                      {item.disparado_por && <span className="celula-sub">{item.disparado_por.nome}</span>}
                    </td>
                    <td className="num">
                      {item.processados}/{item.total_colaboradores}
                    </td>
                    <td className="num">{item.com_erro}</td>
                    <td className="celula-motivo">{item.mensagem_erro ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-card" aria-labelledby="titulo-erros">
        <div className="dash-card-topo">
          <div>
            <h2 id="titulo-erros">Erros</h2>
            <p className="dash-card-sub">
              {dados.erros.length === 0 ? 'Nenhum erro registrado' : `${dados.erros.length} registrados nas execuções`}
            </p>
          </div>
        </div>
        {dados.erros.length > 0 && (
          <ul className="lista-erros">
            {dados.erros.map((item) => (
              <ItemErro key={item.id} erro={item} />
            ))}
          </ul>
        )}
      </section>

      {acao === 'reprocessar' && (
        <ModalConfirmacao
          titulo={`Reprocessar ${dados.unidade.nome}`}
          rotuloConfirmar="Reprocessar"
          motivo="opcional"
          onFechar={() => setAcao(null)}
          onConfirmar={async (motivo) => {
            await api(`/admin/fechamentos/${dados.id}/reprocessar`, { method: 'POST', json: { motivo } })
            concluir('Fechamento enviado para a fila de reprocessamento.')
          }}
        >
          <TextoReprocessar fechamento={dados} />
        </ModalConfirmacao>
      )}

      {acao === 'publicar' && (
        <ModalConfirmacao
          titulo={`Publicar ${dados.unidade.nome}`}
          rotuloConfirmar="Publicar mesmo assim"
          perigo
          motivo="obrigatorio"
          onFechar={() => setAcao(null)}
          onConfirmar={async (motivo) => {
            await api(`/admin/fechamentos/${dados.id}/publicar`, { method: 'POST', json: { motivo } })
            concluir('Fechamento publicado. Os gestores já veem estes números.')
          }}
        >
          <p>
            Publica os <strong>{dados.registros}</strong> registros extraídos
            {dados.total_colaboradores ? ` de ${dados.total_colaboradores} colaboradores` : ''} mesmo com a extração
            incompleta. Colaboradores sem registro ficam fora do painel desta semana.
          </p>
        </ModalConfirmacao>
      )}

      {acao === 'gatilho' && (
        <ModalGatilho
          ciclo={{
            ciclo_id: dados.ciclo_id,
            titulo: `dados até ${formatarData(dados.data_referencia, { ano: false })}`,
            tipo: dados.tipo,
            data_referencia: dados.data_referencia,
            gatilho_em: dados.gatilho_em,
            gatilho_previsto_em: dados.gatilho_previsto_em,
          }}
          onFechar={() => setAcao(null)}
          onSalvo={() => concluir('Gatilho do ciclo ajustado.')}
        />
      )}
    </section>
  )
}

function ItemErro({ erro }: { erro: ErroExecucao }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <li>
      <div className="cartao-admin-topo">
        <span>
          <strong>{erro.etapa}</strong>
          {erro.http_status && ` · HTTP ${erro.http_status}`}
          {erro.colaborador && ` · ${erro.colaborador.nome}`}
          <span className="celula-sub">{formatarDataHora(erro.criado_em)}</span>
        </span>
        <button
          type="button"
          className="btn-link"
          onClick={() =>
            navigator.clipboard
              .writeText(erro.mensagem)
              .then(() => setCopiado(true))
              .catch(() => setCopiado(false))
          }
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="erro-bloco">{erro.mensagem}</pre>
    </li>
  )
}
