import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CartaoKpi, ItemResumo } from '../components/CartoesPainel'
import { Horas } from '../components/Horas'
import { IconeAlerta, IconeCalendario, IconeMais, IconeMedia, IconeMenos, IconeRelogio } from '../components/Icones'
import { ModalColaboradores } from '../components/ModalColaboradores'
import { formatarMinutos, iniciais } from '../lib/formato'
import type { LinhaPainel as Linha } from '../lib/painel'
import type { HorasNoIntervalo, Minutos } from '../types/api'

/* Dashboard com intervalo de datas escolhido: tudo é só daquele intervalo (quem fez extras,
   quem ficou devendo, quem passou do limite diário, e quanto), sem o saldo acumulado do banco. */

type HorasColaborador = HorasNoIntervalo['colaboradores'][number]
type Pessoa = { linha: Linha; extra: Minutos; negativa: Minutos; diasExtra: number; diasNegativa: number }

/** Colaboradores por trás de um total do resumo, abertos num modal. */
type Grupo = { titulo: string; descricao: string; pessoas: Pessoa[]; valor: (p: Pessoa) => Minutos; sinal?: boolean }

interface Props {
  linhas: Linha[]
  porColaborador: Map<number, HorasColaborador>
  /** "01/10/2026 a 07/10/2026" */
  intervalo: string
  /** card de Unidades (consolidado) ou de Atualização dos dados: o mesmo do painel sem intervalo */
  cardUnidades: ReactNode
  incompleto: boolean
  abrirLista: (filtro: 'todos' | 'extra' | 'negativa' | 'limite', ordem?: string) => void
  linkColaborador: (linha: Linha) => string
  complemento: (linha: Linha) => string
  origem: { de: string }
}

export function PainelIntervalo({
  linhas,
  porColaborador,
  intervalo,
  cardUnidades,
  incompleto,
  abrirLista,
  linkColaborador,
  complemento,
  origem,
}: Props) {
  const pessoas = useMemo<Pessoa[]>(
    () =>
      linhas.map((linha) => {
        const h = porColaborador.get(linha.id)
        return {
          linha,
          extra: h?.extra_min ?? 0,
          negativa: h?.negativa_min ?? 0,
          diasExtra: h?.dias_extra_acima ?? 0,
          diasNegativa: h?.dias_negativa_acima ?? 0,
        }
      }),
    [linhas, porColaborador],
  )

  const porNome = (a: Pessoa, b: Pessoa) => a.linha.nome.localeCompare(b.linha.nome, 'pt-BR')
  const comExtras = pessoas.filter((p) => p.extra > 0).sort((a, b) => b.extra - a.extra || porNome(a, b))
  const comNegativas = pessoas.filter((p) => p.negativa > 0).sort((a, b) => b.negativa - a.negativa || porNome(a, b))
  const acimaDoDia = pessoas
    .filter((p) => p.diasExtra + p.diasNegativa > 0)
    .sort((a, b) => b.diasExtra + b.diasNegativa - (a.diasExtra + a.diasNegativa) || b.extra - a.extra || porNome(a, b))
  const totalExtras = comExtras.reduce((soma, p) => soma + p.extra, 0)
  const totalNegativas = comNegativas.reduce((soma, p) => soma + p.negativa, 0)
  const comHorasNoIntervalo = pessoas.filter((p) => p.extra > 0 || p.negativa > 0)
  const comHoras = comHorasNoIntervalo.length
  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.linha.id, p])), [pessoas])

  const pessoa = (p: Pessoa, valor: ReactNode, info: string, classeAvatar: string) => (
    <li key={p.linha.id}>
      <Link to={linkColaborador(p.linha)} state={origem} className="dash-pessoa">
        <span className={`avatar ${classeAvatar}`} aria-hidden="true">
          {iniciais(p.linha.nome)}
        </span>
        <span className="dash-pessoa-texto">
          <span className="dash-pessoa-nome">{p.linha.nome}</span>
          <span className="dash-pessoa-info">{[info, complemento(p.linha)].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="dash-pessoa-valor">{valor}</span>
      </Link>
    </li>
  )

  const diasAcima = (p: Pessoa) =>
    [
      p.diasExtra ? `+ extras em ${p.diasExtra} ${p.diasExtra === 1 ? 'dia' : 'dias'}` : null,
      p.diasNegativa ? `− negativas em ${p.diasNegativa} ${p.diasNegativa === 1 ? 'dia' : 'dias'}` : null,
    ]
      .filter(Boolean)
      .join(' e ')

  return (
    <>
      <div className="dash-kpis">
        <CartaoKpi
          destaque
          rotulo="Colaboradores"
          valor={linhas.length}
          contexto={`${comHoras} com extras ou negativas no intervalo`}
          icone={<IconeCalendario tamanho={14} />}
          acao="Ver todos os colaboradores no intervalo"
          onAcao={() => abrirLista('todos', 'extra_min.desc')}
        />
        <CartaoKpi
          rotulo="Fizeram extras"
          valor={comExtras.length}
          classeValor={comExtras.length ? 'texto-positivo' : ''}
          contexto={`${formatarMinutos(totalExtras)} de extras no total`}
          icone={<IconeMais tamanho={14} />}
          acao="Ver quem fez extras no intervalo, mais horas primeiro"
          onAcao={() => abrirLista('extra', 'extra_min.desc')}
        />
        <CartaoKpi
          rotulo="Ficaram devendo"
          valor={comNegativas.length}
          classeValor={comNegativas.length ? 'texto-negativo' : ''}
          contexto={`${formatarMinutos(totalNegativas)} de negativas no total`}
          icone={<IconeMenos tamanho={14} />}
          acao="Ver quem teve negativas no intervalo, mais horas primeiro"
          onAcao={() => abrirLista('negativa', 'negativa_min.desc')}
        />
        <CartaoKpi
          rotulo="Passaram do limite diário"
          valor={acimaDoDia.length}
          classeValor={acimaDoDia.length ? 'texto-aviso' : ''}
          contexto="Em pelo menos um dia do intervalo"
          icone={<IconeAlerta tamanho={14} />}
          acao="Ver quem passou do limite diário no intervalo"
          onAcao={() => abrirLista('limite', 'extra_min.desc')}
        />
      </div>

      <div className="dash-grade">
        <article className="dash-card dash-area-faixas" aria-labelledby="titulo-mais-extras">
          <div className="dash-card-topo">
            <div>
              <h2 id="titulo-mais-extras">Quem fez extras</h2>
              <p className="dash-card-sub">De {intervalo}, mais horas primeiro</p>
            </div>
            {comExtras.length > 0 && (
              <button type="button" className="dash-botao" onClick={() => abrirLista('extra', 'extra_min.desc')}>
                Ver todos ({comExtras.length})
              </button>
            )}
          </div>
          {comExtras.length === 0 ? (
            <p className="dash-vazio">Ninguém com horas extras neste intervalo.</p>
          ) : (
            <ul className="dash-pessoas dash-pessoas-barras dash-pessoas-rolagem">
              {comExtras.map((p) =>
                pessoa(
                  p,
                  <>
                    <Horas minutos={p.extra} className="forte" />
                    <span className="dash-barra" aria-hidden="true">
                      <span style={{ width: `${(p.extra / comExtras[0].extra) * 100}%` }} />
                    </span>
                  </>,
                  'Extras',
                  'avatar-positivo',
                ),
              )}
            </ul>
          )}
        </article>

        {cardUnidades}

        <article className="dash-card dash-area-resumo" aria-labelledby="titulo-resumo-intervalo">
          <h2 id="titulo-resumo-intervalo">Resumo do intervalo</h2>
          <p className="dash-card-sub">
            {incompleto ? `Soma dos ${linhas.length} colaboradores exibidos` : 'Soma de todos os colaboradores'}, de {intervalo}
          </p>
          <ul className="dash-resumo">
            <ItemResumo
              icone={<IconeMais />}
              rotulo="Extras"
              detalhe={`${comExtras.length} colaboradores`}
              minutos={totalExtras}
              onAbrir={() =>
                setGrupo({ titulo: 'Extras', descricao: `Quem fez extras de ${intervalo}`, pessoas: comExtras, valor: (p) => p.extra })
              }
            />
            <ItemResumo
              icone={<IconeMenos />}
              rotulo="Negativas"
              detalhe={`${comNegativas.length} colaboradores`}
              minutos={totalNegativas}
              onAbrir={() =>
                setGrupo({
                  titulo: 'Negativas',
                  descricao: `Quem teve negativas (faltas e atrasos) de ${intervalo}`,
                  pessoas: comNegativas,
                  valor: (p) => p.negativa,
                })
              }
            />
            <ItemResumo
              icone={<IconeRelogio />}
              rotulo="Extras − negativas"
              detalhe="só no intervalo"
              minutos={totalExtras - totalNegativas}
              sinal
              onAbrir={() =>
                setGrupo({
                  titulo: 'Extras − negativas',
                  descricao: `Extras menos negativas de cada colaborador, de ${intervalo}`,
                  pessoas: comHorasNoIntervalo,
                  valor: (p) => p.extra - p.negativa,
                  sinal: true,
                })
              }
            />
            {comExtras.length > 0 && (
              <ItemResumo
                icone={<IconeMedia />}
                rotulo="Extras por pessoa"
                detalhe="média de quem fez"
                minutos={Math.round(totalExtras / comExtras.length)}
                onAbrir={() =>
                  setGrupo({
                    titulo: 'Extras por pessoa',
                    descricao: `Média de ${formatarMinutos(Math.round(totalExtras / comExtras.length))} entre quem fez extras de ${intervalo}`,
                    pessoas: comExtras,
                    valor: (p) => p.extra,
                  })
                }
              />
            )}
          </ul>
        </article>

        <article className="dash-card dash-area-atencao" aria-labelledby="titulo-negativas">
          <div className="dash-card-topo">
            <div>
              <h2 id="titulo-negativas">Quem ficou devendo</h2>
              <p className="dash-card-sub">Negativas (faltas e atrasos) de {intervalo}</p>
            </div>
            {comNegativas.length > 0 && (
              <button type="button" className="dash-botao" onClick={() => abrirLista('negativa', 'negativa_min.desc')}>
                Ver todos ({comNegativas.length})
              </button>
            )}
          </div>
          {comNegativas.length === 0 ? (
            <p className="dash-vazio">Ninguém com negativas neste intervalo.</p>
          ) : (
            <ul className="dash-pessoas dash-pessoas-rolagem">
              {comNegativas.map((p) =>
                pessoa(p, <Horas minutos={-p.negativa} destacar className="forte" />, 'Negativas', 'avatar-negativo'),
              )}
            </ul>
          )}
        </article>

        <article className="dash-card dash-area-medidor" aria-labelledby="titulo-limite-dia">
          <div className="dash-card-topo">
            <div>
              <h2 id="titulo-limite-dia">Limite diário</h2>
              <p className="dash-card-sub">Quem passou do limite num mesmo dia</p>
            </div>
          </div>
          {acimaDoDia.length === 0 ? (
            <p className="dash-vazio">
              Ninguém passou do limite diário neste intervalo. O limite é definido em Configuração → Alertas e horas pagas.
            </p>
          ) : (
            <ul className="dash-pessoas dash-pessoas-rolagem">
              {acimaDoDia.map((p) =>
                pessoa(
                  p,
                  <span className="limite-dia-indicadores">
                    {p.diasExtra > 0 && (
                      <span className="limite-dia-indicador mais" title={`${p.diasExtra} ${p.diasExtra === 1 ? 'dia' : 'dias'} com extras acima do limite`}>
                        ▲ {p.diasExtra}
                      </span>
                    )}
                    {p.diasNegativa > 0 && (
                      <span className="limite-dia-indicador menos" title={`${p.diasNegativa} ${p.diasNegativa === 1 ? 'dia' : 'dias'} com negativas acima do limite`}>
                        ▼ {p.diasNegativa}
                      </span>
                    )}
                  </span>,
                  diasAcima(p),
                  // azul: só extras; vermelho: só negativas; amarelo: os dois
                  p.diasExtra && p.diasNegativa ? 'avatar-aviso' : p.diasExtra ? 'avatar-positivo' : 'avatar-negativo',
                ),
              )}
            </ul>
          )}
        </article>
      </div>

      {grupo && (
        <ModalColaboradores
          titulo={grupo.titulo}
          descricao={grupo.descricao}
          linhas={grupo.pessoas.map((p) => p.linha)}
          valor={(linha) => {
            const p = porId.get(linha.id)
            return p ? grupo.valor(p) : 0
          }}
          sinal={grupo.sinal}
          link={linkColaborador}
          complemento={complemento}
          origem={origem}
          onFechar={() => setGrupo(null)}
        />
      )}
    </>
  )
}
