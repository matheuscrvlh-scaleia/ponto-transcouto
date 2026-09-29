import { useId } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { salvarUltimaUnidade } from '../lib/preferencias'

export function SeletorUnidade({ className = '' }: { className?: string }) {
  const { unidades } = useAuth()
  const navigate = useNavigate()
  const match = useMatch('/unidades/:unidadeId/*')
  const id = useId()

  if (unidades.length < 2) return null

  const atual = match ? Number(match.params.unidadeId) : ''
  const ordenadas = [...unidades].sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, 'pt-BR'))

  return (
    <div className={`seletor-unidade ${className}`}>
      <label htmlFor={id}>Unidade</label>
      <select
        id={id}
        value={atual}
        onChange={(event) => {
          const unidadeId = Number(event.target.value)
          salvarUltimaUnidade(unidadeId)
          navigate(`/unidades/${unidadeId}`)
        }}
      >
        {atual === '' && (
          <option value="" disabled>
            Escolha uma unidade
          </option>
        )}
        {ordenadas.map((unidade) => (
          <option key={unidade.id} value={unidade.id}>
            {unidade.nome_exibicao}
          </option>
        ))}
      </select>
    </div>
  )
}
