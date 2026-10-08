import type { ReactNode } from 'react'
import { Horas } from './Horas'
import { IconeSetaDiagonal } from './Icones'
import type { Minutos } from '../types/api'

/* Peças do Dashboard: o card de número no topo e o item do "Resumo de horas". */

interface CartaoKpiProps {
  rotulo: string
  valor: ReactNode
  contexto: string
  icone: ReactNode
  acao: string
  onAcao: () => void
  destaque?: boolean
  classeValor?: string
}

export function CartaoKpi({ rotulo, valor, contexto, icone, acao, onAcao, destaque = false, classeValor = '' }: CartaoKpiProps) {
  return (
    <div className={destaque ? 'dash-kpi dash-kpi-destaque' : 'dash-kpi'}>
      <div className="dash-kpi-topo">
        <p className="dash-kpi-rotulo">{rotulo}</p>
        <button type="button" className="dash-kpi-acao" onClick={onAcao} aria-label={acao} title={acao}>
          <IconeSetaDiagonal tamanho={18} />
        </button>
      </div>
      <p className={`dash-kpi-valor ${classeValor}`}>{valor}</p>
      <p className="dash-kpi-contexto">
        <span className="dash-kpi-contexto-icone" aria-hidden="true">
          {icone}
        </span>
        {contexto}
      </p>
    </div>
  )
}

export function ItemResumo({
  icone,
  rotulo,
  detalhe,
  minutos,
  sinal = false,
  onAbrir,
}: {
  icone: ReactNode
  rotulo: string
  detalhe: string
  minutos: Minutos
  sinal?: boolean
  /** Com ação, o item vira botão (ex.: abrir os colaboradores que compõem o total). */
  onAbrir?: () => void
}) {
  const conteudo = (
    <>
      <span className="dash-resumo-icone" aria-hidden="true">
        {icone}
      </span>
      <span className="dash-resumo-texto">
        <span className="dash-resumo-rotulo">{rotulo}</span>
        <span className="dash-resumo-detalhe">{detalhe}</span>
      </span>
      <Horas minutos={minutos} sinal={sinal} destacar={sinal} className="dash-resumo-valor" />
    </>
  )
  return (
    <li>
      {onAbrir ? (
        <button type="button" className="dash-resumo-botao" onClick={onAbrir} title={`Ver colaboradores: ${rotulo}`}>
          {conteudo}
          <IconeSetaDiagonal tamanho={14} className="dash-resumo-seta" />
        </button>
      ) : (
        conteudo
      )}
    </li>
  )
}
