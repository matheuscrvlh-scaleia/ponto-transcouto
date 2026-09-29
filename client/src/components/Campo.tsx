import { useId, type ReactNode } from 'react'

export interface PropsControle {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

interface Props {
  rotulo: ReactNode
  erro?: string
  ajuda?: ReactNode
  className?: string
  children: (controle: PropsControle) => ReactNode
}

/** Rótulo + controle + ajuda/erro, já ligados por id e aria-describedby. */
export function Campo({ rotulo, erro, ajuda, className = '', children }: Props) {
  const id = useId()
  const descricoes = [ajuda && `${id}-ajuda`, erro && `${id}-erro`].filter(Boolean).join(' ')

  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{rotulo}</label>
      {children({ id, 'aria-invalid': erro ? true : undefined, 'aria-describedby': descricoes || undefined })}
      {ajuda && (
        <small id={`${id}-ajuda`} className="field-ajuda">
          {ajuda}
        </small>
      )}
      {erro && (
        <small id={`${id}-erro`} className="campo-erro" role="alert">
          {erro}
        </small>
      )}
    </div>
  )
}
