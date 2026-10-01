import type { ReactNode } from 'react'
import type { ApiError } from '../lib/api'
import { TelaNaoEncontrada } from './TelaAviso'

export function Carregando({ texto = 'Carregando...', tela = false }: { texto?: string; tela?: boolean }) {
  return (
    <div className={tela ? 'carregando carregando-tela' : 'carregando'} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </div>
  )
}

export function ErroCarregamento({ erro, onTentarDeNovo }: { erro: ApiError; onTentarDeNovo?: () => void }) {
  // "Rota não encontrada" vem do servidor quando o endpoint não existe (API desatualizada):
  // é erro de sistema, não "sem acesso" — cai no aviso genérico abaixo
  const rotaInexistente = erro.status === 404 && erro.message === 'Rota não encontrada.'
  if ((erro.status === 404 || erro.status === 403) && !rotaInexistente) {
    return (
      <TelaNaoEncontrada
        titulo="Não encontramos o que você procura"
        texto="Este conteúdo não existe ou você não tem acesso a ele. Confira o endereço ou volte para o início."
      />
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
