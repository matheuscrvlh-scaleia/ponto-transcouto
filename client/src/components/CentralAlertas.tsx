import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { alertarErro, ouvirAlertas, tituloDoErroApi, type Alerta } from '../lib/alertas'
import './central-alertas.css'

/** Some sozinho depois disso (o tempo para enquanto o mouse ou o foco está no alerta). */
const DURACAO_MS = 8000
const MAXIMO_VISIVEIS = 4

/* Alertas de erro no canto inferior esquerdo. Fica uma vez na raiz do app e também
   pega promessas rejeitadas que ninguém tratou (um ApiError esquecido vira alerta). */
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
        if (erro.status === 401) return
        alertarErro({ titulo: tituloDoErroApi(erro.status), mensagem: erro.message })
      } else if (erro instanceof Error) {
        alertarErro({ mensagem: 'Ocorreu um erro inesperado. Se continuar, recarregue a página.', chave: erro.message })
      }
    }
    window.addEventListener('unhandledrejection', naoTratado)
    return () => window.removeEventListener('unhandledrejection', naoTratado)
  }, [])

  const fechar = useCallback((id: number) => setAlertas((atuais) => atuais.filter((alerta) => alerta.id !== id)), [])

  return (
    <section className="central-alertas" aria-label="Alertas de erro">
      <ol aria-live="assertive" aria-relevant="additions">
        {alertas.map((alerta) => (
          <ItemAlerta key={alerta.id} alerta={alerta} onFechar={fechar} />
        ))}
      </ol>
    </section>
  )
}

function ItemAlerta({ alerta, onFechar }: { alerta: Alerta; onFechar: (id: number) => void }) {
  const [pausado, setPausado] = useState(false)
  const restante = useRef(DURACAO_MS)
  const inicio = useRef(0)

  useEffect(() => {
    if (pausado) return
    inicio.current = Date.now()
    const timer = window.setTimeout(() => onFechar(alerta.id), restante.current)
    return () => {
      window.clearTimeout(timer)
      restante.current -= Date.now() - inicio.current
    }
  }, [pausado, alerta.id, onFechar])

  const pausar = () => setPausado(true)
  const continuar = () => setPausado(false)

  return (
    <li
      className={pausado ? 'alerta-erro pausado' : 'alerta-erro'}
      role="alert"
      onMouseEnter={pausar}
      onMouseLeave={continuar}
      onFocus={pausar}
      onBlur={continuar}
      style={{ ['--alerta-duracao' as string]: `${DURACAO_MS}ms` }}
    >
      <span className="alerta-erro-icone" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.4v.1" />
        </svg>
      </span>
      <div className="alerta-erro-texto">
        <p className="alerta-erro-titulo">{alerta.titulo}</p>
        <p className="alerta-erro-mensagem">{alerta.mensagem}</p>
      </div>
      <button type="button" className="alerta-erro-fechar" onClick={() => onFechar(alerta.id)} aria-label="Fechar alerta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <span className="alerta-erro-tempo" aria-hidden="true" />
    </li>
  )
}
