import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Aviso, Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { CartaoKpi, ItemResumo } from '../components/CartoesPainel'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { GraficoFaixas } from '../components/GraficoFaixas'
import { Horas } from '../components/Horas'
import {
  IconeAlerta,
  IconeAtividade,
  IconeBanco,
  IconeCalendario,
  IconeMais,
  IconeMedia,
  IconeMenos,
  IconeMoeda,
  IconeRelogio,
  IconeSetaDiagonal,
  IconeUsuarios,
} from '../components/Icones'
import { IndicadorCurva } from '../components/IndicadorCurva'
import { MedidorCurva, type GrupoCurva } from '../components/MedidorCurva'
import { ModalColaboradores } from '../components/ModalColaboradores'
import { SeloTempoReal } from '../components/SeloTempoReal'
import { formatarData, formatarDataHora, formatarDiaSemana, formatarMinutos, iniciais } from '../lib/formato'
import { textoDoIntervalo, useHorasNoIntervalo } from '../lib/intervalo'
import {
  caminhoColaboradores,
  linhasNoIntervalo,
  ORDEM_PADRAO,
  SEM_TEMPO_REAL,
  textoAte,
  textoAtualizados,
  usePainel,
  type LinhaPainel as Linha,
} from '../lib/painel'
import { caminhoFechamentos } from './admin/navegacao'
import { ListasDoIntervalo } from './ListasDoIntervalo'
import type { FiltroDashboard, Minutos } from '../types/api'
import './dashboard.css'
import { TituloPagina } from '../components/TituloPagina'

function maiuscula(texto: string) {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)
}

export function DashboardUnidade() {
  const { unidadeId } = useParams()
  // sem unidade na URL (/unidades): painel consolidado de todas as unidades do usuário
  const consolidado = !unidadeId
  const { telas, unidades: unidadesSessao } = useAuth()
  const linkFechamentos = caminhoFechamentos(telas)
  const location = useLocation()
  const navigate = useNavigate()
  // grupo de colaboradores aberto a partir de um gráfico (faixa de saldo ou parte do medidor) ou de um total do resumo
  const [grupoAberto, setGrupoAberto] = useState<{
    titulo: string
    descricao: string
    linhas: Linha[]
    ordem: 'asc' | 'desc'
    /** O número de cada linha no modal (sem isso, o saldo com a curva). */
    valor?: (linha: Linha) => Minutos
    sinal?: boolean
  } | null>(null)
  const { dados, erro, carregando, recarregar } = usePainel(unidadeId)
  // intervalo de datas: com ele, saldo, extras, negativas e curva são os do intervalo (a mesma tela, outros números)
  const intervalo = useHorasNoIntervalo(unidadeId, dados?.colaboradores)
  const { escolhido, porColaborador } = intervalo
  const comIntervalo = escolhido !== null
  const linhasPainel = useMemo(
    () =>
      !dados
        ? []
        : comIntervalo
          ? linhasNoIntervalo(dados.colaboradores, porColaborador, dados.limites)
          : dados.colaboradores,
    [dados, porColaborador, comIntervalo],
  )

  useEffect(() => {
    const nome = dados ? (dados.unidade?.nome ?? 'Todas as unidades') : null
    document.title = nome ? `${nome} Copiloto de Ponto` : 'Copiloto de Ponto'
  }, [dados])

  /** Atalho dos cards: abre a tela de Colaboradores já com o filtro e a ordem. */
  function abrirLista(filtro: FiltroDashboard | 'limite', ordem: string = ORDEM_PADRAO) {
    navigate(caminhoColaboradores(unidadeId, { filtro, ordem, intervalo: escolhido }))
  }

  const somas = useMemo(() => {
    return linhasPainel.reduce(
      (soma, linha) => {
        const doIntervalo = porColaborador.get(linha.id)
        const acimaNoDia = (doIntervalo?.dias_extra_acima ?? 0) + (doIntervalo?.dias_negativa_acima ?? 0) > 0
        return {
          saldo: soma.saldo + linha.saldo_min,
          extra: soma.extra + linha.extra_min,
          negativa: soma.negativa + linha.negativa_min,
          acimaDoLimiteDiario: soma.acimaDoLimiteDiario + (acimaNoDia ? 1 : 0),
        }
      },
      { saldo: 0, extra: 0, negativa: 0, acimaDoLimiteDiario: 0 },
    )
  }, [linhasPainel, porColaborador])

  const emAtencao = useMemo(
    () =>
      linhasPainel
        .filter((linha) => linha.fora_da_curva !== null)
        .sort((a, b) => Math.abs(b.saldo_min) - Math.abs(a.saldo_min) || a.nome.localeCompare(b.nome, 'pt-BR')),
    [linhasPainel],
  )

  // com uma unidade só, "todas" é a própria unidade
  if (consolidado && unidadesSessao.length === 1) return <Navigate to={`/unidades/${unidadesSessao[0].id}`} replace />
  if (carregando) return <Carregando texto={consolidado ? 'Carregando unidades...' : 'Carregando unidade...'} />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const { unidade, fechamento, limites } = dados
  const tempoReal = dados.tempo_real ?? SEM_TEMPO_REAL
  // tempo real com dados ao vivo: o painel aparece mesmo sem nenhum fechamento publicado
  const aoVivo = tempoReal.ativo && tempoReal.colaboradores_ao_vivo > 0
  const dadosAte = textoAte(tempoReal.dados_ate)
  const atualizados = textoAtualizados(tempoReal.atualizado_de, tempoReal.atualizado_ate)
  const nomePainel = unidade?.nome ?? 'Todas as unidades'
  const unidadesPainel = dados.unidades ?? []
  const comFechamento = unidadesPainel.filter((item) => item.fechamento)
  // no consolidado, cada unidade tem o seu fechamento: período e data só valem se forem iguais em todas
  const datasIguais = comFechamento.every(
    (item) =>
      item.fechamento?.data_referencia === fechamento?.data_referencia &&
      item.fechamento?.periodo_inicio === fechamento?.periodo_inicio,
  )
  const limitesVariam = Boolean(dados.limites_variam)
  const todos = linhasPainel
  // o resumo do servidor é do período: com intervalo, a curva sai das linhas do intervalo
  const resumo = comIntervalo ? null : dados.resumo
  const acima = resumo?.fora_positivo ?? todos.filter((linha) => linha.fora_da_curva === 'positivo').length
  const abaixo = resumo?.fora_negativo ?? todos.filter((linha) => linha.fora_da_curva === 'negativo').length
  // horas pagas só existem por período: não mudam com o intervalo
  const totalPagas = dados.resumo?.pagas_total_min ?? todos.reduce((soma, linha) => soma + linha.pagas_min, 0)
  const totalColaboradores = dados.resumo?.total ?? dados.total
  const dentro = Math.max(0, totalColaboradores - acima - abaixo)
  const incompleto = dados.total > todos.length
  const origem = { de: location.pathname + location.search }
  const linkColaborador = (linha: Linha) => `/unidades/${linha.unidade_id ?? unidade?.id}/colaboradores/${linha.id}`

  // no tempo real não há fotografia semanal: o registro publicado é o fechamento do mês
  // (fotografias semanais antigas ainda podem ser as mais recentes logo depois da troca de modo)
  const nomeFotografia = fechamento?.semana_fechamento_mes ? 'o último fechamento do mês' : 'a última fotografia publicada'
  // no tempo real, linhas que ainda mostram o registro publicado (aguardando a vez delas)
  // no consolidado, só unidades de empresas em tempo real esperam atualização ao vivo
  const unidadesTempoReal = new Set((dados.unidades ?? []).filter((u) => u.tempo_real).map((u) => u.id))
  const emTempoReal = (linha: Linha) => !consolidado || (linha.unidade_id != null && unidadesTempoReal.has(linha.unidade_id))
  const aguardandoAoVivo = (linha: Linha) => aoVivo && linha.fonte === 'fechamento' && emTempoReal(linha)
  const totalAguardando = aoVivo ? todos.filter(aguardandoAoVivo).length : 0

  // no consolidado cada linha traz o limite da empresa dela
  const limiteDe = (linha: Linha) =>
    linha.fora_da_curva === 'positivo'
      ? (linha.alerta_pos ?? limites.alerta_pos)
      : linha.fora_da_curva === 'negativo'
        ? (linha.alerta_neg ?? limites.alerta_neg)
        : undefined

  const complemento = (linha: Linha) => [consolidado ? linha.unidade_nome : null, linha.funcao].filter(Boolean).join(' · ')

  const GRUPOS_CURVA: Record<GrupoCurva, { descricao: string; valor: Linha['fora_da_curva']; ordem: 'asc' | 'desc' }> = {
    dentro: { descricao: 'Saldo dentro dos limites de alerta', valor: null, ordem: 'desc' },
    acima: { descricao: 'Saldo acima do limite positivo', valor: 'positivo', ordem: 'desc' },
    abaixo: { descricao: 'Saldo abaixo do limite negativo', valor: 'negativo', ordem: 'asc' },
  }
  function abrirGrupoCurva(grupo: GrupoCurva) {
    const { descricao, valor, ordem } = GRUPOS_CURVA[grupo]
    setGrupoAberto({ titulo: 'Dentro da curva', descricao, linhas: todos.filter((linha) => linha.fora_da_curva === valor), ordem })
  }

  const periodo =
    fechamento?.periodo_inicio && datasIguais
      ? `${formatarData(fechamento.periodo_inicio, { ano: false })} a ${formatarData(fechamento.data_referencia, { ano: false })}`
      : null

  const colaboradoresPorUnidade = new Map<number, number>()
  const aoVivoPorUnidade = new Map<number, number>()
  for (const linha of todos) {
    if (!linha.unidade_id) continue
    colaboradoresPorUnidade.set(linha.unidade_id, (colaboradoresPorUnidade.get(linha.unidade_id) ?? 0) + 1)
    if (linha.fonte === 'tempo_real') aoVivoPorUnidade.set(linha.unidade_id, (aoVivoPorUnidade.get(linha.unidade_id) ?? 0) + 1)
  }
  const unidadesComDados = unidadesPainel.filter((item) => item.fechamento || aoVivoPorUnidade.has(item.id)).length

  const infoUnidade = (item: (typeof unidadesPainel)[number]) => {
    const qtd = !incompleto && colaboradoresPorUnidade.has(item.id) ? ` · ${colaboradoresPorUnidade.get(item.id)} colab.` : ''
    if (aoVivoPorUnidade.has(item.id)) return `Tempo real · dados até ${dadosAte}${qtd}`
    if (item.fechamento) return `Dados até ${formatarData(item.fechamento.data_referencia)}${qtd}`
    return 'Sem dados ainda'
  }

  // no tempo real o próximo registro oficial é o fechamento do mês (no consolidado as empresas podem ter modos diferentes)
  const rotuloProxima = !tempoReal.ativo
    ? 'Próxima atualização'
    : consolidado
      ? 'Próxima atualização oficial'
      : 'Próximo fechamento do mês'
  const previsto = rotuloProxima.startsWith('Próximo ') ? 'previsto' : 'prevista'
  const nenhumColaborador = aoVivo || !fechamento ? 'Nenhum colaborador com dados' : 'Nenhum colaborador neste fechamento'
  const textoIntervalo = escolhido ? textoDoIntervalo(escolhido) : null
  // complemento dos títulos: o intervalo escolhido ou o período dos números
  const quando = textoIntervalo ? `de ${textoIntervalo}` : 'no período'
  const detalheResumo = comIntervalo ? 'no intervalo' : 'no período'
  const porNome = (a: Linha, b: Linha) => a.nome.localeCompare(b.nome, 'pt-BR')
  const comExtras = todos.filter((l) => l.extra_min > 0).sort((a, b) => b.extra_min - a.extra_min || porNome(a, b))
  const comNegativas = todos.filter((l) => l.negativa_min > 0).sort((a, b) => b.negativa_min - a.negativa_min || porNome(a, b))
  const comHoras = todos.filter((l) => l.extra_min > 0 || l.negativa_min > 0)

  /** Colaboradores por trás de um total do resumo, com o número de cada um. */
  function abrirTotal(titulo: string, descricao: string, linhas: Linha[], valor: (linha: Linha) => Minutos, sinal = false) {
    setGrupoAberto({ titulo, descricao, linhas, ordem: 'desc', valor, sinal })
  }

  const cardUnidades = consolidado ? (
    <article className="dash-card dash-area-atualizacao" aria-labelledby="titulo-unidades">
      <h2 id="titulo-unidades">Unidades</h2>
      <p className="dash-card-sub">Dados de cada unidade · clique para ver só ela</p>
      <ul className="dash-unidades">
        {unidadesPainel.map((item) => (
          <li key={item.id}>
            <Link to={`/unidades/${item.id}`} className="dash-unidade">
              <span className="dash-unidade-nome">{item.nome}</span>
              <span className="dash-unidade-info">{infoUnidade(item)}</span>
              <IconeSetaDiagonal tamanho={16} className="dash-unidade-seta" />
            </Link>
          </li>
        ))}
      </ul>
      {dados.proximo_fechamento_previsto && (
        <p className="dash-unidades-proxima">
          <IconeRelogio tamanho={14} />
          {rotuloProxima}: {formatarDiaSemana(dados.proximo_fechamento_previsto)}
        </p>
      )}
    </article>
  ) : (
    <article className="dash-card dash-area-atualizacao" aria-labelledby="titulo-atualizacao">
      <div className="dash-card-topo dash-atualizacao-topo">
        <h2 id="titulo-atualizacao">Atualização dos dados</h2>
        {tempoReal.ativo && <SeloTempoReal />}
      </div>
      <p className="dash-destaque-texto">
        {aoVivo ? `Dados até ${dadosAte}` : `Dados até ${formatarData(fechamento?.data_referencia)}`}
      </p>
      <ul className="dash-info">
        {aoVivo && atualizados && (
          <li>
            <IconeAtividade tamanho={16} />
            <span>{maiuscula(atualizados)}</span>
          </li>
        )}
        {aoVivo && (
          <li>
            <IconeUsuarios tamanho={16} />
            <span>
              {totalAguardando > 0
                ? `${tempoReal.colaboradores_ao_vivo} de ${todos.length} colaboradores já atualizados ao vivo; os demais mostram ${nomeFotografia}`
                : 'Todos os colaboradores atualizados ao vivo'}
            </span>
          </li>
        )}
        {tempoReal.ativo && !aoVivo && (
          <li>
            <IconeAtividade tamanho={16} />
            <span>Tempo real ligado: aguardando a primeira atualização ao vivo.</span>
          </li>
        )}
        {periodo && fechamento && (
          <li>
            <IconeCalendario tamanho={16} />
            <span>
              {!aoVivo
                ? `Período de ${periodo}`
                : fechamento.semana_fechamento_mes
                  ? `Último fechamento do mês: ${periodo}`
                  : `Última fotografia: ${periodo}`}
              {fechamento.semana_fechamento_mes && !aoVivo && <span className="dash-etiqueta">Fechamento do mês</span>}
            </span>
          </li>
        )}
        {fechamento && (
          <li>
            <IconeRelogio tamanho={16} />
            <span>
              {!aoVivo
                ? 'Publicado em'
                : fechamento.semana_fechamento_mes
                  ? 'Fechamento do mês publicado em'
                  : 'Fotografia publicada em'}{' '}
              {formatarDataHora(fechamento.publicado_em)}
            </span>
          </li>
        )}
        {dados.proximo_fechamento_previsto && (
          <li>
            <IconeSetaDiagonal tamanho={16} />
            <span>
              {rotuloProxima}: {formatarDiaSemana(dados.proximo_fechamento_previsto)}
            </span>
          </li>
        )}
      </ul>
      {linkFechamentos && (
        <Link to={linkFechamentos} className="dash-botao dash-botao-primario">
          Ver painel de fechamentos
        </Link>
      )}
    </article>
  )

  return (
    <section className="pagina dash">
      <header className="dash-header">
        <TituloPagina>{nomePainel}</TituloPagina>
        {aoVivo && (
          <p className="dash-ao-vivo">
            <SeloTempoReal titulo="Os dados de cada colaborador são atualizados continuamente" />
            <span>{[`dados até ${dadosAte}`, atualizados].filter(Boolean).join(' · ')}</span>
          </p>
        )}
        <div className="dash-filtro-periodo">
          <FiltroPeriodo
            escolhido={escolhido}
            atual={intervalo.periodoAtual}
            de={intervalo.deParam}
            ate={intervalo.ateParam}
            onMudar={intervalo.mudar}
          />
        </div>
      </header>

      {dados.aviso_fechamento_mes && (
        <Aviso>
          {tempoReal.ativo && !consolidado
            ? 'Dados podem levar mais tempo para atualizar nestes dias devido ao fechamento da folha.'
            : 'Dados podem levar mais tempo para atualizar essa semana devido ao fechamento da folha.'}
        </Aviso>
      )}

      {!fechamento && !aoVivo ? (
        <EstadoVazio
          titulo={consolidado ? 'Ainda não há dados publicados nas suas unidades' : 'Ainda não há dados consolidados para esta unidade'}
        >
          <p>
            {tempoReal.ativo
              ? 'A atualização em tempo real está ligada: os dados aparecem aqui conforme cada colaborador for atualizado.'
              : 'Os dados são atualizados uma vez por semana, no dia e na hora definidos para a empresa, depois que o RH ajusta o ponto.'}
          </p>
          {dados.proximo_fechamento_previsto && (
            <p>
              {rotuloProxima} {previsto}: <strong>{formatarDiaSemana(dados.proximo_fechamento_previsto)}</strong>
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
                  ? `${unidadesComDados} ${unidadesComDados === 1 ? 'unidade' : 'unidades'} com dados`
                  : aoVivo
                    ? `Dados até ${dadosAte}`
                    : `Referência ${formatarData(fechamento?.data_referencia)}`
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
                comIntervalo
                  ? 'Do período: não muda com o filtro de datas'
                  : aoVivo
                    ? `Período atual, até ${dadosAte}`
                    : periodo
                      ? `Período de ${periodo}`
                      : consolidado
                        ? 'Soma de todas as unidades'
                        : 'Soma de todos os colaboradores'
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
                  <p className="dash-card-sub">Colaboradores por faixa de saldo {quando} (extras − negativas)</p>
                </div>
              </div>
              {todos.length > 0 ? (
                <GraficoFaixas
                  linhas={todos}
                  limites={limites}
                  onSelecionar={(faixa) =>
                    setGrupoAberto({
                      titulo: 'Distribuição do saldo',
                      descricao: faixa.descricao,
                      linhas: faixa.linhas,
                      // faixas negativas: do saldo mais negativo para o menos
                      ordem: faixa.linhas.every((linha) => linha.saldo_min <= 0) ? 'asc' : 'desc',
                    })
                  }
                />
              ) : (
                <p className="dash-vazio">{nenhumColaborador}.</p>
              )}
            </article>

            {cardUnidades}

            <article className="dash-card dash-area-resumo" aria-labelledby="titulo-resumo">
              <h2 id="titulo-resumo">Resumo de horas</h2>
              <p className="dash-card-sub">
                {incompleto ? `Soma dos ${todos.length} colaboradores exibidos` : 'Soma de todos os colaboradores'}
                {textoIntervalo && `, de ${textoIntervalo}`}
              </p>
              <ul className="dash-resumo">
                <ItemResumo
                  icone={<IconeBanco />}
                  rotulo="Saldo"
                  detalhe={detalheResumo}
                  minutos={somas.saldo}
                  sinal
                  onAbrir={() =>
                    abrirTotal('Saldo', `Extras − negativas ${quando}`, comHoras, (l) => l.saldo_min, true)
                  }
                />
                <ItemResumo
                  icone={<IconeMais />}
                  rotulo="Extras"
                  detalhe={detalheResumo}
                  minutos={somas.extra}
                  onAbrir={() => abrirTotal('Extras', `Quem fez extras ${quando}`, comExtras, (l) => l.extra_min)}
                />
                <ItemResumo
                  icone={<IconeMenos />}
                  rotulo="Negativas"
                  detalhe={detalheResumo}
                  minutos={somas.negativa}
                  onAbrir={() =>
                    abrirTotal('Negativas', `Quem teve negativas (faltas e atrasos) ${quando}`, comNegativas, (l) => l.negativa_min)
                  }
                />
                <ItemResumo
                  icone={<IconeMoeda />}
                  rotulo="Pagas"
                  detalhe={comIntervalo ? 'do período (sem filtro)' : 'no período'}
                  minutos={totalPagas}
                  onAbrir={() =>
                    abrirTotal(
                      'Pagas',
                      'Horas pagas do período (não mudam com o filtro de datas)',
                      todos.filter((l) => l.pagas_min > 0),
                      (l) => l.pagas_min,
                    )
                  }
                />
                {todos.length > 0 && (
                  <ItemResumo
                    icone={<IconeMedia />}
                    rotulo="Saldo médio"
                    detalhe="por colaborador"
                    minutos={Math.round(somas.saldo / todos.length)}
                    sinal
                  />
                )}
                {comExtras.length > 0 && (
                  <ItemResumo
                    icone={<IconeMedia />}
                    rotulo="Extras por pessoa"
                    detalhe="média de quem fez"
                    minutos={Math.round(somas.extra / comExtras.length)}
                    onAbrir={() => abrirTotal('Extras por pessoa', `Quem fez extras ${quando}`, comExtras, (l) => l.extra_min)}
                  />
                )}
              </ul>
              {somas.acimaDoLimiteDiario > 0 && (
                <button type="button" className="dash-limite-diario" onClick={() => abrirLista('limite')}>
                  <IconeAlerta tamanho={16} />
                  <span>
                    <strong>{somas.acimaDoLimiteDiario}</strong>{' '}
                    {somas.acimaDoLimiteDiario === 1 ? 'colaborador passou' : 'colaboradores passaram'} do limite diário{' '}
                    {quando}
                  </span>
                  <IconeSetaDiagonal tamanho={14} />
                </button>
              )}
            </article>

            <article className="dash-card dash-area-atencao" aria-labelledby="titulo-atencao">
              <div className="dash-card-topo">
                <div>
                  <h2 id="titulo-atencao">Fora da curva</h2>
                  <p className="dash-card-sub">
                    {consolidado ? 'Maiores saldos fora dos limites, em todas as unidades' : 'Maiores saldos fora dos limites da unidade'}
                    {textoIntervalo && `, de ${textoIntervalo}`}
                  </p>
                </div>
                {emAtencao.length > 0 && (
                  <button type="button" className="dash-botao" onClick={() => abrirLista('fora')}>
                    Ver todos ({emAtencao.length})
                  </button>
                )}
              </div>
              {emAtencao.length === 0 ? (
                <p className="dash-vazio">
                  {textoIntervalo ? `Nenhum colaborador fora da curva de ${textoIntervalo}.` : 'Nenhum colaborador fora da curva no momento.'}
                </p>
              ) : (
                <ul className="dash-pessoas dash-pessoas-rolagem">
                  {emAtencao.map((linha) => (
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
              {textoIntervalo && <p className="dash-card-sub">Saldo de {textoIntervalo}</p>}
              {totalColaboradores > 0 ? (
                <MedidorCurva dentro={dentro} acima={acima} abaixo={abaixo} onSelecionar={abrirGrupoCurva} />
              ) : (
                <p className="dash-vazio">Sem colaboradores para calcular.</p>
              )}
            </article>

            <ListasDoIntervalo
              linhas={todos}
              porColaborador={porColaborador}
              quando={quando}
              abrirLista={abrirLista}
              linkColaborador={linkColaborador}
              complemento={complemento}
              origem={origem}
            />
          </div>

          {incompleto && (
            <p className="rodape-nota">
              Exibindo {todos.length} de {dados.total} colaboradores (limite por página).
            </p>
          )}
          <p className="rodape-nota">Somente leitura. Ajustes de ponto são feitos pelo RH na FriPonto.</p>
        </>
      )}

      {grupoAberto && (
        <ModalColaboradores
          titulo={grupoAberto.titulo}
          descricao={
            incompleto ? `${grupoAberto.descricao} (entre os ${todos.length} exibidos)` : grupoAberto.descricao
          }
          linhas={grupoAberto.linhas}
          ordem={grupoAberto.ordem}
          link={linkColaborador}
          complemento={complemento}
          limiteDe={limiteDe}
          valor={grupoAberto.valor}
          sinal={grupoAberto.sinal}
          origem={origem}
          onFechar={() => setGrupoAberto(null)}
        />
      )}
    </section>
  )
}
