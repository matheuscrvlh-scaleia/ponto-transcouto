import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { IconeChave, IconePontos, IconeSair } from './Icones'

/* Botão de três pontos no canto do cabeçalho do perfil: trocar senha e sair. */
export function MenuPerfil({ className = '' }: { className?: string }) {
  const { sair } = useAuth()
  const id = useId()
  const raizRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!aberto) return
    function fecharFora(event: PointerEvent) {
      if (!raizRef.current?.contains(event.target as Node)) setAberto(false)
    }
    function teclar(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAberto(false)
        botaoRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', fecharFora)
    document.addEventListener('keydown', teclar)
    // foco no primeiro item ao abrir
    raizRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', fecharFora)
      document.removeEventListener('keydown', teclar)
    }
  }, [aberto])

  return (
    <div ref={raizRef} className={`menu-perfil ${className}`}>
      <button
        ref={botaoRef}
        type="button"
        className={aberto ? 'menu-perfil-botao aberto' : 'menu-perfil-botao'}
        aria-label="Opções da conta"
        title="Opções da conta"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={`${id}-menu`}
        onClick={() => setAberto((valor) => !valor)}
      >
        <IconePontos tamanho={20} />
      </button>

      {aberto && (
        <div id={`${id}-menu`} className="menu-perfil-lista" role="menu" aria-label="Opções da conta">
          <Link to="/trocar-senha" role="menuitem" className="menu-perfil-item">
            <IconeChave tamanho={17} />
            Trocar senha
          </Link>
          <span className="menu-perfil-divisor" role="separator" />
          <button type="button" role="menuitem" className="menu-perfil-item perigo" onClick={sair}>
            <IconeSair tamanho={17} />
            Sair da conta
          </button>
        </div>
      )}
    </div>
  )
}
