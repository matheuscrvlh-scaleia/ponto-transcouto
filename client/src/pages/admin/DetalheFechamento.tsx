import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, Carregando, ErroCarregamento } from '../../components/Estados'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { PilulaStatus } from '../../components/PilulaStatus'
import { api } from '../../lib/api'
import { formatarData, formatarDataHora, formatarDiaSemana, formatarDuracao } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { ErroExecucao, FechamentoAdmin, FechamentoDetalhe } from '../../types/api'
import { estaAtrasado } from './fechamentos-util'
import { ModalGatilho } from './ModalGatilho'
import { useEmpresaAdmin } from '../../context/EmpresaAdminContext'

const INTERVALO_ATUALIZACAO_MS = 10_000

type Acao = 'reprocessar' | 'publicar' | 'gatilho' | null

export function TextoReprocessar({ fechamento }: { fechamento: FechamentoAdmin }) {
  return (
    <>
      <p>
        O fechamento de <strong>{fechamento.unidade.nome}</strong> (dados até {formatarData(fechamento.data_referencia)})
        volta para a fila e será extraído de novo da Secullum assim que houver cota.
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
  const [acao, setAcao] = useState<Acao>(null)
  const [aviso, setAviso] = useState('')
  const { ehAdmin } = useEmpresaAdmin()
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<FechamentoDetalhe>(`/admin/fechamentos/${fechamentoId}`, { signal }),
    `fechamento-${fechamentoId}`,
  )

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

  function concluir(mensagem: string) {
    setAcao(null)
    setAviso(mensagem)
    recarregar()
  }

  return (
    <section className="pagina">
      <Link to=".." relative="path" className="voltar">
        ← Voltar ao painel
      </Link>

      <header className="pagina-header-linha">
        <div>
          <h1 className="titulo-com-pilula">
            {dados.unidade.nome} <PilulaStatus status={dados.status} atrasado={estaAtrasado(dados)} />
          </h1>
          <p className="pagina-sub">
            {dados.empresa.nome} · período de {formatarData(dados.periodo_inicio)} a {formatarData(dados.data_referencia)}
            {dados.tipo === 'fechamento_mes' && ' (fechamento do mês)'}
          </p>
        </div>
        {ehAdmin && (
          <div className="barra-acoes">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAcao('reprocessar')}
              disabled={dados.status === 'processando'}
            >
              Reprocessar
            </button>
            {podePublicar && (
              <button type="button" className="btn-secondary" onClick={() => setAcao('publicar')}>
                Publicar mesmo assim
              </button>
            )}
            {podeAjustarGatilho && (
              <button type="button" className="btn-secondary" onClick={() => setAcao('gatilho')}>
                Ajustar gatilho
              </button>
            )}
          </div>
        )}
      </header>

      {aviso && (
        <p className="form-ok" role="status">
          {aviso}
        </p>
      )}

      {dados.status === 'falhou' && dados.ultima_execucao?.mensagem_erro && (
        <Aviso>Última falha: {dados.ultima_execucao.mensagem_erro}</Aviso>
      )}

      <section className="card" aria-labelledby="titulo-resumo">
        <h2 id="titulo-resumo" className="sr-only">
          Resumo
        </h2>
        <dl className="info-lista">
          <div>
            <dt>Gatilho</dt>
            <dd>
              {formatarDiaSemana(dados.gatilho_em)}
              {dados.gatilho_ajustado && (
                <span className="celula-sub">
                  Regra: {formatarDiaSemana(dados.gatilho_previsto_em)}
                  {dados.gatilho_ajustado_por && ` · ajustado por ${dados.gatilho_ajustado_por.nome}`}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{dados.tentativas}</dd>
          </div>
          <div>
            <dt>Próxima tentativa</dt>
            <dd>{formatarDataHora(dados.proxima_tentativa_em)}</dd>
          </div>
          <div>
            <dt>Colaboradores</dt>
            <dd>{dados.total_colaboradores ?? '—'}</dd>
          </div>
          <div>
            <dt>Registros de horas</dt>
            <dd>{dados.registros}</dd>
          </div>
          <div>
            <dt>Publicado em</dt>
            <dd>{formatarDataHora(dados.publicado_em)}</dd>
          </div>
        </dl>
      </section>

      <section className="card card-tabela" aria-labelledby="titulo-execucoes">
        <h2 id="titulo-execucoes" className="card-tabela-titulo">
          Execuções
        </h2>
        {dados.execucoes.length === 0 ? (
          <p className="texto-suave card-tabela-titulo">Nenhuma execução ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Histórico de execuções</caption>
              <thead>
                <tr>
                  <th scope="col">Início</th>
                  <th scope="col">Status</th>
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
                {dados.execucoes.map((execucao) => (
                  <tr key={execucao.id}>
                    <td>
                      {formatarDataHora(execucao.iniciado_em)}
                      <span className="celula-sub">{formatarDuracao(execucao.iniciado_em, execucao.finalizado_em)}</span>
                    </td>
                    <td>
                      <PilulaStatus status={execucao.status} />
                    </td>
                    <td>
                      {execucao.disparo === 'manual' ? 'Manual' : 'Automático'}
                      {execucao.disparado_por && <span className="celula-sub">{execucao.disparado_por.nome}</span>}
                    </td>
                    <td className="num">
                      {execucao.processados}/{execucao.total_colaboradores}
                    </td>
                    <td className="num">{execucao.com_erro}</td>
                    <td className="celula-motivo">{execucao.mensagem_erro ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="titulo-erros">
        <h2 id="titulo-erros">Erros ({dados.erros.length})</h2>
        {dados.erros.length === 0 ? (
          <p>Nenhum erro registrado.</p>
        ) : (
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
