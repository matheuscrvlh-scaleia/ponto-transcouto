import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Horas } from '../components/Horas'
import { iniciais } from '../lib/formato'
import type { LinhaPainel as Linha } from '../lib/painel'
import type { HorasNoIntervalo } from '../types/api'

/* Listas do Dashboard sobre as horas de cada dia: quem fez extras, quem ficou devendo e quem passou do
   limite diário. Com intervalo de datas, as linhas já chegam com as extras e negativas do intervalo;
   sem ele, com as do período (e os dias acima do limite são os do período atual). */

type HorasColaborador = HorasNoIntervalo['colaboradores'][number]

interface Props {
  linhas: Linha[]
  /** Dias acima do limite diário de cada colaborador. */
  porColaborador: Map<number, HorasColaborador>
  /** "de 01/10/2026 a 07/10/2026" ou "do período" */
  quando: string
  abrirLista: (filtro: 'extra' | 'negativa' | 'limite', ordem?: string) => void
  linkColaborador: (linha: Linha) => string
  complemento: (linha: Linha) => string
  origem: { de: string }
}

export function ListasDoIntervalo({ linhas, porColaborador, quando, abrirLista, linkColaborador, complemento, origem }: Props) {
  const porNome = (a: Linha, b: Linha) => a.nome.localeCompare(b.nome, 'pt-BR')
  const diasExtra = (linha: Linha) => porColaborador.get(linha.id)?.dias_extra_acima ?? 0
  const diasNegativa = (linha: Linha) => porColaborador.get(linha.id)?.dias_negativa_acima ?? 0
  const comExtras = linhas.filter((l) => l.extra_min > 0).sort((a, b) => b.extra_min - a.extra_min || porNome(a, b))
  const comNegativas = linhas.filter((l) => l.negativa_min > 0).sort((a, b) => b.negativa_min - a.negativa_min || porNome(a, b))
  const acimaDoDia = linhas
    .filter((l) => diasExtra(l) + diasNegativa(l) > 0)
    .sort(
      (a, b) => diasExtra(b) + diasNegativa(b) - (diasExtra(a) + diasNegativa(a)) || b.extra_min - a.extra_min || porNome(a, b),
    )

  const pessoa = (linha: Linha, valor: ReactNode, info: string, classeAvatar: string) => (
    <li key={linha.id}>
      <Link to={linkColaborador(linha)} state={origem} className="dash-pessoa">
        <span className={`avatar ${classeAvatar}`} aria-hidden="true">
          {iniciais(linha.nome)}
        </span>
        <span className="dash-pessoa-texto">
          <span className="dash-pessoa-nome">{linha.nome}</span>
          <span className="dash-pessoa-info">{[info, complemento(linha)].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="dash-pessoa-valor">{valor}</span>
      </Link>
    </li>
  )

  const diasAcima = (linha: Linha) =>
    [
      diasExtra(linha) ? `+ extras em ${diasExtra(linha)} ${diasExtra(linha) === 1 ? 'dia' : 'dias'}` : null,
      diasNegativa(linha) ? `− negativas em ${diasNegativa(linha)} ${diasNegativa(linha) === 1 ? 'dia' : 'dias'}` : null,
    ]
      .filter(Boolean)
      .join(' e ')

  return (
    <>
      <article className="dash-card dash-area-extras" aria-labelledby="titulo-mais-extras">
        <div className="dash-card-topo">
          <div>
            <h2 id="titulo-mais-extras">Quem fez extras</h2>
            <p className="dash-card-sub">Extras {quando}, mais horas primeiro</p>
          </div>
          {comExtras.length > 0 && (
            <button type="button" className="dash-botao" onClick={() => abrirLista('extra', 'extra_min.desc')}>
              Ver todos ({comExtras.length})
            </button>
          )}
        </div>
        {comExtras.length === 0 ? (
          <p className="dash-vazio">Ninguém com horas extras {quando}.</p>
        ) : (
          <ul className="dash-pessoas dash-pessoas-barras dash-pessoas-rolagem">
            {comExtras.map((linha) =>
              pessoa(
                linha,
                <>
                  <Horas minutos={linha.extra_min} className="forte" />
                  <span className="dash-barra" aria-hidden="true">
                    <span style={{ width: `${(linha.extra_min / comExtras[0].extra_min) * 100}%` }} />
                  </span>
                </>,
                'Extras',
                'avatar-positivo',
              ),
            )}
          </ul>
        )}
      </article>

      <article className="dash-card dash-area-negativas" aria-labelledby="titulo-negativas">
        <div className="dash-card-topo">
          <div>
            <h2 id="titulo-negativas">Quem ficou devendo</h2>
            <p className="dash-card-sub">Negativas (faltas e atrasos) {quando}</p>
          </div>
          {comNegativas.length > 0 && (
            <button type="button" className="dash-botao" onClick={() => abrirLista('negativa', 'negativa_min.desc')}>
              Ver todos ({comNegativas.length})
            </button>
          )}
        </div>
        {comNegativas.length === 0 ? (
          <p className="dash-vazio">Ninguém com negativas {quando}.</p>
        ) : (
          <ul className="dash-pessoas dash-pessoas-rolagem">
            {comNegativas.map((linha) =>
              pessoa(linha, <Horas minutos={-linha.negativa_min} destacar className="forte" />, 'Negativas', 'avatar-negativo'),
            )}
          </ul>
        )}
      </article>

      <article className="dash-card dash-area-limite" aria-labelledby="titulo-limite-dia">
        <div className="dash-card-topo">
          <div>
            <h2 id="titulo-limite-dia">Limite diário</h2>
            <p className="dash-card-sub">Quem passou do limite num mesmo dia</p>
          </div>
          {acimaDoDia.length > 0 && (
            <button type="button" className="dash-botao" onClick={() => abrirLista('limite', 'extra_min.desc')}>
              Ver todos ({acimaDoDia.length})
            </button>
          )}
        </div>
        {acimaDoDia.length === 0 ? (
          <p className="dash-vazio">
            Ninguém passou do limite diário {quando}. O limite é definido em Configuração → Alertas e horas pagas.
          </p>
        ) : (
          <ul className="dash-pessoas dash-pessoas-rolagem">
            {acimaDoDia.map((linha) =>
              pessoa(
                linha,
                <span className="limite-dia-indicadores">
                  {diasExtra(linha) > 0 && (
                    <span
                      className="limite-dia-indicador mais"
                      title={`${diasExtra(linha)} ${diasExtra(linha) === 1 ? 'dia' : 'dias'} com extras acima do limite`}
                    >
                      ▲ {diasExtra(linha)}
                    </span>
                  )}
                  {diasNegativa(linha) > 0 && (
                    <span
                      className="limite-dia-indicador menos"
                      title={`${diasNegativa(linha)} ${diasNegativa(linha) === 1 ? 'dia' : 'dias'} com negativas acima do limite`}
                    >
                      ▼ {diasNegativa(linha)}
                    </span>
                  )}
                </span>,
                diasAcima(linha),
                // azul: só extras; vermelho: só negativas; amarelo: os dois
                diasExtra(linha) && diasNegativa(linha) ? 'avatar-aviso' : diasExtra(linha) ? 'avatar-positivo' : 'avatar-negativo',
              ),
            )}
          </ul>
        )}
      </article>
    </>
  )
}
