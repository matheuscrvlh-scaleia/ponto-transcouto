import type { MouseEvent } from 'react'
import { datasDoPeriodo, hojeISO, PERIODOS_RAPIDOS, periodoRapidoDe, type PeriodoRapido } from '../lib/formato'
import type { Intervalo } from '../lib/intervalo'
import type { DataISO } from '../types/api'
import { Segmentado } from './BarraFiltros'
import { IconeCalendario } from './Icones'

interface Props {
  escolhido: Intervalo | null
  /** Datas como estão na URL (uma pode faltar). */
  de: DataISO | undefined
  ate: DataISO | undefined
  onMudar: (novo: Partial<Intervalo>) => void
  /** Rótulo da opção sem datas: "Período atual" (Dashboard, Colaboradores) ou "Qualquer data" (Batidas). */
  rotuloVazio?: string
}

/** Clicar em qualquer ponto do campo abre o calendário (o ícone nativo fica escondido). */
function abrirCalendario(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker?.()
  } catch {
    // navegador sem showPicker: o campo continua aceitando a data digitada
  }
}

/**
 * Barra de período: atalhos (sem datas, hoje, ontem, esta semana, este mês) e o intervalo De → Até.
 * Datas escolhidas à mão deixam nenhum atalho marcado e o intervalo em destaque.
 */
export function FiltroPeriodo({ escolhido, de, ate, onMudar, rotuloVazio = 'Período atual' }: Props) {
  const hoje = hojeISO()
  const rapido = escolhido ? periodoRapidoDe(escolhido.de, escolhido.ate, hoje) : null
  // 'livre': datas escolhidas à mão, nenhum atalho marcado
  type Atalho = PeriodoRapido | 'vazio' | 'livre'
  const opcoes: { valor: Atalho; rotulo: string }[] = [{ valor: 'vazio', rotulo: rotuloVazio }, ...PERIODOS_RAPIDOS]
  const marcado: Atalho = escolhido ? (rapido ?? 'livre') : 'vazio'

  return (
    <div className="filtro-periodo" role="group" aria-label="Período">
      <Segmentado
        rotulo="Atalhos de período"
        opcoes={opcoes}
        valor={marcado}
        onEscolher={(valor) => {
          if (valor === 'vazio') onMudar({})
          else if (valor !== 'livre') onMudar(datasDoPeriodo(valor, hoje))
        }}
      />

      <div className={escolhido && !rapido ? 'filtro-periodo-datas ativo' : 'filtro-periodo-datas'}>
        <IconeCalendario tamanho={16} className="filtro-periodo-icone" />
        <label className="filtro-periodo-data">
          <span className="sr-only">De</span>
          <input
            type="date"
            className={escolhido ? undefined : 'vazio'}
            value={escolhido?.de ?? ''}
            max={escolhido?.ate ?? hoje}
            onClick={abrirCalendario}
            onChange={(event) => onMudar({ de: event.target.value || undefined, ate })}
          />
        </label>
        <span className="filtro-periodo-seta" aria-hidden="true">
          →
        </span>
        <label className="filtro-periodo-data">
          <span className="sr-only">Até</span>
          <input
            type="date"
            className={escolhido ? undefined : 'vazio'}
            value={escolhido?.ate ?? ''}
            min={escolhido?.de}
            max={hoje}
            onClick={abrirCalendario}
            onChange={(event) => onMudar({ de, ate: event.target.value || undefined })}
          />
        </label>
        {escolhido && (
          <button type="button" className="filtro-periodo-limpar" onClick={() => onMudar({})} title="Limpar datas">
            <span aria-hidden="true">×</span>
            <span className="sr-only">Limpar datas</span>
          </button>
        )}
      </div>
    </div>
  )
}
