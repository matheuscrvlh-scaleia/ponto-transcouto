import { useState, type ReactNode } from 'react'
import { Aviso, EstadoVazio } from '../../components/Estados'
import { GraficoSaldo, type LimitesSaldo } from '../../components/GraficoSemanas'
import { Horas } from '../../components/Horas'
import { IconeCheck } from '../../components/Icones'
import { ORIGENS } from '../../lib/batidas'
import { formatarData, formatarMinutos, hojeISO } from '../../lib/formato'
import type { DiaCalculado, PontoGrafico, Secao } from '../../lib/historico-dias'
import type { BatidaDoDia, DataISO, Minutos, SemanaHistorico } from '../../types/api'

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function diaDaSemana(data: DataISO) {
  const [a, m, d] = data.split('-').map(Number)
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

type Filtro = 'todos' | 'acima' | 'conferir'

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos os dias' },
  { valor: 'acima', rotulo: 'Acima do limite diário' },
  { valor: 'conferir', rotulo: 'Para conferir' },
]

const passaNoFiltro = (dia: DiaCalculado, filtro: Filtro) =>
  filtro === 'todos' || (filtro === 'acima' ? dia.extraAcima || dia.negativaAcima : dia.avisos.length > 0)

function alternar(conjunto: Set<string>, chave: string) {
  const novo = new Set(conjunto)
  if (!novo.delete(chave)) novo.add(chave)
  return novo
}

/* ---------- Valores ---------- */

interface ValorProps {
  rotulo: string
  /** null = sem dado. */
  minutos: Minutos | null
  sinal?: boolean
  /** Cor pelo sinal (positivo azul, negativo vermelho). */
  destacar?: boolean
  forte?: boolean
  /** Realça o valor (dia acima do limite). */
  aviso?: boolean
  /** Zero aparece como traço, para a linha não ficar cheia de 00:00. */
  zeroVazio?: boolean
  estimado?: boolean
}

const TEXTO_ESTIMADO = 'Estimado: saldo do fechamento anterior + extras - negativas dos dias. As horas pagas só entram no fechamento.'

function Valor({ rotulo, minutos, sinal, destacar, forte, aviso, zeroVazio, estimado }: ValorProps) {
  const classe = ['dc-v', forte && 'dc-v-forte', aviso && 'dc-v-aviso'].filter(Boolean).join(' ')
  return (
    <span className={classe}>
      <span className="dc-v-rotulo">{rotulo}</span>
      {minutos === null ? (
        <span className="dc-zero">
          <span aria-hidden="true">—</span>
          <span className="sr-only">sem dado</span>
        </span>
      ) : zeroVazio && minutos === 0 ? (
        <span className="dc-zero">
          <span aria-hidden="true">—</span>
          <span className="sr-only">zero</span>
        </span>
      ) : (
        <span>
          <Horas minutos={minutos} sinal={sinal} destacar={destacar} />
          {estimado && (
            <abbr className="dc-estimado" title={TEXTO_ESTIMADO}>
              *
            </abbr>
          )}
        </span>
      )}
    </span>
  )
}

/* ---------- Detalhe de um dia ---------- */

function situacaoDaBatida(batida: BatidaDoDia) {
  if (batida.tipo === 3) return { rotulo: 'Desconsiderada', classe: 'desconsiderada' }
  if (batida.tipo === 1 || batida.origem === 2) return { rotulo: 'Manual', classe: 'manual' }
  if (batida.tipo === 2) return { rotulo: 'Pré-assinalada', classe: 'pre' }
  return { rotulo: 'Original', classe: 'original' }
}

/** "lançada em 07/10 às 06:35": só quando entrou em outro dia ou não é uma batida original do relógio. */
function textoInclusao(batida: BatidaDoDia, dia: DataISO) {
  if (!batida.incluida_em) return null
  const [dataInclusao, horario = ''] = batida.incluida_em.split('T')
  if (dataInclusao === dia && batida.tipo === 0) return null
  return `lançada em ${formatarData(dataInclusao, { ano: false })} às ${horario.slice(0, 5)}`
}

function ItemBatida({ dia, hora, rotulo, batida, fora = false }: { dia: DataISO; hora: string; rotulo: string; batida: BatidaDoDia | null; fora?: boolean }) {
  const situacao = batida ? situacaoDaBatida(batida) : null
  const origem = batida ? (ORIGENS[batida.origem] ?? `Origem ${batida.origem}`) : null
  const inclusao = batida ? textoInclusao(batida, dia) : null
  return (
    <li className={fora ? 'dc-batida dc-batida-fora' : 'dc-batida'}>
      <span className="dc-batida-hora">{hora}</span>
      <span className="dc-batida-rotulo">{rotulo}</span>
      <span className="dc-batida-info">
        {situacao ? (
          <>
            <span className={`dc-sit dc-sit-${situacao.classe}`}>{situacao.rotulo}</span>
            <span>
              {origem}
              {batida?.equipamento_id != null && ` · equipamento ${batida.equipamento_id}`}
            </span>
            {inclusao && <span className="dc-batida-inclusao">{inclusao}</span>}
          </>
        ) : (
          <span>Sem registro no log de batidas</span>
        )}
      </span>
    </li>
  )
}

function LimiteDoDia({ valor, limite, acima, tipo }: { valor: Minutos; limite: Minutos; acima: boolean; tipo: 'extras' | 'negativas' }) {
  if (limite <= 0) return <span className="dc-conta-nota">Limite diário de {tipo} não configurado.</span>
  if (acima) {
    return (
      <span className="dc-conta-nota dc-aviso-texto">
        Passou {formatarMinutos(valor - limite)} do limite diário de {formatarMinutos(limite)}.
      </span>
    )
  }
  return <span className="dc-conta-nota">Dentro do limite diário de {formatarMinutos(limite)}.</span>
}

interface LimitesDia {
  extra_dia: Minutos
  negativa_dia: Minutos
}

function DetalheDia({ dia, limites, inicioPeriodo }: { dia: DiaCalculado; limites: LimitesDia; inicioPeriodo: DataISO | null }) {
  const temMarcacoes = dia.marcacoes.length > 0
  return (
    <div className="dc-detalhe">
      <div>
        <h5>{temMarcacoes ? 'Batidas usadas no cálculo' : dia.temCalculo ? 'Batidas do dia' : 'Batidas registradas'}</h5>
        {temMarcacoes ? (
          <ul className="dc-batidas">
            {dia.marcacoes.map((m, i) => (
              <ItemBatida key={`${m.hora}-${i}`} dia={dia.dia} hora={m.hora} rotulo={m.rotulo} batida={m.batida} />
            ))}
          </ul>
        ) : dia.situacao ? (
          <p className="dc-vazio">Situação do dia na FriPonto: {dia.situacao}. Nenhuma batida usada.</p>
        ) : dia.foraDoCalculo.length === 0 ? (
          <p className="dc-vazio">Nenhuma batida neste dia.</p>
        ) : null}

        {dia.foraDoCalculo.length > 0 && (
          <>
            <h5>{temMarcacoes || dia.situacao ? 'Fora do cálculo' : 'Ainda sem cálculo de horas'}</h5>
            <ul className="dc-batidas">
              {dia.foraDoCalculo.map((b, i) => (
                <ItemBatida
                  key={`${b.hora}-${i}`}
                  dia={dia.dia}
                  hora={b.hora}
                  rotulo={b.tipo === 3 ? 'Ignorada' : 'Batida'}
                  batida={b}
                  fora={b.tipo === 3}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <div>
        <h5>Contas do dia</h5>
        {dia.temCalculo ? (
          <dl className="dc-contas">
            <div className="dc-conta">
              <dt>Trabalhado pelas batidas</dt>
              <dd>{dia.trabalhado === null ? <span className="dc-zero">—</span> : <Horas minutos={dia.trabalhado} />}</dd>
              <span className="dc-conta-nota">Soma dos pares entrada e saída, sem regras de jornada.</span>
            </div>
            <div className="dc-conta">
              <dt>Extra do dia</dt>
              <dd className={dia.extraAcima ? 'dc-aviso-texto' : undefined}>
                <Horas minutos={dia.extra} />
              </dd>
              <LimiteDoDia valor={dia.extra} limite={limites.extra_dia} acima={dia.extraAcima} tipo="extras" />
            </div>
            <div className="dc-conta">
              <dt>Negativa do dia</dt>
              <dd className={dia.negativaAcima ? 'dc-aviso-texto' : undefined}>
                <Horas minutos={dia.negativa} />
              </dd>
              <LimiteDoDia valor={dia.negativa} limite={limites.negativa_dia} acima={dia.negativaAcima} tipo="negativas" />
            </div>
            {dia.extraPeriodo !== null && dia.negativaPeriodo !== null && (
              <div className="dc-conta">
                <dt>Extras acumuladas no período</dt>
                <dd>
                  <Horas minutos={dia.extraPeriodo} />
                </dd>
                <span className="dc-conta-nota">
                  Negativas acumuladas {formatarMinutos(dia.negativaPeriodo)}
                  {inicioPeriodo && `, desde ${formatarData(inicioPeriodo, { ano: false })}`}.
                </span>
              </div>
            )}
            {dia.saldo !== null && (
              <div className="dc-conta">
                <dt>Saldo do banco até o dia</dt>
                <dd>
                  <Horas minutos={dia.saldo} sinal destacar />
                </dd>
                <span className="dc-conta-nota">
                  {dia.saldoExato
                    ? 'Valor gravado pela FriPonto neste dia.'
                    : 'Estimado: saldo do fechamento anterior + extras - negativas. As horas pagas só entram no fechamento.'}
                </span>
              </div>
            )}
          </dl>
        ) : (
          <p className="dc-vazio">
            As horas deste dia ainda não foram calculadas. Elas entram na primeira coleta depois que o dia fecha.
          </p>
        )}
      </div>

      {dia.avisos.length > 0 && (
        <div className="dc-detalhe-avisos">
          {dia.avisos.map((aviso) => (
            <Aviso key={aviso}>{aviso}</Aviso>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Linha de um dia ---------- */

function resumoBatidas(dia: DiaCalculado) {
  if (dia.marcacoes.length > 0) {
    const primeira = dia.marcacoes[0].hora
    const ultima = dia.marcacoes[dia.marcacoes.length - 1].hora
    const n = dia.marcacoes.length
    return n === 1 ? `${primeira} · 1 batida` : `${primeira} às ${ultima} · ${n} batidas`
  }
  if (dia.situacao) return dia.situacao
  if (dia.foraDoCalculo.length > 0) {
    const n = dia.foraDoCalculo.length
    return `${n} ${n === 1 ? 'batida' : 'batidas'} sem cálculo`
  }
  return 'Sem batidas'
}

interface LinhaDiaProps {
  dia: DiaCalculado
  aberto: boolean
  onAlternar: () => void
  limites: LimitesDia
  inicioPeriodo: DataISO | null
}

function LinhaDia({ dia, aberto, onAlternar, limites, inicioPeriodo }: LinhaDiaProps) {
  const acima = dia.extraAcima || dia.negativaAcima
  const id = `dc-dia-${dia.dia}`
  return (
    <li className={acima ? 'dc-dia dc-dia-acima' : 'dc-dia'}>
      <button type="button" className="dc-linha" aria-expanded={aberto} aria-controls={id} onClick={onAlternar}>
        <span className="dc-seta" aria-hidden="true">
          ›
        </span>
        <span className="dc-titulo">
          <span className="dc-dia-data">
            <span className="dc-dia-semana">{diaDaSemana(dia.dia)}</span> {formatarData(dia.dia, { ano: false })}
          </span>
          {dia.dia === hojeISO() && <span className="dc-etiqueta">hoje</span>}
          {dia.situacao && !dia.marcacoes.length && <span className="dc-etiqueta">{dia.situacao}</span>}
          {!dia.temCalculo && <span className="dc-etiqueta">sem horas calculadas</span>}
          {acima && <span className="dc-etiqueta dc-etiqueta-aviso">acima do limite</span>}
          {dia.avisos.length > 0 && <span className="dc-etiqueta dc-etiqueta-aviso">conferir</span>}
        </span>
        <span className="dc-dia-batidas">{resumoBatidas(dia)}</span>
        <span className="dc-valores">
          <Valor rotulo="Trabalhadas" minutos={dia.temCalculo ? dia.trabalhado : null} />
          <Valor rotulo="Extra" minutos={dia.temCalculo ? dia.extra : null} zeroVazio forte={dia.extraAcima} aviso={dia.extraAcima} />
          <Valor
            rotulo="Negativa"
            minutos={dia.temCalculo ? dia.negativa : null}
            zeroVazio
            forte={dia.negativaAcima}
            aviso={dia.negativaAcima}
          />
          <Valor rotulo="Extras acumuladas" minutos={dia.extraPeriodo} />
          <Valor rotulo="Saldo acumulado" minutos={dia.saldo} sinal destacar forte estimado={dia.saldo !== null && !dia.saldoExato} />
        </span>
      </button>
      {aberto && (
        <div id={id}>
          <DetalheDia dia={dia} limites={limites} inicioPeriodo={inicioPeriodo} />
        </div>
      )}
    </li>
  )
}

/* ---------- Seção (semana ou período) ---------- */

function faixaDeDatas(inicio: DataISO, fim: DataISO, hoje: DataISO) {
  const comAno = inicio.slice(0, 4) !== hoje.slice(0, 4) || fim.slice(0, 4) !== hoje.slice(0, 4)
  return `${formatarData(inicio, { ano: comAno })} a ${formatarData(fim, { ano: comAno })}`
}

function tituloDaSecao(secao: Secao, hoje: DataISO) {
  if (secao.tipo === 'andamento') return `Desde o último fechamento (${faixaDeDatas(secao.inicio, secao.fim, hoje)})`
  if (secao.tipo === 'periodo') {
    return secao.fim === hoje
      ? `Período de ${formatarData(secao.inicio, { ano: secao.inicio.slice(0, 4) !== hoje.slice(0, 4) })} até hoje`
      : `Período de ${faixaDeDatas(secao.inicio, secao.fim, hoje)}`
  }
  return secao.inicio === secao.fim
    ? `Semana de ${formatarData(secao.fim, { ano: secao.fim.slice(0, 4) !== hoje.slice(0, 4) })}`
    : `Semana de ${faixaDeDatas(secao.inicio, secao.fim, hoje)}`
}

const plural = (n: number, singular: string, pluralTexto: string) => `${n} ${n === 1 ? singular : pluralTexto}`

interface LinhaSecaoProps {
  secao: Secao
  hoje: DataISO
  aberta: boolean
  onAlternar: () => void
}

function CabecalhoSecao({ secao, hoje, aberta, onAlternar }: LinhaSecaoProps) {
  const id = `dc-corpo-${secao.chave}`
  const andamento = secao.tipo === 'andamento'
  const ultimoSaldo = secao.dias.at(-1)?.saldo ?? null
  return (
    <h3 className="dc-secao-titulo">
      <button type="button" className="dc-linha dc-linha-secao" aria-expanded={aberta} aria-controls={id} onClick={onAlternar}>
        <span className="dc-seta" aria-hidden="true">
          ›
        </span>
        <span className="dc-titulo">
          <span className="dc-titulo-texto">{tituloDaSecao(secao, hoje)}</span>
          {secao.fechamentoMes && <span className="dc-etiqueta">fechamento do mês</span>}
          {andamento && <span className="dc-etiqueta dc-etiqueta-info">em apuração</span>}
          {secao.diasAcima > 0 && (
            <span className="dc-etiqueta dc-etiqueta-aviso">{plural(secao.diasAcima, 'dia acima do limite', 'dias acima do limite')}</span>
          )}
          {secao.diasParaConferir > 0 && (
            <span className="dc-etiqueta dc-etiqueta-aviso">{plural(secao.diasParaConferir, 'dia para conferir', 'dias para conferir')}</span>
          )}
        </span>
        <span className="dc-valores">
          <Valor rotulo="Extras" minutos={secao.oficial?.extra ?? (secao.dias.length ? secao.somaDias.extra : null)} />
          <Valor rotulo="Negativas" minutos={secao.oficial?.negativa ?? (secao.dias.length ? secao.somaDias.negativa : null)} />
          <Valor rotulo="Pagas" minutos={secao.oficial?.pagas ?? null} />
          <Valor rotulo="Banco" minutos={secao.oficial?.banco ?? null} sinal destacar />
          <Valor
            rotulo="Saldo acumulado"
            minutos={secao.oficial?.saldo ?? ultimoSaldo}
            sinal
            destacar
            forte
            estimado={!secao.oficial && ultimoSaldo !== null}
          />
        </span>
      </button>
    </h3>
  )
}

interface CorpoProps {
  secao: Secao
  dias: DiaCalculado[]
  diasAbertos: Set<string>
  onAlternarDia: (dia: DataISO) => void
  limites: LimitesDia
  /** Primeiro dia com horas calculadas em toda a lista: antes dele não há detalhe por dia. */
  primeiroDiaComDados: DataISO | null
  detalheDisponivel: boolean
  onTentarDeNovo?: () => void
  filtrado: boolean
  inicioPeriodo: DataISO | null
}

function ConferenciaSecao({ secao }: { secao: Secao }) {
  const { oficial, diferenca } = secao
  if (!oficial || secao.tipo === 'andamento') return null
  const confere = diferenca && diferenca.extra === 0 && diferenca.negativa === 0
  return (
    <div className="dc-conferencia">
      <p>
        <strong>Fechamento oficial:</strong>{' '}
        {secao.abertura !== null && (
          <>
            saldo de {formatarMinutos(secao.abertura, { sinal: true })} no início, extras {formatarMinutos(oficial.extra)}, negativas{' '}
            {formatarMinutos(oficial.negativa)}, pagas {formatarMinutos(oficial.pagas)}, saldo de{' '}
            {formatarMinutos(oficial.saldo, { sinal: true })} no fim.
          </>
        )}
        {secao.abertura === null && (
          <>
            extras {formatarMinutos(oficial.extra)}, negativas {formatarMinutos(oficial.negativa)}, pagas {formatarMinutos(oficial.pagas)},
            saldo de {formatarMinutos(oficial.saldo, { sinal: true })}.
          </>
        )}
      </p>
      {confere && (
        <p className="dc-confere">
          <IconeCheck tamanho={13} /> A soma dos dias confere com o fechamento.
        </p>
      )}
      {diferenca && !confere && (
        <p>
          A soma dos dias (extras {formatarMinutos(secao.somaDias.extra)}, negativas {formatarMinutos(secao.somaDias.negativa)}) é
          diferente do fechamento. Os dias são regravados a cada coleta e podem ter mudado depois do fechamento (ajuste do RH ou
          correção de batida); o fechamento é uma fotografia e não muda.
        </p>
      )}
    </div>
  )
}

function CorpoSecao({
  secao,
  dias,
  diasAbertos,
  onAlternarDia,
  limites,
  primeiroDiaComDados,
  detalheDisponivel,
  onTentarDeNovo,
  filtrado,
  inicioPeriodo,
}: CorpoProps) {
  const semDetalhe = secao.dias.length === 0
  const comEstimado = secao.dias.some((d) => d.saldo !== null && !d.saldoExato)

  return (
    <>
      {secao.tipo === 'andamento' && (
        <p className="dc-nota">
          Dias depois do último fechamento: ainda não entram no banco oficial, que muda no próximo fechamento.
        </p>
      )}
      {semDetalhe && (
        <p className="dc-nota">
          {!detalheDisponivel ? (
            <>
              Não foi possível carregar o detalhe dos dias.{' '}
              {onTentarDeNovo && (
                <button type="button" className="btn-link" onClick={onTentarDeNovo}>
                  Tentar de novo
                </button>
              )}
            </>
          ) : primeiroDiaComDados && secao.fim < primeiroDiaComDados ? (
            `Sem detalhe por dia nesta semana: a coleta diária começou em ${formatarData(primeiroDiaComDados)}. Os totais acima são os do fechamento.`
          ) : (
            'Sem detalhe por dia nesta semana. Os totais acima são os do fechamento.'
          )}
        </p>
      )}
      {!semDetalhe && !secao.completa && secao.tipo !== 'andamento' && (
        <p className="dc-nota dc-nota-aviso">
          Detalhe de {plural(secao.dias.filter((d) => d.temCalculo).length, 'dia', 'dias')} com horas calculadas; os demais dias da
          semana não têm detalhe. A soma abaixo pode não bater com o fechamento.
        </p>
      )}
      {comEstimado && (
        <p className="dc-nota">
          * Saldo estimado: saldo do fechamento anterior + extras - negativas dos dias. As horas pagas só são descontadas no fechamento.
        </p>
      )}
      {filtrado && dias.length < secao.dias.length && (
        <p className="dc-nota">
          Mostrando {dias.length} de {secao.dias.length} dias, pelo filtro escolhido.
        </p>
      )}

      {dias.length > 0 && (
        <ul className="dc-dias">
          <li className="dc-colunas" aria-hidden="true">
            <span>Dia e batidas</span>
            <span>Trabalhadas</span>
            <span>Extra</span>
            <span>Negativa</span>
            <span>Extras acum.</span>
            <span>Saldo acum.</span>
          </li>
          {dias.map((dia) => (
            <LinhaDia
              key={dia.dia}
              dia={dia}
              aberto={diasAbertos.has(dia.dia)}
              onAlternar={() => onAlternarDia(dia.dia)}
              limites={limites}
              inicioPeriodo={inicioPeriodo}
            />
          ))}
        </ul>
      )}
      <ConferenciaSecao secao={secao} />
    </>
  )
}

/* ---------- Histórico completo ---------- */

interface HistoricoProps {
  nome: string
  tempoReal: boolean
  secoes: Secao[]
  /** Saldo ao longo do tempo, já escolhido (semanas, dias gravados ou dias estimados). */
  grafico: { pontos: PontoGrafico[]; origem: 'semanas' | 'dias' | 'dias-estimados' }
  limitesBanco: LimitesSaldo
  limitesDia: LimitesDia
  /** Fechamentos do mês (tempo real): o registro oficial, em tabela. */
  fechamentos: SemanaHistorico[]
  /** A consulta do detalhe por dia deu certo? */
  detalheDisponivel: boolean
  onTentarDeNovo?: () => void
  /** Início do período do resumo (para dizer "desde dd/mm" nas extras acumuladas). */
  inicioPeriodo: DataISO | null
}

export function HistoricoDias({
  nome,
  tempoReal,
  secoes,
  grafico,
  limitesBanco,
  limitesDia,
  fechamentos,
  detalheDisponivel,
  onTentarDeNovo,
  inicioPeriodo,
}: HistoricoProps) {
  const hoje = hojeISO()
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(secoes[0] ? [secoes[0].chave] : []))
  const [diasAbertos, setDiasAbertos] = useState<Set<string>>(() => new Set())
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const primeiroDiaComDados =
    secoes
      .flatMap((s) => s.dias)
      .filter((d) => d.temCalculo)
      .map((d) => d.dia)
      .sort()[0] ?? null
  const totalAcima = secoes.reduce((soma, s) => soma + s.diasAcima, 0)
  const totalConferir = secoes.reduce((soma, s) => soma + s.diasParaConferir, 0)

  const visiveis = secoes
    .map((secao) => ({ secao, dias: secao.dias.filter((d) => passaNoFiltro(d, filtro)) }))
    .filter(({ dias }) => filtro === 'todos' || dias.length > 0)

  function escolherFiltro(novo: Filtro) {
    setFiltro(novo)
    // com filtro, as semanas que têm o que mostrar já abrem
    if (novo !== 'todos') {
      setAbertas(new Set(secoes.filter((s) => s.dias.some((d) => passaNoFiltro(d, novo))).map((s) => s.chave)))
    }
  }

  const textoLimites = [
    limitesDia.extra_dia > 0 && `extras acima de ${formatarMinutos(limitesDia.extra_dia)}`,
    limitesDia.negativa_dia > 0 && `negativas acima de ${formatarMinutos(limitesDia.negativa_dia)}`,
  ].filter(Boolean)

  const { pontos, origem } = grafico
  const ultimo = pontos.at(-1)
  const penultimo = pontos.at(-2)
  const fechamentosMes = [...fechamentos]
    .filter((item) => item.semana_fechamento_mes)
    .sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))

  const subGrafico: Record<typeof origem, string> = {
    semanas: 'Saldo ao fim de cada semana fechada. As linhas tracejadas são os limites do banco.',
    dias: 'Saldo gravado em cada dia. As linhas tracejadas são os limites do banco.',
    'dias-estimados':
      'Ainda há um só fechamento, então as barras mostram o saldo estimado dia a dia (saldo do fechamento + extras - negativas). Barras amarelas têm batidas para conferir.',
  }

  return (
    <>
      {pontos.length > 1 && (
        <section className="dc-card" aria-labelledby="dc-grafico-titulo">
          <h2 id="dc-grafico-titulo">Evolução do saldo</h2>
          <p className="dc-card-sub">{subGrafico[origem]}</p>
          {penultimo && ultimo && (
            <p className="sr-only">
              Saldo passou de {formatarMinutos(penultimo.saldo, { sinal: true })} para {formatarMinutos(ultimo.saldo, { sinal: true })} no
              último ponto. Os valores estão no histórico abaixo.
            </p>
          )}
          <GraficoSaldo pontos={pontos} larguraMaxBarra={origem === 'semanas' ? 28 : 18} limites={limitesBanco} />
        </section>
      )}

      {secoes.length === 0 ? (
        <EstadoVazio titulo={tempoReal ? 'Ainda não há histórico diário para este colaborador' : 'Ainda não há histórico para este colaborador'}>
          <p>
            {tempoReal
              ? 'O histórico diário começa a ser gravado a partir de agora, a cada atualização ao vivo.'
              : 'Os dados aparecem aqui depois da próxima atualização.'}
          </p>
        </EstadoVazio>
      ) : (
        <section className="dc-card" aria-labelledby="dc-historico-titulo">
          <div className="dc-card-topo">
            <div>
              <h2 id="dc-historico-titulo">{tempoReal ? 'Histórico por período' : 'Histórico semanal'}</h2>
              <p className="dc-card-sub">
                Abra {tempoReal ? 'um período' : 'uma semana'} para ver os dias e um dia para ver as batidas, as contas e o saldo até ali.
                {textoLimites.length > 0
                  ? ` Dias marcados pelo limite diário atual da empresa: ${textoLimites.join(' ou ')}.`
                  : ' O limite diário da empresa não está configurado, então nenhum dia é marcado.'}
              </p>
            </div>
          </div>

          <div className="dc-barra nao-imprimir">
            <div className="dc-filtros" role="group" aria-label="Filtrar dias">
              {FILTROS.map(({ valor, rotulo }) => {
                const contagem = valor === 'acima' ? totalAcima : valor === 'conferir' ? totalConferir : null
                return (
                  <button key={valor} type="button" className="dc-filtro" aria-pressed={filtro === valor} onClick={() => escolherFiltro(valor)}>
                    {rotulo}
                    {contagem !== null && ` (${contagem})`}
                  </button>
                )
              })}
            </div>
            <div className="dc-expandir">
              <button type="button" className="btn-link" onClick={() => setAbertas(new Set(visiveis.map(({ secao }) => secao.chave)))}>
                Abrir {tempoReal ? 'períodos' : 'semanas'}
              </button>
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setAbertas(new Set())
                  setDiasAbertos(new Set())
                }}
              >
                Fechar tudo
              </button>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <p className="dc-nota" style={{ paddingLeft: 0 }}>
              Nenhum dia com este filtro.
            </p>
          ) : (
            <ul className="dc-lista">
              <li className="dc-colunas" aria-hidden="true">
                <span>{tempoReal ? 'Período' : 'Semana'}</span>
                <span>Extras</span>
                <span>Negativas</span>
                <span>Pagas</span>
                <span>Banco</span>
                <span>Saldo acum.</span>
              </li>
              {visiveis.map(({ secao, dias }) => {
                const aberta = abertas.has(secao.chave)
                return (
                  <li key={secao.chave} className="dc-secao">
                    <CabecalhoSecao
                      secao={secao}
                      hoje={hoje}
                      aberta={aberta}
                      onAlternar={() => setAbertas((atual) => alternar(atual, secao.chave))}
                    />
                    <div id={`dc-corpo-${secao.chave}`} className="dc-secao-corpo" hidden={!aberta}>
                      <CorpoSecao
                        secao={secao}
                        dias={dias}
                        diasAbertos={diasAbertos}
                        onAlternarDia={(dia) => setDiasAbertos((atual) => alternar(atual, dia))}
                        limites={limitesDia}
                        primeiroDiaComDados={primeiroDiaComDados}
                        detalheDisponivel={detalheDisponivel}
                        onTentarDeNovo={onTentarDeNovo}
                        filtrado={filtro !== 'todos'}
                        inicioPeriodo={inicioPeriodo}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {tempoReal && <FechamentosDoMes nome={nome} fechamentos={fechamentosMes} />}
    </>
  )
}

/* ---------- Fechamentos do mês (tempo real) ---------- */

function FechamentosDoMes({ nome, fechamentos }: { nome: string; fechamentos: SemanaHistorico[] }): ReactNode {
  return (
    <section className="dc-card" aria-labelledby="dc-fechamentos-titulo">
      <h2 id="dc-fechamentos-titulo">Fechamentos do mês</h2>
      <p className="dc-card-sub">Registro oficial gravado no dia do fechamento; o saldo dele passa para o mês seguinte.</p>
      {fechamentos.length === 0 ? (
        <p className="dc-card-sub">Nenhum fechamento do mês gravado ainda para este colaborador.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Fechamentos do mês de {nome}</caption>
            <thead>
              <tr>
                <th scope="col">Fechamento</th>
                <th scope="col" className="num">
                  Extras no período
                </th>
                <th scope="col" className="num">
                  Negativas no período
                </th>
                <th scope="col" className="num">
                  Saldo acum.
                </th>
              </tr>
            </thead>
            <tbody>
              {fechamentos.map((fechamento) => (
                <tr key={fechamento.fechamento_id}>
                  <th
                    scope="row"
                    title={`Período de ${formatarData(fechamento.periodo_inicio)} a ${formatarData(fechamento.data_referencia)}`}
                  >
                    {formatarData(fechamento.data_referencia)}
                  </th>
                  <td className="num">
                    <Horas minutos={fechamento.extra_periodo} />
                  </td>
                  <td className="num">
                    <Horas minutos={fechamento.negativa_periodo} />
                  </td>
                  <td className="num">
                    <Horas minutos={fechamento.saldo_total} sinal destacar className="forte" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
