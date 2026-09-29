import type { ReactNode } from 'react'
import bannerLogin from '../assets/banners/banner-login.avif'
import logo from '../assets/logos/logo.avif'

export function CartaoAcesso({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <main className="login-page" style={{ backgroundImage: `url(${bannerLogin})` }}>
      <div className="login-card">
        <div className="login-brand">
          <img src={logo} alt="Transcouto" className="login-logo" />
          <span className="login-wordmark">Copiloto de Ponto</span>
        </div>
        <div className="login-body">
          {titulo && <h1 className="login-titulo">{titulo}</h1>}
          {children}
        </div>
      </div>
    </main>
  )
}
