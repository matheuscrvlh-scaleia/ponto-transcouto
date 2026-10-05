import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../lib/api'
import { alertarErro, ouvirAlertas, tituloDoErroApi, type Alerta, type TipoAlerta } from '../lib/alertas'
import './central-alertas.css'

/** Some sozinho depois disso (o tempo para enquanto o mouse ou o foco está no alerta). */
const DURACAO_MS: Record<TipoAlerta, number> = { sucesso: 5000, info: 6000, aviso: 8000, erro: 8000 }
const MAXIMO_VISIVEIS = 4
/** Duração da animação de saída (igual à do CSS). */
const SAIDA_MS = 220

const ICONES: Record<TipoAlerta, ReactNode> = {
  sucesso: <path d="m7.5 12.5 3 3 6-6.5" />,
  erro: <path d="M12 7.5v5.5M12 16.4v.1" />,
  aviso: <path d="M12 9.5v4.5M12 16.9v.1" />,
  info: <path d="M12 11v5.5M12 7.6v.1" />,
}

/* Notificações no canto inferior direito (sucesso, erro, aviso, info). Fica uma vez na raiz
   do app e também pega promessas rejeitadas que ninguém tratou (um ApiError esquecido vira alerta). */
export function CentralAlertas() {
  const [alertas, setAlertas] = useState<Alerta[]>([])

  useEffect(
    () => ouvirAlertas((alerta) => setAlertas((atuais) => [...atuais, alerta].slice(-MAXIMO_VISIVEIS))),
    [],
  )

  useEffect(() => {
    function naoTratado(evento: PromiseRejectionEvent) {
      const erro = evento.reason
      if (erro instanceof DOMException && erro.name === 'AbortError') return
      if (erro instanceof ApiError) {
        // 401 já leva para o login
        if (erro.status === 401 || erro.alertado) return
        alertarErro({ titulo: tituloDoErroApi(erro.status), mensagem: erro.message })
      } else if (erro instanceof Error) {
        alertarErro({ mensagem: 'Ocorreu um erro inesperado. Se continuar, recarregue a página.', chave: erro.message })
      }
    }
    window.addEventListener('unhandledrejection', naoTratado)
    return () => window.removeEventListener('unhandledrejection', naoTratado)
  }, [])

  const remover = useCallback((id: number) => setAlertas((atuais) => atuais.filter((alerta) => alerta.id !== id)), [])

  return (
    <section className="central-alertas" aria-label="Notificações">
      <ol aria-live="polite" aria-relevant="additions">
        {alertas.map((alerta) => (
          <ItemAlerta key={alerta.id} alerta={alerta} onRemover={remover} />
        ))}
      </ol>
    </section>
  )
}

function ItemAlerta({ alerta, onRemover }: { alerta: Alerta; onRemover: (id: number) => void }) {
  const duracao = DURACAO_MS[alerta.tipo]
  const [pausado, setPausado] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const restante = useRef(duracao)
  const inicio = useRef(0)

  const fechar = useCallback(() => {
    setSaindo(true)
    window.setTimeout(() => onRemover(alerta.id), SAIDA_MS)
  }, [alerta.id, onRemover])

  useEffect(() => {
    if (pausado || saindo) return
    inicio.current = Date.now()
    const timer = window.setTimeout(fechar, restante.current)
    return () => {
      window.clearTimeout(timer)
      restante.current -= Date.now() - inicio.current
    }
  }, [pausado, saindo, fechar])

  const pausar = () => setPausado(true)
  const continuar = () => setPausado(false)
  const urgente = alerta.tipo === 'erro' || alerta.tipo === 'aviso'

  return (
    <li
      className={`alerta alerta-${alerta.tipo}${pausado ? ' pausado' : ''}${saindo ? ' saindo' : ''}`}
      role={urgente ? 'alert' : 'status'}
      onMouseEnter={pausar}
      onMouseLeave={continuar}
      onFocus={pausar}
      onBlur={continuar}
      style={{ ['--alerta-duracao' as string]: `${duracao}ms` }}
    >
      <span className="alerta-icone" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {alerta.tipo === 'aviso' ? <path d="M12 3.5 21.5 20h-19L12 3.5Z" /> : <circle cx="12" cy="12" r="9" />}
          {ICONES[alerta.tipo]}
        </svg>
      </span>
      <div className="alerta-texto">
        <p className="alerta-titulo">{alerta.titulo}</p>
        <p className="alerta-mensagem">{alerta.mensagem}</p>
      </div>
      <button type="button" className="alerta-fechar" onClick={fechar} aria-label="Fechar notificação">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <span className="alerta-tempo" aria-hidden="true" />
    </li>
  )
}
