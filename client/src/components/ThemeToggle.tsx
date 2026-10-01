import { useTheme } from '../context/ThemeContext'
import { IconeLua, IconeSol } from './Icones'

/* Botão único que alterna Claro/Escuro (chave com indicador à direita). */
export function ThemeToggle() {
  const { tema, alternarTema } = useTheme()
  const escuro = tema === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={escuro}
      aria-label="Modo escuro"
      className={escuro ? 'tema-botao escuro' : 'tema-botao'}
      onClick={alternarTema}
    >
      {escuro ? <IconeLua tamanho={17} /> : <IconeSol tamanho={17} />}
      <span className="tema-botao-texto">{escuro ? 'Escuro' : 'Claro'}</span>
      <span className="tema-botao-indicador" aria-hidden="true" />
    </button>
  )
}
