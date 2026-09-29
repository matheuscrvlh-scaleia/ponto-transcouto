import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  titulo: string
  onFechar: () => void
  children: ReactNode
  largo?: boolean
}

export function Modal({ titulo, onFechar, children, largo = false }: ModalProps) {
  const tituloId = useId()
  const conteudo = useRef<HTMLDivElement>(null)
  const fecharRef = useRef(onFechar)

  useEffect(() => {
    fecharRef.current = onFechar
  })

  useEffect(() => {
    const focoAnterior = document.activeElement as HTMLElement | null
    const primeiroCampo = conteudo.current?.querySelector<HTMLElement>('[data-autofoco]')
    ;(primeiroCampo ?? conteudo.current)?.focus()

    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') fecharRef.current()
      if (event.key !== 'Tab' || !conteudo.current) return
      const focaveis = [
        ...conteudo.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (!focaveis.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (event.shiftKey && (document.activeElement === primeiro || document.activeElement === conteudo.current)) {
        event.preventDefault()
        ultimo.focus()
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      focoAnterior?.focus()
    }
  }, [])

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        ref={conteudo}
        className={largo ? 'modal-content modal-largo' : 'modal-content'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={tituloId}>{titulo}</h2>
          <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
