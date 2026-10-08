import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento, EstadoVazio } from '../components/Estados'
import { Horas } from '../components/Horas'
import { IconeRelogio, IconeSeletor, IconeUnidade } from '../components/Icones'
import { IndicadorCurva } from '../components/IndicadorCurva'
import { SeloTempoReal } from '../components/SeloTempoReal'
import { DiasColaborador, DiasColaboradorLinhas } from './DiasColaborador'
import { RelatorioColaboradores } from './RelatorioColaboradores'
import { baixarCsv, imprimirComoPdf, minutosCsv, paraNomeArquivo, type CelulaCsv } from '../lib/exportar'
import { BarraFiltros, BuscaFiltro, LinhaFiltros, Segmentado, SelecaoFiltro } from '../components/BarraFiltros'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { formatarData, formatarDataHora, hojeISO, iniciais, normalizarBusca } from '../lib/formato'
import { textoDoIntervalo, useHorasNoIntervalo } from '../lib/intervalo'
import {
  caminhoColaboradores,
  ORDEM_PADRAO,
  SEM_TEMPO_REAL,
  textoAte,
  textoAtualizados,
  usePainel,
  type LinhaPainel as Linha,
} from '../lib/painel'
import type { FiltroDashboard } from '../types/api'
import './dashboard.css'
import { TituloPagina } from '../components/TituloPagina'

type CampoOrdem = 'nome' | 'saldo_min' | 'extra_min' | 'negativa_min' | 'pagas_min'
type Direcao = 'asc' | 'desc'

const COLUNAS: { campo: CampoOrdem; rotulo: string }[] = [
  { campo: 'saldo_min', rotulo: 'Saldo banco' },
  { campo: 'extra_min', rotulo: 'Extras' },
  { campo: 'negativa_min', rotulo: 'Negativas' },
  { campo: 'pagas_min', rotulo: 'Pagas' },
]

// 'limite': passou do limite diário em algum dia do intervalo (só nesta tela)
type Filtro = FiltroDashboard | 'limite'

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'extra', rotulo: 'Com extras' },
  { valor: 'negativa', rotulo: 'Com negativas' },
  { valor: 'fora', rotulo: 'Fora da curva' },
  { valor: 'limite', rotulo: 'Limite diário' },
]

/** Linha da tela: no intervalo de datas, extras e negativas viram a soma dos dias; `dias_acima` conta os dias além do limite diário. */
type LinhaTela = Linha & { dias_extra_acima: number; dias_negativa_acima: number }

function textoDiasAcima(linha: LinhaTela) {
  const partes = [
    linha.dias_extra_acima ? `${linha.dias_extra_acima} com extras` : null,
    linha.dias_negativa_acima ? `${linha.dias_negativa_acima} com negativas` : null,
  ].filter(Boolean)
  const total = linha.dias_extra_acima + linha.dias_negativa_acima
  return {
    curto: `${total} ${total === 1 ? 'dia' : 'dias'} acima do limite`,
    longo: `Acima do limite diário: ${partes.join(' e ')}`,
  }
}

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

function lerFiltro(valor: string | null): Filtro {
  return FILTROS.some((filtro) => filtro.valor === valor) ? (valor as Filtro) : 'todos'
}

function passaNoFiltro(linha: LinhaTela, filtro: Filtro) {
  if (filtro === 'extra') return linha.extra_min > 0
  if (filtro === 'negativa') return linha.negativa_min > 0
  if (filtro === 'fora') return linha.fora_da_curva !== null
  if (filtro === 'limite') return linha.dias_extra_acima + linha.dias_negativa_acima > 0
  return true
}

/** Filtro e busca atuais, em texto (cabeçalho da planilha e do PDF). */
function descricaoFiltro(filtro: Filtro, busca: string) {
  const rotulo = FILTROS.find((item) => item.valor === filtro)?.rotulo ?? 'Todos'
  return busca.trim() ? `${rotulo} · busca “${busca.trim()}”` : rotulo
}

/** Ordem atual, em texto (cabeçalho do PDF). */
function descricaoOrdem(ordem: { campo: CampoOrdem; direcao: Direcao }) {
  const pronta = ORDENS_MOBILE.find((item) => item.valor === `${ordem.campo}.${ordem.direcao}`)
  if (pronta) return pronta.rotulo
  if (ordem.campo === 'nome') return 'Nome (Z–A)'
  const rotulo = COLUNAS.find((coluna) => coluna.campo === ordem.campo)?.rotulo ?? ''
  return `${rotulo} (${ordem.direcao === 'asc' ? 'menor' : 'maior'} primeiro)`
}

/** Planilha da lista como está na tela (mesmo filtro, busca e ordem). */
function linhasPlanilha(
  linhas: LinhaTela[],
  nomePainel: string,
  consolidado: boolean,
  filtro: string,
  periodo: string | null,
): CelulaCsv[][] {
  // com intervalo de datas, tudo é só do intervalo: saldo = extras − negativas; pagas e curva (período e banco) saem
  const noIntervalo = periodo !== null
  const curva = (linha: Linha) =>
    linha.fora_da_curva === 'positivo' ? 'Acima do limite' : linha.fora_da_curva === 'negativo' ? 'Abaixo do limite' : ''
  return [
    ['Colaboradores', nomePainel],
    ['Filtro', filtro],
    ...(periodo ? [['Período', periodo]] : []),
    ['Exportado em', formatarDataHora(new Date().toISOString())],
    [],
    [
      'Nome',
      ...(consolidado ? ['Unidade'] : []),
      'Função',
      noIntervalo ? 'Saldo do intervalo' : 'Saldo banco',
      'Extras',
      'Negativas',
      ...(noIntervalo ? [] : ['Pagas', 'Fora da curva']),
      'Dias acima do limite diário',
    ],
    ...linhas.map((linha) => [
      linha.nome,
      ...(consolidado ? [linha.unidade_nome] : []),
      linha.funcao,
      minutosCsv(linha.saldo_min),
      minutosCsv(linha.extra_min),
      minutosCsv(linha.negativa_min),
      ...(noIntervalo ? [] : [minutosCsv(linha.pagas_min), curva(linha)]),
      linha.dias_extra_acima + linha.dias_negativa_acima,
    ]),
  ]
}

/** Lista de colaboradores com saldo, extras, negativas e pagas (da unidade ou de todas as unidades). */
export function Colaboradores() {
  const { unidadeId } = useParams()
  // sem unidade na URL (/colaboradores): todas as unidades do usuário
  const consolidado = !unidadeId
  const { unidades: unidadesSessao } = useAuth()
  const { empresa: empresaEmFoco, ehAdmin, empresaId } = useEmpresaAdmin()
  const location = useLocation()
  const navigate = useNavigate()
  // unidades do seletor: as da sessão (a equipe vê só as da empresa escolhida na barra lateral)
  const unidadesSeletor = (ehAdmin && empresaId != null ? unidadesSessao.filter((u) => u.empresa_id === empresaId) : unidadesSessao)
    .slice()
    .sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, 'pt-BR'))

  /** Troca de unidade mantendo busca, filtros e datas: cada unidade tem a sua rota (e "Todas" é /colaboradores). */
  function irParaUnidade(id: string) {
    navigate({ pathname: id ? caminhoColaboradores(id) : '/colaboradores', search: location.search })
  }
  const [params, setParams] = useSearchParams()
  const { dados, erro, carregando, recarregar } = usePainel(unidadeId)

  const busca = params.get('busca') ?? ''
  const filtro = lerFiltro(params.get('filtro'))
  const ordem = lerOrdem(params.get('ordem'))
  const ordemAtual = `${ordem.campo}.${ordem.direcao}`
  // intervalo de datas da URL e as horas somadas nele (sem intervalo: o período atual, para o limite diário)
  const intervalo = useHorasNoIntervalo(unidadeId, dados?.colaboradores)
  const intervaloEscolhido = intervalo.escolhido
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set())
  const alternarDias = (id: number) =>
    setAbertos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })

  useEffect(() => {
    const nome = dados ? (dados.unidade?.nome ?? 'Todas as unidades') : null
    document.title = nome ? `Colaboradores · ${nome} Copiloto de Ponto` : 'Colaboradores Copiloto de Ponto'
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

  const { porColaborador } = intervalo
  const comIntervalo = intervaloEscolhido !== null

  // com intervalo escolhido, extras e negativas são a soma dos dias; sem ele, os números do período
  const todasLinhas = useMemo<LinhaTela[]>(
    () =>
      (dados?.colaboradores ?? []).map((linha) => {
        const doIntervalo = porColaborador.get(linha.id)
        return {
          ...linha,
          ...(comIntervalo && {
            extra_min: doIntervalo?.extra_min ?? 0,
            negativa_min: doIntervalo?.negativa_min ?? 0,
            saldo_min: (doIntervalo?.extra_min ?? 0) - (doIntervalo?.negativa_min ?? 0),
            fora_da_curva: null,
          }),
          dias_extra_acima: doIntervalo?.dias_extra_acima ?? 0,
          dias_negativa_acima: doIntervalo?.dias_negativa_acima ?? 0,
        }
      }),
    [dados, porColaborador, comIntervalo],
  )

  const linhas = useMemo(() => {
    const termo = normalizarBusca(busca)
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return todasLinhas
      .filter((linha) => passaNoFiltro(linha, filtro) && normalizarBusca(linha.nome).includes(termo))
      .sort((a, b) =>
        ordem.campo === 'nome'
          ? fator * a.nome.localeCompare(b.nome, 'pt-BR')
          : fator * (a[ordem.campo] - b[ordem.campo]) || a.nome.localeCompare(b.nome, 'pt-BR'),
      )
  }, [todasLinhas, busca, filtro, ordem.campo, ordem.direcao])

  // com uma unidade só, "todas" é a própria unidade
  if (consolidado && unidadesSessao.length === 1) {
    return <Navigate to={{ pathname: caminhoColaboradores(unidadesSessao[0].id), search: location.search }} replace />
  }
  if (carregando) return <Carregando texto="Carregando colaboradores..." />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const { unidade, fechamento, limites } = dados
  const tempoReal = dados.tempo_real ?? SEM_TEMPO_REAL
  const aoVivo = tempoReal.ativo && tempoReal.colaboradores_ao_vivo > 0
  const dadosAte = textoAte(tempoReal.dados_ate)
  const atualizados = textoAtualizados(tempoReal.atualizado_de, tempoReal.atualizado_ate)
  const nomePainel = unidade?.nome ?? 'Todas as unidades'
  const unidadesPainel = dados.unidades ?? []
  // no consolidado, cada unidade tem o seu fechamento: a data só vale se for igual em todas
  const datasIguais = unidadesPainel
    .filter((item) => item.fechamento)
    .every((item) => item.fechamento?.data_referencia === fechamento?.data_referencia)
  const todos = dados.colaboradores
  const incompleto = dados.total > todos.length
  const origem = { de: location.pathname + location.search }
  const linkColaborador = (linha: Linha) => `/unidades/${linha.unidade_id ?? unidade?.id}/colaboradores/${linha.id}`
  const linkDashboard = consolidado ? '/unidades' : `/unidades/${unidadeId}`

  // no tempo real, linhas que ainda mostram o registro publicado (aguardando a vez delas);
  // no consolidado, só unidades de empresas em tempo real esperam atualização ao vivo
  const nomeFotografia = fechamento?.semana_fechamento_mes ? 'o último fechamento do mês' : 'a última fotografia publicada'
  const unidadesTempoReal = new Set(unidadesPainel.filter((u) => u.tempo_real).map((u) => u.id))
  const emTempoReal = (linha: Linha) => !consolidado || (linha.unidade_id != null && unidadesTempoReal.has(linha.unidade_id))
  const aguardandoAoVivo = (linha: Linha) => aoVivo && linha.fonte === 'fechamento' && emTempoReal(linha)
  const totalAguardando = aoVivo ? todos.filter(aguardandoAoVivo).length : 0
  const textoAguardando = `Aguardando atualização ao vivo: mostra ${nomeFotografia}${
    fechamento && datasIguais ? ` (até ${formatarData(fechamento.data_referencia)})` : ''
  }`

  // no consolidado cada linha traz o limite da empresa dela
  const limiteDe = (linha: Linha) =>
    linha.fora_da_curva === 'positivo'
      ? (linha.alerta_pos ?? limites.alerta_pos)
      : linha.fora_da_curva === 'negativo'
        ? (linha.alerta_neg ?? limites.alerta_neg)
        : undefined

  const colunasVisiveis = comIntervalo
    ? COLUNAS.filter((coluna) => coluna.campo !== 'pagas_min').map((coluna) =>
        coluna.campo === 'saldo_min' ? { ...coluna, rotulo: 'Saldo do intervalo' } : coluna,
      )
    : COLUNAS
  // "Fora da curva" olha o banco acumulado: some com intervalo de datas
  const filtrosVisiveis = comIntervalo ? FILTROS.filter((item) => item.valor !== 'fora') : FILTROS
  const textoIntervalo = intervaloEscolhido ? textoDoIntervalo(intervaloEscolhido) : null
  // período de cada linha aberta: o intervalo escolhido ou o período dos números dela
  const diasDe = (linha: Linha) => intervaloEscolhido ?? { de: linha.periodo_inicio, ate: linha.dados_ate }

  const complemento = (linha: Linha) => [consolidado ? linha.unidade_nome : null, linha.funcao].filter(Boolean).join(' · ')
  const nenhumColaborador = aoVivo || !fechamento ? 'Nenhum colaborador com dados' : 'Nenhum colaborador neste fechamento'
  const filtroAtual = descricaoFiltro(filtro, busca)
  const subtitulo = consolidado
    ? `Banco de horas de ${unidadesPainel.length} ${unidadesPainel.length === 1 ? 'unidade' : 'unidades'}`
    : `Banco de horas de ${nomePainel}`
  // de quando são os números (cabeçalho do PDF)
  const textoDados = aoVivo
    ? ['Tempo real', `dados até ${dadosAte}`, atualizados].filter(Boolean).join(' · ')
    : fechamento
      ? `Dados até ${formatarData(fechamento.data_referencia)}${
          !datasIguais ? ' (algumas unidades com dados anteriores)' : fechamento.semana_fechamento_mes ? ' (fechamento do mês)' : ''
        }`
      : null

  function baixarPlanilha() {
    baixarCsv(
      `colaboradores-${paraNomeArquivo(nomePainel)}-${hojeISO()}.csv`,
      linhasPlanilha(linhas, nomePainel, consolidado, filtroAtual, textoIntervalo),
    )
  }

  return (
    <section className="pagina dash">
      {/* "Salvar PDF": relatório próprio para a folha; a tabela da tela fica de fora da impressão */}
      <RelatorioColaboradores
        titulo={nomePainel}
        empresa={empresaEmFoco?.nome ?? null}
        consolidado={consolidado}
        linhas={linhas}
        totalGeral={todos.length}
        filtro={filtroAtual}
        ordem={descricaoOrdem(ordem)}
        dados={[subtitulo, textoIntervalo ? `extras e negativas de ${textoIntervalo}` : textoDados]
          .filter(Boolean)
          .join(' · ')}
        intervalo={comIntervalo}
      />

      <header className="dash-header nao-imprimir">
        <TituloPagina>Colaboradores</TituloPagina>
        {aoVivo && (
          <p className="dash-ao-vivo">
            <SeloTempoReal titulo="Os dados de cada colaborador são atualizados continuamente" />
            <span>{[`dados até ${dadosAte}`, atualizados].filter(Boolean).join(' · ')}</span>
          </p>
        )}
      </header>

      {!fechamento && !aoVivo ? (
        <EstadoVazio
          titulo={consolidado ? 'Ainda não há dados publicados nas suas unidades' : 'Ainda não há dados consolidados para esta unidade'}
        >
          <p>Os colaboradores aparecem aqui assim que os primeiros dados forem publicados.</p>
          <Link to={linkDashboard} className="btn-link">
            Ver o dashboard
          </Link>
        </EstadoVazio>
      ) : (
        <>
          <section className="dash-card dash-area-lista nao-imprimir" aria-labelledby="titulo-lista">
            <div className="dash-card-topo">
              <div>
                <h2 id="titulo-lista">{nomePainel}</h2>
                <p className="dash-card-sub">
                  {linhas.length === todos.length
                    ? `${todos.length} ${todos.length === 1 ? 'colaborador' : 'colaboradores'}`
                    : `${linhas.length} de ${todos.length} colaboradores`}
                  {totalAguardando > 0 && (
                    <>
                      {' · '}
                      <span className="marca-fotografia-legenda">
                        <IconeRelogio tamanho={13} />
                        {totalAguardando} aguardando atualização ao vivo
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="exportar nao-imprimir">
                <button type="button" className="btn-secondary" onClick={baixarPlanilha} disabled={linhas.length === 0}>
                  Baixar planilha
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => imprimirComoPdf(`Colaboradores - ${nomePainel}`)}
                  disabled={linhas.length === 0}
                  title="Abre a impressão do navegador; escolha “Salvar como PDF”"
                >
                  Salvar PDF
                </button>
              </div>
            </div>

            <BarraFiltros className="nao-imprimir">
              <LinhaFiltros>
                <BuscaFiltro
                  id="busca-colaborador"
                  rotulo="Buscar colaborador por nome"
                  placeholder="Buscar por nome"
                  valor={busca}
                  onMudar={(valor) => atualizarParam('busca', valor, '')}
                />
                {unidadesSeletor.length > 1 && (
                  <SelecaoFiltro
                    rotulo="Unidade"
                    icone={<IconeUnidade tamanho={15} />}
                    opcoes={[
                      { id: '', nome: 'Todas', geral: true },
                      ...unidadesSeletor.map((item) => ({ id: String(item.id), nome: item.nome_exibicao })),
                    ]}
                    valor={unidadeId ?? ''}
                    onMudar={irParaUnidade}
                  />
                )}
                {/* no computador a ordem fica no cabeçalho da tabela */}
                <SelecaoFiltro
                  rotulo="Ordenar"
                  className="so-celular"
                  icone={<IconeSeletor tamanho={15} />}
                  opcoes={[
                    ...(ORDENS_MOBILE.some((o) => o.valor === ordemAtual) ? [] : [{ id: ordemAtual, nome: 'Personalizada' }]),
                    ...ORDENS_MOBILE.map((o) => ({ id: o.valor, nome: o.rotulo })),
                  ]}
                  valor={ordemAtual}
                  onMudar={(valor) => atualizarParam('ordem', valor, ORDEM_PADRAO)}
                />
              </LinhaFiltros>
              <LinhaFiltros>
                <FiltroPeriodo
                  escolhido={intervaloEscolhido}
                  de={intervalo.deParam}
                  ate={intervalo.ateParam}
                  onMudar={intervalo.mudar}
                />
              </LinhaFiltros>
              <LinhaFiltros>
                <Segmentado
                  rotulo="Filtrar colaboradores"
                  opcoes={filtrosVisiveis}
                  valor={filtro}
                  onEscolher={(valor) => atualizarParam('filtro', valor, 'todos')}
                />
              </LinhaFiltros>
            </BarraFiltros>

            <p className="sr-only" aria-live="polite">
              {linhas.length} de {todos.length} colaboradores exibidos
            </p>

            {linhas.length === 0 ? (
              <EstadoVazio titulo={todos.length ? 'Nenhum colaborador encontrado' : nenhumColaborador}>
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
                          {colunasVisiveis.map((coluna) => (
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
                        {linhas.map((linha) => {
                          const aberto = abertos.has(linha.id)
                          const acima =
                            linha.dias_extra_acima + linha.dias_negativa_acima > 0 ? textoDiasAcima(linha) : null
                          return (
                            <Fragment key={linha.id}>
                              <tr className={linha.fora_da_curva ? `linha-${linha.fora_da_curva}` : undefined}>
                                <th scope="row" className="celula-nome">
                                  <span className="celula-pessoa">
                                    <button
                                      type="button"
                                      className={aberto ? 'btn-dias aberto' : 'btn-dias'}
                                      aria-expanded={aberto}
                                      onClick={() => alternarDias(linha.id)}
                                      title={aberto ? 'Fechar os dias' : 'Ver em que dias foram as horas'}
                                    >
                                      <span aria-hidden="true">›</span>
                                      <span className="sr-only">Dias de {linha.nome}</span>
                                    </button>
                                    <span className="avatar avatar-pequeno" aria-hidden="true">
                                      {iniciais(linha.nome)}
                                    </span>
                                    <span>
                                      <Link to={linkColaborador(linha)} state={origem}>
                                        {linha.nome}
                                      </Link>
                                      {aguardandoAoVivo(linha) && <MarcaFotografia texto={textoAguardando} />}
                                      {complemento(linha) && (
                                        <span className="celula-funcao">{complemento(linha)}</span>
                                      )}
                                      {acima && (
                                        <button
                                          type="button"
                                          className="selo-limite-dia"
                                          title={acima.longo}
                                          onClick={() => alternarDias(linha.id)}
                                        >
                                          {acima.curto}
                                        </button>
                                      )}
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
                                {!comIntervalo && (
                                  <td className="num">
                                    <Horas minutos={linha.pagas_min} />
                                  </td>
                                )}
                                <td>
                                  <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe(linha)} pilula />
                                </td>
                              </tr>
                              {aberto && (
                                <DiasColaboradorLinhas colaboradorId={linha.id} comPagas={!comIntervalo} {...diasDe(linha)} />
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <ul className="lista-cartoes">
                  {linhas.map((linha) => {
                    const aberto = abertos.has(linha.id)
                    const acima = linha.dias_extra_acima + linha.dias_negativa_acima > 0 ? textoDiasAcima(linha) : null
                    return (
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
                            <span className="cartao-colab-nome">
                              {linha.nome}
                              {aguardandoAoVivo(linha) && <MarcaFotografia texto={textoAguardando} />}
                            </span>
                            <span className="cartao-colab-saldo">
                              <Horas minutos={linha.saldo_min} sinal destacar />
                              <IndicadorCurva valor={linha.fora_da_curva} limite={limiteDe(linha)} compacto />
                            </span>
                          </span>
                          <span className="cartao-colab-detalhe">
                            {consolidado && linha.unidade_nome && `${linha.unidade_nome} · `}
                            Extras <Horas minutos={linha.extra_min} /> · Neg. <Horas minutos={linha.negativa_min} />
                            {!comIntervalo && (
                              <>
                                {' · Pagas '}
                                <Horas minutos={linha.pagas_min} />
                              </>
                            )}
                          </span>
                        </Link>
                        <button
                          type="button"
                          className="cartao-colab-dias"
                          aria-expanded={aberto}
                          aria-controls={`dias-cartao-${linha.id}`}
                          onClick={() => alternarDias(linha.id)}
                        >
                          {aberto ? 'Fechar os dias' : 'Ver os dias'}
                          {acima && <span className="selo-limite-dia">{acima.curto}</span>}
                        </button>
                        {aberto && (
                          <div id={`dias-cartao-${linha.id}`}>
                            <DiasColaborador colaboradorId={linha.id} {...diasDe(linha)} />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          {incompleto && (
            <p className="rodape-nota">
              Exibindo {todos.length} de {dados.total} colaboradores (limite por página).
            </p>
          )}
          <p className="rodape-nota nao-imprimir">Somente leitura. Ajustes de ponto são feitos pelo RH na FriPonto.</p>
        </>
      )}
    </section>
  )
}

/** Ícone discreto: no tempo real, a linha ainda mostra o registro publicado (último fechamento do mês). */
function MarcaFotografia({ texto }: { texto: string }) {
  return (
    <span className="marca-fotografia" title={texto}>
      <IconeRelogio tamanho={13} />
      <span className="sr-only">{texto}</span>
    </span>
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
