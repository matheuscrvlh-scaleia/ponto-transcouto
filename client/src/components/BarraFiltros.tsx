import type { ReactNode } from 'react'
import { IconeBusca } from './Icones'
import { SeletorLista, type OpcaoLista } from './SeletorLista'

/* Peças da barra de filtros de Batidas e Colaboradores (o período fica em FiltroPeriodo):
   busca em pílula, seleção com o rótulo dentro da pílula e grupo segmentado. */

export function BarraFiltros({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`barra-filtros ${className}`.trim()}>{children}</div>
}

export function LinhaFiltros({ children }: { children: ReactNode }) {
  return <div className="barra-filtros-linha">{children}</div>
}

interface BuscaProps {
  id: string
  /** Texto para leitor de tela. */
  rotulo: string
  placeholder: string
  valor: string
  onMudar: (valor: string) => void
}

export function BuscaFiltro({ id, rotulo, placeholder, valor, onMudar }: BuscaProps) {
  return (
    <div className="busca-filtro">
      <IconeBusca tamanho={16} className="busca-filtro-icone" />
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <input id={id} type="search" placeholder={placeholder} value={valor} onChange={(event) => onMudar(event.target.value)} />
    </div>
  )
}

interface SelecaoProps<T extends string> {
  rotulo: string
  icone: ReactNode
  opcoes: OpcaoLista<T>[]
  valor: T
  onMudar: (valor: T) => void
  /** 'so-celular': só aparece em tela estreita (ex.: ordenar, que no computador fica no cabeçalho da tabela). */
  className?: string
}

/** Lista suspensa em pílula, com o rótulo antes do valor ("Unidade  Todas ▾"): a mesma lista da barra lateral, compacta. */
export function SelecaoFiltro<T extends string>({ rotulo, icone, opcoes, valor, onMudar, className = '' }: SelecaoProps<T>) {
  return (
    <SeletorLista
      rotulo={rotulo}
      opcoes={opcoes}
      selecionadoId={valor}
      onEscolher={onMudar}
      icone={icone}
      iconeGeral={icone}
      className={`seletor-filtro ${className}`.trim()}
    />
  )
}

interface SegmentadoProps<T extends string> {
  /** Texto para leitor de tela. */
  rotulo: string
  opcoes: readonly { valor: T; rotulo: string }[]
  valor: T
  onEscolher: (valor: T) => void
}

/** Opções lado a lado num trilho só; a escolhida fica destacada. */
export function Segmentado<T extends string>({ rotulo, opcoes, valor, onEscolher }: SegmentadoProps<T>) {
  return (
    <div className="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map((opcao) => (
        <button
          key={opcao.valor}
          type="button"
          className={opcao.valor === valor ? 'segmentado-opcao ativo' : 'segmentado-opcao'}
          aria-pressed={opcao.valor === valor}
          onClick={() => onEscolher(opcao.valor)}
        >
          {opcao.rotulo}
        </button>
      ))}
    </div>
  )
}
