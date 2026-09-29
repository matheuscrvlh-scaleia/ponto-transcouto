import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NOME_PERFIL } from '../lib/preferencias'
import { SeletorUnidade } from './SeletorUnidade'
import { ThemeToggle } from './ThemeToggle'
import logo from '../assets/logos/logo.avif'

const classeLink = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

export function AppLayout() {
  const { usuario, unidades, perfil, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)

  const podeAcessarAdmin = perfil === 'admin' || perfil === 'rh'
  const unicaUnidade = unidades.length === 1 ? unidades[0] : null

  function fecharMenu() {
    setMenuAberto(false)
  }

  return (
    <div className="app-shell">
      {menuAberto && <div className="app-sidebar-overlay" onClick={fecharMenu} />}

      <aside className={menuAberto ? 'app-sidebar open' : 'app-sidebar'} aria-label="Menu principal">
        <div className="app-sidebar-top">
          <Link to="/" className="brand" onClick={fecharMenu}>
            <div className="brand-logo-wrap">
              <img src={logo} alt="Transcouto" className="brand-logo" />
            </div>
            <span>Copiloto de Ponto</span>
          </Link>
          <div className="app-sidebar-top-actions">
            <ThemeToggle />
            <button type="button" className="app-sidebar-close" onClick={fecharMenu} aria-label="Fechar menu">
              ×
            </button>
          </div>
        </div>

        <SeletorUnidade className="seletor-sidebar" />

        <nav className="app-sidebar-nav">
          {unicaUnidade ? (
            <NavLink to={`/unidades/${unicaUnidade.id}`} className={classeLink} onClick={fecharMenu}>
              {unicaUnidade.nome_exibicao}
            </NavLink>
          ) : (
            <NavLink to="/unidades" end className={classeLink} onClick={fecharMenu}>
              Unidades
            </NavLink>
          )}
          {podeAcessarAdmin && (
            <NavLink to="/admin" className={classeLink} onClick={fecharMenu}>
              Administração
            </NavLink>
          )}
        </nav>

        <div className="app-sidebar-bottom">
          <div className="user-info">
            <div className="user-name">{usuario?.nome ?? 'Usuário'}</div>
            <div className="user-cargos">{perfil ? NOME_PERFIL[perfil] : ''}</div>
          </div>
          <Link to="/trocar-senha" className="btn-link" onClick={fecharMenu}>
            Trocar senha
          </Link>
          <button type="button" className="btn-secondary" onClick={sair}>
            Sair
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-topbar">
          <button
            type="button"
            className="app-menu-toggle"
            onClick={() => setMenuAberto(true)}
            aria-expanded={menuAberto}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Menu
          </button>
          <SeletorUnidade className="seletor-topbar" />
        </div>
        <Outlet />
      </main>
    </div>
  )
}
