import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ApiError } from '../lib/api'

export function Carregando({ texto = 'Carregando...', tela = false }: { texto?: string; tela?: boolean }) {
  return (
    <div className={tela ? 'carregando carregando-tela' : 'carregando'} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </div>
  )
}

export function ErroCarregamento({ erro, onTentarDeNovo }: { erro: ApiError; onTentarDeNovo?: () => void }) {
  if (erro.status === 404 || erro.status === 403) {
    return (
      <EstadoVazio titulo="Não encontrado">
        <p>Esta página não existe ou você não tem acesso a ela.</p>
        <Link to="/" className="btn-link">
          Voltar para o início
        </Link>
      </EstadoVazio>
    )
  }

  return (
    <div className="estado estado-erro" role="alert">
      <h2>Não foi possível carregar</h2>
      <p>{erro.message}</p>
      {onTentarDeNovo && (
        <button type="button" className="btn-secondary btn-inline" onClick={onTentarDeNovo}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}

export function EstadoVazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="estado">
      <h2>{titulo}</h2>
      {children}
    </div>
  )
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="aviso" role="note">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 2 16.5 15.5h-15L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 7v3.5M9 12.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </div>
  )
}
