import { useState } from 'react'

interface Props {
  id: string
  rotulo: string
  valor: string
  onChange: (valor: string) => void
  autoComplete: 'current-password' | 'new-password'
  descricao?: string
}

export function CampoSenha({ id, rotulo, valor, onChange, autoComplete, descricao }: Props) {
  const [visivel, setVisivel] = useState(false)

  return (
    <div className="field">
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-senha">
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          value={valor}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-describedby={descricao ? `${id}-descricao` : undefined}
          required
        />
        <button
          type="button"
          className="campo-senha-toggle"
          onClick={() => setVisivel((v) => !v)}
          aria-pressed={visivel}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {descricao && (
        <small id={`${id}-descricao`} className="field-ajuda">
          {descricao}
        </small>
      )}
    </div>
  )
}
