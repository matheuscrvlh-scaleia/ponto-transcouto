import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Segmentado } from '../components/BarraFiltros'
import { Carregando, ErroCarregamento } from '../components/Estados'
import { Horas } from '../components/Horas'
import { IconeAlerta, IconeCalendario, IconeMais, IconeMenos, IconeRelogio } from '../components/Icones'
import { Modal } from '../components/Modal'
import { api } from '../lib/api'
import { ehHorario, marcacoesParaExibir, origemDa, situacaoDa, textoInclusao } from '../lib/batidas'
import { formatarData, formatarDiaPorExtenso, formatarMinutos } from '../lib/formato'
import { textoDoIntervalo, type Intervalo } from '../lib/intervalo'
import { useRecurso } from '../lib/useRecurso'
import type { DataISO, DiasDetalhe, Minutos } from '../types/api'
import './dashboard.css'
import './batidas.css'
import './colaborador.css'

/* Perfil do colaborador num intervalo de datas (GET /colaboradores/:id/dias-detalhe): números do intervalo,
   gráfico por dia, dia a dia (batidas lado a lado para comparar) e as marcações brutas da FriPonto. */

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
/** Mais que isso trabalhado num dia quase sempre é batida esquecida ou fora de ordem. */
const DIA_SUSPEITO_MIN = 16 * 60

type Dia = DiasDetalhe['dias'][number]
type Aba = 'dias' | 'batidas' | 'historico'
/** Card aberto no modal de detalhe. */
type Detalhe = 'extras' | 'negativas' | 'saldo' | 'limite' | 'batidas'

function diaDaSemana(data: DataISO) {
  const [a, m, d] = data.split('-').map(Number)
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

const minutosDe = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/**
 * Tempo entre as marcações em pares (entrada → saída) e se o dia pede conferência:
 * número ímpar de batidas, ou mais de 16h trabalhadas (batida fora de ordem vira "virada de noite").
 */
export function analisarDia(todas: string[]): { trabalhado: Minutos | null; conferir: string | null } {
  // textos como FOLGA ou FALTA ficam de fora da conta
  const marcacoes = todas.filter(ehHorario)
  if (marcacoes.length === 0) return { trabalhado: null, conferir: null }
  let trabalhado = 0
  for (let i = 0; i + 1 < marcacoes.length; i += 2) {
    const entrada = minutosDe(marcacoes[i])
    let saida = minutosDe(marcacoes[i + 1])
    if (saida < entrada) saida += 24 * 60
    trabalhado += saida - entrada
  }
  if (marcacoes.length % 2 === 1) return { trabalhado, conferir: 'Número ímpar de batidas: falta uma entrada ou saída' }
  if (trabalhado > DIA_SUSPEITO_MIN) {
    return { trabalhado, conferir: `${formatarMinutos(trabalhado)} entre as batidas: provável batida fora de ordem ou esquecida` }
  }
  return { trabalhado, conferir: null }
}

type Campo = 'extra' | 'negativa'
type ColunasPorCampo = DiasDetalhe['colunas']

/** Minutos da coluna da FriPonto no dia; negativa sempre sem sinal, como na soma do servidor. */
function minutosDaColuna(dia: Dia, coluna: string, campo: Campo) {
  const valor = dia.colunas[coluna] ?? 0
  return campo === 'negativa' ? Math.abs(valor) : valor
}

const totalDoCampo = (dia: Dia, campo: Campo) => (campo === 'extra' ? dia.extra_min : dia.negativa_min)

/** Com uma coluna só, a soma é a própria coluna: a tabela abre as colunas só quando há mais de uma. */
const colunasAbertas = (colunas: ColunasPorCampo) => ({
  extra: colunas.extra.length > 1 ? colunas.extra : [],
  negativa: colunas.negativa.length > 1 ? colunas.negativa : [],
})

interface Props {
  colaboradorId: number
  intervalo: Intervalo
  /** Histórico semanal (ou diário, no tempo real) e fechamentos: a aba "Histórico". */
  historico: ReactNode
}

export function PerfilIntervalo({ colaboradorId, intervalo, historico }: Props) {
  const [aba, setAba] = useState<Aba>('dias')
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<DiasDetalhe>(`/colaboradores/${colaboradorId}/dias-detalhe`, { signal, query: intervalo }),
    `pc-dias-${colaboradorId}-${intervalo.de}-${intervalo.ate}`,
  )

  const dias = useMemo(
    () =>
      (dados?.dias ?? []).map((dia) => {
        // sem cálculo da coleta ainda: as batidas válidas do log fazem o papel das marcações
        const marcacoes = dia.tem_calculo ? dia.marcacoes : dia.batidas.filter((b) => b.tipo !== 3).map((b) => b.hora)
        return { ...dia, marcacoes, ...analisarDia(marcacoes) }
      }),
    [dados],
  )

  if (carregando) return <Carregando texto="Carregando os dias..." />
  if (erro || !dados) return erro ? <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} /> : null

  const texto = textoDoIntervalo(intervalo)
  const extra = dias.reduce((soma, d) => soma + d.extra_min, 0)
  const negativa = dias.reduce((soma, d) => soma + d.negativa_min, 0)
  const diasComExtra = dias.filter((d) => d.extra_min > 0).length
  const maiorExtra = dias.reduce<(typeof dias)[number] | null>((maior, d) => (d.extra_min > 0 && (!maior || d.extra_min >= maior.extra_min) ? d : maior), null)
  const diasComNegativa = dias.filter((d) => d.negativa_min > 0).length
  const acimaExtra = dias.filter((d) => d.extra_acima).length
  const acimaNegativa = dias.filter((d) => d.negativa_acima).length
  const trabalhados = dias.filter((d) => d.trabalhado !== null && !d.conferir)
  const mediaTrabalhada = trabalhados.length
    ? Math.round(trabalhados.reduce((soma, d) => soma + (d.trabalhado ?? 0), 0) / trabalhados.length)
    : null
  const diasComBatida = dias.filter((d) => d.marcacoes.some(ehHorario)).length
  const aConferir = dias.filter((d) => d.conferir).length
  const { extra_dia: limiteExtra, negativa_dia: limiteNegativa } = dados.limites
  const semLimite = !limiteExtra && !limiteNegativa

  return (
    <>
      <div className="pc-kpis">
        <Indicador
          icone={<IconeMais tamanho={16} />}
          rotulo="Extras"
          valor={<Horas minutos={extra} />}
          detalhe={
            maiorExtra
              ? `em ${diasComExtra} ${diasComExtra === 1 ? 'dia' : 'dias'} · maior ${formatarMinutos(maiorExtra.extra_min)} em ${formatarData(maiorExtra.dia, { ano: false })}`
              : 'nenhum dia'
          }
          tom="positivo"
          onAbrir={() => setDetalhe('extras')}
        />
        <Indicador
          icone={<IconeMenos tamanho={16} />}
          rotulo="Negativas"
          valor={<Horas minutos={negativa} />}
          detalhe={diasComNegativa ? `em ${diasComNegativa} ${diasComNegativa === 1 ? 'dia' : 'dias'}` : 'nenhum dia'}
          tom="negativo"
          onAbrir={() => setDetalhe('negativas')}
        />
        <Indicador
          icone={<IconeRelogio tamanho={16} />}
          rotulo="Saldo do intervalo"
          valor={<Horas minutos={extra - negativa} sinal destacar />}
          detalhe="extras − negativas"
          onAbrir={() => setDetalhe('saldo')}
        />
        <Indicador
          icone={<IconeAlerta tamanho={16} />}
          onAbrir={() => setDetalhe('limite')}
          rotulo="Limite diário"
          valor={
            semLimite ? (
              '—'
            ) : (
              <span className="limite-dia-indicadores">
                <span className="limite-dia-indicador mais" title="Dias com extras acima do limite">
                  ▲ {acimaExtra}
                </span>
                <span className="limite-dia-indicador menos" title="Dias com negativas acima do limite">
                  ▼ {acimaNegativa}
                </span>
              </span>
            )
          }
          detalhe={
            semLimite
              ? 'sem limite configurado'
              : [limiteExtra ? `+${formatarMinutos(limiteExtra)}` : null, limiteNegativa ? `−${formatarMinutos(limiteNegativa)}` : null]
                  .filter(Boolean)
                  .join(' · ') + ' por dia'
          }
          tom={acimaExtra + acimaNegativa > 0 ? 'aviso' : undefined}
        />
        <Indicador
          icone={<IconeCalendario tamanho={16} />}
          rotulo="Dias com batida"
          valor={`${diasComBatida} de ${dias.length}`}
          detalhe={
            aConferir
              ? `${aConferir} ${aConferir === 1 ? 'dia' : 'dias'} para conferir`
              : mediaTrabalhada !== null
                ? `média de ${formatarMinutos(mediaTrabalhada)} por dia`
                : 'sem batidas'
          }
          tom={aConferir ? 'aviso' : undefined}
          onAbrir={() => setDetalhe('batidas')}
        />
      </div>

      {detalhe && (
        <ModalDetalhe
          detalhe={detalhe}
          dias={dias}
          colunas={dados.colunas}
          limites={dados.limites}
          intervalo={texto}
          onFechar={() => setDetalhe(null)}
        />
      )}

      {dias.length > 0 && (
        <section className="dash-card pc-grafico-card" aria-labelledby="titulo-grafico-dias">
          <div className="dash-card-topo">
            <div>
              <h2 id="titulo-grafico-dias">Extras e negativas por dia</h2>
              <p className="dash-card-sub">De {texto}</p>
            </div>
            <p className="pc-legenda" aria-hidden="true">
              <span className="pc-legenda-mais">Extras</span>
              <span className="pc-legenda-menos">Negativas</span>
            </p>
          </div>
          <GraficoDiasPerfil dias={dias} />
        </section>
      )}

      <section className="dash-card pc-abas-card">
        <Segmentado
          rotulo="Conteúdo do perfil"
          opcoes={[
            { valor: 'dias', rotulo: 'Dia a dia' },
            { valor: 'batidas', rotulo: 'Batidas' },
            { valor: 'historico', rotulo: 'Histórico' },
          ]}
          valor={aba}
          onEscolher={setAba}
        />
        {aba === 'dias' && <TabelaDias dias={dias} colunas={dados.colunas} intervalo={texto} />}
        {aba === 'batidas' && <BatidasDoIntervalo colaboradorId={colaboradorId} intervalo={intervalo} dias={dias} />}
        {aba === 'historico' && <div className="pc-historico">{historico}</div>}
      </section>
    </>
  )
}

/** Card de número do intervalo; clicar abre o detalhe (de que colunas sai a soma, que dias contam). */
function Indicador({
  icone,
  rotulo,
  valor,
  detalhe,
  tom,
  onAbrir,
}: {
  icone: ReactNode
  rotulo: string
  valor: ReactNode
  detalhe: string
  tom?: 'positivo' | 'negativo' | 'aviso'
  onAbrir: () => void
}) {
  return (
    <button type="button" className={tom ? `pc-kpi ${tom}` : 'pc-kpi'} onClick={onAbrir} aria-haspopup="dialog">
      <span className="pc-kpi-rotulo">
        <span className="pc-kpi-icone" aria-hidden="true">
          {icone}
        </span>
        {rotulo}
      </span>
      <span className="pc-kpi-valor">{valor}</span>
      <span className="pc-kpi-detalhe">{detalhe}</span>
    </button>
  )
}

/** Soma de um campo no intervalo, coluna por coluna da FriPonto. */
function composicao(dias: Dia[], colunas: string[], campo: Campo) {
  const linhas = colunas.map((coluna) => ({
    coluna,
    minutos: dias.reduce((soma, d) => soma + minutosDaColuna(d, coluna, campo), 0),
  }))
  const total = dias.reduce((soma, d) => soma + totalDoCampo(d, campo), 0)
  // dias coletados antes do detalhe por coluna (ou mapeamento mudado, à espera do recálculo)
  const semDetalhe = total - linhas.reduce((soma, l) => soma + l.minutos, 0)
  return { linhas, total, semDetalhe }
}

function TabelaComposicao({ dias, colunas, campo, rotulo }: { dias: Dia[]; colunas: string[]; campo: Campo; rotulo: string }) {
  const { linhas, total, semDetalhe } = composicao(dias, colunas, campo)
  return (
    <table className="pc-composicao">
      <caption className="sr-only">Colunas da FriPonto que somam {rotulo.toLowerCase()}</caption>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.coluna}>
            <th scope="row">{l.coluna}</th>
            <td className="num">
              <Horas minutos={l.minutos} />
            </td>
          </tr>
        ))}
        {semDetalhe !== 0 && (
          <tr className="pc-composicao-sem-detalhe">
            <th scope="row">Sem detalhe por coluna</th>
            <td className="num">
              <Horas minutos={semDetalhe} />
            </td>
          </tr>
        )}
        {linhas.length === 0 && semDetalhe === 0 && (
          <tr>
            <td colSpan={2} className="texto-suave">
              Nenhuma coluna da FriPonto com {rotulo.toLowerCase()} no intervalo.
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{rotulo}</th>
          <td className="num">
            <Horas minutos={total} />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

/** Colunas da FriPonto que vieram nos dias e não entram nas extras nem nas negativas. */
function ColunasFora({ dias, colunas }: { dias: Dia[]; colunas: string[] }) {
  if (colunas.length === 0) return null
  return (
    <div className="pc-fora">
      <p className="pc-fora-titulo">Não entram na conta</p>
      <ul>
        {colunas.map((coluna) => (
          <li key={coluna}>
            {coluna} <Horas minutos={dias.reduce((soma, d) => soma + (d.colunas[coluna] ?? 0), 0)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

const NOTA_SEM_DETALHE =
  '“Sem detalhe por coluna” são dias coletados antes de o Copiloto guardar as colunas da FriPonto de cada dia: o detalhe aparece quando o dia for coletado de novo.'

/** Detalhe de um card: de que colunas da FriPonto sai cada número e que dias contam. */
function ModalDetalhe({
  detalhe,
  dias,
  colunas,
  limites,
  intervalo,
  onFechar,
}: {
  detalhe: Detalhe
  dias: DiaAnalisado[]
  colunas: ColunasPorCampo
  limites: DiasDetalhe['limites']
  intervalo: string
  onFechar: () => void
}) {
  const extra = composicao(dias, colunas.extra, 'extra')
  const negativa = composicao(dias, colunas.negativa, 'negativa')
  const semDetalhe = {
    extras: extra.semDetalhe !== 0,
    negativas: negativa.semDetalhe !== 0,
    saldo: extra.semDetalhe !== 0 || negativa.semDetalhe !== 0,
    limite: false,
    batidas: false,
  }[detalhe]
  const recentes = [...dias].sort((a, b) => b.dia.localeCompare(a.dia))
  const diaCurto = (d: Dia) => `${diaDaSemana(d.dia)} ${formatarData(d.dia, { ano: false })}`

  const titulos: Record<Detalhe, string> = {
    extras: 'Como as extras são somadas',
    negativas: 'Como as negativas são somadas',
    saldo: 'Como o saldo do intervalo é calculado',
    limite: 'Dias acima do limite diário',
    batidas: 'Dias com batida',
  }

  let conteudo: ReactNode
  if (detalhe === 'extras' || detalhe === 'negativas') {
    const campo: Campo = detalhe === 'extras' ? 'extra' : 'negativa'
    conteudo = (
      <>
        <p className="pc-modal-texto">
          {detalhe === 'extras' ? 'As extras' : 'As negativas'} de {intervalo} são a soma destas colunas da FriPonto, dia a dia:
        </p>
        <TabelaComposicao dias={dias} colunas={colunas[campo]} campo={campo} rotulo={detalhe === 'extras' ? 'Extras' : 'Negativas'} />
        <ColunasFora dias={dias} colunas={colunas.fora} />
      </>
    )
  } else if (detalhe === 'saldo') {
    conteudo = (
      <>
        <p className="pc-modal-texto">O saldo de {intervalo} é o total das extras menos o total das negativas.</p>
        <TabelaComposicao dias={dias} colunas={colunas.extra} campo="extra" rotulo="Extras" />
        <TabelaComposicao dias={dias} colunas={colunas.negativa} campo="negativa" rotulo="Negativas" />
        <p className="pc-saldo-conta">
          <Horas minutos={extra.total} /> − <Horas minutos={negativa.total} /> ={' '}
          <Horas minutos={extra.total - negativa.total} sinal destacar />
        </p>
      </>
    )
  } else if (detalhe === 'limite') {
    const acima = recentes.filter((d) => d.extra_acima || d.negativa_acima)
    conteudo =
      !limites.extra_dia && !limites.negativa_dia ? (
        <p className="pc-modal-texto">A empresa não tem limite diário configurado.</p>
      ) : (
        <>
          <p className="pc-modal-texto">
            Dia que passou de{' '}
            {[
              limites.extra_dia ? `${formatarMinutos(limites.extra_dia)} de extras` : null,
              limites.negativa_dia ? `${formatarMinutos(limites.negativa_dia)} de negativas` : null,
            ]
              .filter(Boolean)
              .join(' ou de ')}
            .
          </p>
          {acima.length === 0 ? (
            <p className="dash-vazio">Nenhum dia acima do limite em {intervalo}.</p>
          ) : (
            <ul className="pc-modal-lista">
              {acima.map((d) => (
                <li key={d.dia}>
                  <span>{diaCurto(d)}</span>
                  {d.extra_acima && (
                    <span className="limite-dia-indicador mais">
                      ▲ <Horas minutos={d.extra_min} /> de extras
                    </span>
                  )}
                  {d.negativa_acima && (
                    <span className="limite-dia-indicador menos">
                      ▼ <Horas minutos={d.negativa_min} /> de negativas
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )
  } else {
    const conferir = recentes.filter((d) => d.conferir)
    const semBatida = recentes.filter((d) => !d.marcacoes.some(ehHorario))
    conteudo = (
      <>
        <p className="pc-modal-texto">
          {dias.length - semBatida.length} de {dias.length} dias de {intervalo} têm batida.
        </p>
        {conferir.length > 0 && (
          <>
            <p className="pc-fora-titulo">Para conferir</p>
            <ul className="pc-modal-lista">
              {conferir.map((d) => (
                <li key={d.dia}>
                  <span>{diaCurto(d)}</span>
                  <span className="texto-suave">{d.conferir}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {semBatida.length > 0 && (
          <>
            <p className="pc-fora-titulo">Sem batida</p>
            <ul className="pc-modal-lista">
              {semBatida.map((d) => (
                <li key={d.dia}>
                  <span>{diaCurto(d)}</span>
                  <span className="texto-suave">{d.marcacoes.join(' · ') || 'sem marcação'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    )
  }

  return (
    <Modal titulo={titulos[detalhe]} onFechar={onFechar}>
      {conteudo}
      {semDetalhe && <p className="pc-nota">{NOTA_SEM_DETALHE}</p>}
    </Modal>
  )
}

type DiaAnalisado = Dia & ReturnType<typeof analisarDia>

/** Horários alternam entrada/saída; textos da FriPonto (FOLGA, FALTA…) aparecem uma vez, em destaque. */
function classificarMarcacoes(marcacoes: string[]) {
  let horarios = 0
  return marcacoesParaExibir(marcacoes).map((texto) => ({
    texto,
    classe: !ehHorario(texto) ? 'texto' : horarios++ % 2 === 0 ? 'entrada' : 'saida',
  }))
}

/** Barras por dia: extras para cima (azul), negativas para baixo (vermelho), na mesma escala. */
function GraficoDiasPerfil({ dias }: { dias: DiaAnalisado[] }) {
  const maior = Math.max(60, ...dias.map((d) => Math.max(d.extra_min, d.negativa_min)))
  // com muitos dias, o rótulo aparece a cada N dias para não embolar
  const passo = dias.length > 45 ? 7 : dias.length > 20 ? 3 : 1
  return (
    <div className="pc-grafico" role="img" aria-label="Extras e negativas de cada dia do intervalo">
      {dias.map((d, i) => {
        const titulo = `${diaDaSemana(d.dia)} ${formatarData(d.dia, { ano: false })}: extras ${formatarMinutos(d.extra_min)}, negativas ${formatarMinutos(d.negativa_min)}`
        return (
          <div key={d.dia} className={d.conferir ? 'pc-grafico-dia conferir' : 'pc-grafico-dia'} title={titulo}>
            <div className="pc-grafico-metade cima">
              {d.extra_min > 0 && (
                <span
                  className={d.extra_acima ? 'pc-grafico-barra mais acima' : 'pc-grafico-barra mais'}
                  style={{ height: `${(d.extra_min / maior) * 100}%` }}
                />
              )}
            </div>
            <div className="pc-grafico-metade baixo">
              {d.negativa_min > 0 && (
                <span
                  className={d.negativa_acima ? 'pc-grafico-barra menos acima' : 'pc-grafico-barra menos'}
                  style={{ height: `${(d.negativa_min / maior) * 100}%` }}
                />
              )}
            </div>
            <span className="pc-grafico-rotulo" aria-hidden="true">
              {i % passo === 0 ? d.dia.slice(8) : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Valor de uma coluna da FriPonto na tabela: traço quando o dia não tem a coluna (ou não tem o detalhe). */
function CelulaColuna({ dia, coluna, campo }: { dia: Dia; coluna: string; campo: Campo }) {
  const minutos = minutosDaColuna(dia, coluna, campo)
  return (
    <td className="num pc-col-friponto">
      {minutos ? <Horas minutos={minutos} /> : <span className="texto-suave">—</span>}
    </td>
  )
}

/** Cabeçalho do total: com uma coluna só, o nome dela embaixo; com várias, "soma" (as colunas vêm antes). */
function CabecalhoTotal({ rotulo, colunas }: { rotulo: string; colunas: string[] }) {
  return (
    <th scope="col" className="num pc-col-total">
      {rotulo}
      {colunas.length > 0 && (
        <span className="pc-col-origem">{colunas.length === 1 ? colunas[0] : 'soma'}</span>
      )}
    </th>
  )
}

/** Dia a dia: batidas lado a lado para comparar os dias, tempo entre elas, extras, negativas e alertas. */
function TabelaDias({ dias, colunas, intervalo }: { dias: DiaAnalisado[]; colunas: ColunasPorCampo; intervalo: string }) {
  const [soComHoras, setSoComHoras] = useState(false)
  if (dias.length === 0) return <p className="dash-vazio">Ainda não há horas por dia de {intervalo}.</p>

  // mais recente primeiro: as últimas batidas ficam no topo
  const visiveis = [...dias]
    .filter((d) => !soComHoras || d.extra_min > 0 || d.negativa_min > 0 || d.conferir)
    .sort((a, b) => b.dia.localeCompare(a.dia))
  const maxBatidas = Math.max(2, ...visiveis.map((d) => d.marcacoes.filter(ehHorario).length))
  const extra = visiveis.reduce((soma, d) => soma + d.extra_min, 0)
  const negativa = visiveis.reduce((soma, d) => soma + d.negativa_min, 0)
  const abertas = colunasAbertas(colunas)
  const somaDaColuna = (coluna: string, campo: Campo) => visiveis.reduce((soma, d) => soma + minutosDaColuna(d, coluna, campo), 0)
  const explicacao = [
    abertas.extra.length ? `${abertas.extra.join(', ')} são colunas da FriPonto e “Extras” é a soma delas.` : null,
    abertas.negativa.length ? `${abertas.negativa.join(', ')} são colunas da FriPonto e “Negativas” é a soma delas.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="pc-dias">
      <div className="pc-dias-topo">
        <p className="dash-card-sub">
          {visiveis.length} {visiveis.length === 1 ? 'dia' : 'dias'} de {intervalo}, do mais recente para o mais antigo
        </p>
        <label className="pc-alternar">
          <input type="checkbox" checked={soComHoras} onChange={(event) => setSoComHoras(event.target.checked)} />
          Só dias com extras, negativas ou alerta
        </label>
      </div>

      <div className="table-wrap">
        <table className="pc-tabela-dias">
          <caption className="sr-only">Batidas, extras e negativas de cada dia de {intervalo}</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Batidas</th>
              <th scope="col" className="num">
                Entre batidas
              </th>
              {abertas.extra.map((coluna) => (
                <th key={coluna} scope="col" className="num pc-col-friponto" title="Coluna da FriPonto que soma nas extras">
                  {coluna}
                </th>
              ))}
              <CabecalhoTotal rotulo="Extras" colunas={colunas.extra} />
              {abertas.negativa.map((coluna) => (
                <th key={coluna} scope="col" className="num pc-col-friponto" title="Coluna da FriPonto que soma nas negativas">
                  {coluna}
                </th>
              ))}
              <CabecalhoTotal rotulo="Negativas" colunas={colunas.negativa} />
              <th scope="col">
                <span className="sr-only">Alertas</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((d) => {
              const classe = d.conferir ? 'conferir' : d.extra_acima || d.negativa_acima ? 'dia-acima' : undefined
              return (
                <tr key={d.dia} className={classe}>
                  <th scope="row" className="pc-dia">
                    <span className="pc-dia-semana">{diaDaSemana(d.dia)}</span>
                    <span className="pc-dia-data">{formatarData(d.dia, { ano: false })}</span>
                    {!d.tem_calculo && (
                      <span className="pc-sem-calculo" title="Só as batidas do log: as horas do dia entram na próxima coleta">
                        sem cálculo
                      </span>
                    )}
                  </th>
                  <td>
                    {d.marcacoes.length === 0 ? (
                      <span className="texto-suave">sem batidas</span>
                    ) : (
                      <span className="pc-batidas" style={{ gridTemplateColumns: `repeat(${maxBatidas}, auto)` }}>
                        {classificarMarcacoes(d.marcacoes).map(({ texto, classe }, i) => (
                          <span key={i} className={`pc-batida ${classe}`}>
                            {texto}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="num">{d.trabalhado !== null ? <Horas minutos={d.trabalhado} /> : <span className="texto-suave">—</span>}</td>
                  {abertas.extra.map((coluna) => (
                    <CelulaColuna key={coluna} dia={d} coluna={coluna} campo="extra" />
                  ))}
                  <td className={d.extra_acima ? 'num forte texto-aviso' : 'num'}>
                    {d.extra_min ? <Horas minutos={d.extra_min} /> : <span className="texto-suave">—</span>}
                  </td>
                  {abertas.negativa.map((coluna) => (
                    <CelulaColuna key={coluna} dia={d} coluna={coluna} campo="negativa" />
                  ))}
                  <td className={d.negativa_acima ? 'num forte texto-aviso' : 'num'}>
                    {d.negativa_min ? <Horas minutos={d.negativa_min} /> : <span className="texto-suave">—</span>}
                  </td>
                  <td>
                    <span className="pc-alertas">
                      {d.extra_acima && (
                        <span className="limite-dia-indicador mais" title="Extras acima do limite diário">
                          ▲ limite
                        </span>
                      )}
                      {d.negativa_acima && (
                        <span className="limite-dia-indicador menos" title="Negativas acima do limite diário">
                          ▼ limite
                        </span>
                      )}
                      {d.conferir && (
                        <span className="pc-conferir" title={d.conferir}>
                          Conferir ponto
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total
              </th>
              {abertas.extra.map((coluna) => (
                <td key={coluna} className="num pc-col-friponto">
                  <Horas minutos={somaDaColuna(coluna, 'extra')} />
                </td>
              ))}
              <td className="num">
                <Horas minutos={extra} />
              </td>
              {abertas.negativa.map((coluna) => (
                <td key={coluna} className="num pc-col-friponto">
                  <Horas minutos={somaDaColuna(coluna, 'negativa')} />
                </td>
              ))}
              <td className="num">
                <Horas minutos={negativa} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="pc-nota">
        {explicacao && `${explicacao} `}
        “Entre batidas” soma o tempo de cada entrada até a saída seguinte. “Conferir ponto” marca dia com número ímpar de
        batidas ou com mais de 16h entre elas (batida esquecida ou fora de ordem na FriPonto).
      </p>
    </div>
  )
}

/** Marcações brutas da FriPonto no intervalo: origem (relógio, aplicativo…) e situação (manual, desconsiderada…). */
function BatidasDoIntervalo({
  colaboradorId,
  intervalo,
  dias,
}: {
  colaboradorId: number
  intervalo: Intervalo
  dias: DiaAnalisado[]
}) {
  const comBatidas = [...dias].filter((d) => d.batidas.length > 0).sort((a, b) => b.dia.localeCompare(a.dia))
  const total = comBatidas.reduce((soma, d) => soma + d.batidas.length, 0)
  if (total === 0) return <p className="dash-vazio">Nenhuma batida de {textoDoIntervalo(intervalo)}.</p>

  const linkLog = `/batidas?colaborador=${colaboradorId}&de=${intervalo.de}&ate=${intervalo.ate}`
  return (
    <div className="pc-batidas-lista">
      <p className="dash-card-sub">
        {total.toLocaleString('pt-BR')} {total === 1 ? 'batida' : 'batidas'} de {textoDoIntervalo(intervalo)} ·{' '}
        <Link to={linkLog} className="btn-link">
          Abrir no log de batidas →
        </Link>
      </p>
      <div className="table-wrap">
        <table className="batidas-tabela">
          <caption className="sr-only">Batidas de ponto de {textoDoIntervalo(intervalo)}</caption>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Origem</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {comBatidas.map((d) => (
              <Fragment key={d.dia}>
                <tr className="batidas-dia">
                  <th scope="colgroup" colSpan={3}>
                    {formatarDiaPorExtenso(d.dia)}
                    <span>{formatarData(d.dia)}</span>
                  </th>
                </tr>
                {[...d.batidas].reverse().map((batida, i) => {
                  const situacao = situacaoDa(batida)
                  const inclusao = textoInclusao({ ...batida, data: d.dia })
                  return (
                    <tr key={`${d.dia}-${batida.hora}-${i}`}>
                      <td className="batida-hora">{batida.hora}</td>
                      <td>{origemDa(batida)}</td>
                      <td>
                        <span className={`batida-situacao ${situacao.classe}`}>{situacao.rotulo}</span>
                        {inclusao && <span className="pc-inclusao">{inclusao}</span>}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
