import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { alertarErro } from '../lib/alertas'
import { api } from '../lib/api'
import { formatarQuando } from '../lib/formato'
import { IconeRelogio } from './Icones'
import { ouvirSincronizacaoPedida } from '../lib/sincronizacao'
import type { AtividadeIntegracao } from '../types/api'
import './indicador-sincronizacao.css'

/** Com algo sincronizando, consulta mais vezes para o indicador sumir logo que acabar. */
const INTERVALO_ATIVO_MS = 8_000
const INTERVALO_OCIOSO_MS = 30_000
const CHAVE_VISTOS = 'copiloto.alertas-vistos'

/** Erros da integração já avisados nesta sessão do navegador (não repetem a cada consulta). */
function lerVistos(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(CHAVE_VISTOS) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function salvarVistos(vistos: Set<string>) {
  try {
    window.sessionStorage.setItem(CHAVE_VISTOS, JSON.stringify([...vistos].slice(-50)))
  } catch {
    /* armazenamento indisponível: só não lembra entre recarregamentos */
  }
}

function descreverTarefas({ tarefas }: AtividadeIntegracao) {
  const partes: string[] = []
  if (tarefas.cadastros) partes.push('cadastros')
  if (tarefas.batidas) partes.push('batidas')
  if (tarefas.fechamentos) partes.push(`${tarefas.fechamentos} ${tarefas.fechamentos === 1 ? 'fechamento' : 'fechamentos'}`)
  if (tarefas.tempo_real) {
    partes.push(`${tarefas.tempo_real} ${tarefas.tempo_real === 1 ? 'colaborador' : 'colaboradores'} no tempo real`)
  }
  return partes.join(' · ')
}

/* Canto inferior direito: um aviãozinho voando enquanto algo é puxado da FriPonto
   (pedidos e fila de extração), com a barra de quanto do lote já foi; com a extração parada
   esperando a cota, um relógio e a hora da próxima coleta. Também transforma falhas recentes da integração em
   alertas de erro (RH e equipe). Fica no AppLayout, em todas as telas logadas. */
export function IndicadorSincronizacao() {
  const { query } = useEmpresaAdmin()
  const [atividade, setAtividade] = useState<AtividadeIntegracao | null>(null)
  const vistos = useRef<Set<string>>(lerVistos())
  const empresaParam = query.empresa_id

  const consultar = useCallback(async () => {
    try {
      const dados = await api<AtividadeIntegracao>('/integracao/atividade', {
        query: { empresa_id: empresaParam },
        silencioso: true,
      })
      setAtividade(dados)
      let novos = false
      for (const erro of dados.erros) {
        if (vistos.current.has(erro.chave)) continue
        vistos.current.add(erro.chave)
        novos = true
        alertarErro({ titulo: `${erro.origem} · ${erro.empresa}`, mensagem: erro.mensagem, chave: erro.chave })
      }
      if (novos) salvarVistos(vistos.current)
    } catch {
      // consulta de fundo: falhou, tenta de novo na próxima
    }
  }, [empresaParam])

  // o intervalo depende de haver algo sincronizando, lido na hora de agendar a próxima consulta
  const sincronizando = useRef(false)
  useEffect(() => {
    sincronizando.current = Boolean(atividade?.sincronizando)
  })

  // consulta ao entrar (e ao trocar de empresa), depois de tempos em tempos; pausa com a aba escondida
  useEffect(() => {
    let timer: number | undefined
    let ativo = true
    const agendar = (atraso: number) => {
      window.clearTimeout(timer)
      if (document.visibilityState !== 'visible') return
      timer = window.setTimeout(async () => {
        await consultar()
        if (ativo) agendar(sincronizando.current ? INTERVALO_ATIVO_MS : INTERVALO_OCIOSO_MS)
      }, atraso)
    }
    const agora = () => agendar(0)
    const pararOuRetomar = () => (document.visibilityState === 'visible' ? agora() : window.clearTimeout(timer))

    agora()
    document.addEventListener('visibilitychange', pararOuRetomar)
    const pararDeOuvir = ouvirSincronizacaoPedida(agora)
    return () => {
      ativo = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', pararOuRetomar)
      pararDeOuvir()
    }
  }, [consultar])

  if (!atividade) return null
  // parado esperando a cota da FriPonto: mostra quando volta (sem nada mais andando)
  const aguardando = !atividade.sincronizando && atividade.retoma_em
  if (!atividade.sincronizando && !aguardando) return null

  const { progresso } = atividade
  const pct = progresso && progresso.total > 0 ? Math.min(100, Math.round((progresso.feitos / progresso.total) * 100)) : null
  const offline = !atividade.worker_online
  const detalhe = descreverTarefas(atividade)
  const textoProgresso = progresso && pct !== null ? ` (${progresso.feitos} de ${progresso.total} colaboradores, ${pct}%)` : ''

  let texto: string
  let titulo: string
  if (aguardando) {
    texto = `Aguardando próxima coleta ${formatarQuando(atividade.retoma_em as string)}`
    titulo = `A cota de cálculos da FriPonto (100 por hora) acabou; a coleta continua sozinha ${formatarQuando(
      atividade.retoma_em as string,
    )}${textoProgresso}`
  } else if (offline) {
    texto = 'Na fila · serviço offline'
    titulo = `Na fila da FriPonto (${detalhe}). O serviço de extração está offline: começa quando ele voltar.`
  } else {
    texto = 'Sincronizando com a FriPonto'
    titulo = `Sincronizando com a FriPonto: ${detalhe}${textoProgresso}`
  }

  const classe = ['indicador-sinc', aguardando ? 'aguardando' : offline ? 'offline' : ''].filter(Boolean).join(' ')

  return (
    <Link to="/configuracao/integracao" className={classe} title={titulo} aria-label={`${titulo}. Abrir Integração FriPonto.`}>
      <span className="indicador-sinc-aviao" aria-hidden="true">
        {aguardando ? (
          <IconeRelogio tamanho={17} />
        ) : (
          <>
            <span className="indicador-sinc-rastro" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
              <path d="M21 3 3 10.4l7.2 2.4L12.6 20 21 3Z" />
              <path d="m10.2 12.8 4.6-4.6" />
            </svg>
          </>
        )}
      </span>
      <span className="indicador-sinc-corpo">
        <span className="indicador-sinc-texto" role="status">
          {texto}
          {pct !== null && !offline && <span className="indicador-sinc-pct"> · {pct}%</span>}
        </span>
        {!offline && (
          // com o lote em extração a barra mostra quanto já foi; sem número, só indica movimento
          <span className={pct === null ? 'indicador-sinc-barra indeterminada' : 'indicador-sinc-barra'} aria-hidden="true">
            <span style={pct === null ? undefined : { width: `${Math.max(pct, 3)}%` }} />
          </span>
        )}
      </span>
    </Link>
  )
}
