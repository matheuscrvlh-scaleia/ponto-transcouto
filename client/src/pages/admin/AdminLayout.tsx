import { useState } from 'react'
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { EmpresaAdminProvider, useEmpresaAdmin } from '../../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { itensPermitidos } from './navegacao'
import './admin.css'

export function AdminLayout() {
  const { perfil } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  const itens = itensPermitidos(perfil)

  return (
    <div className="admin-layout">
      <button
        type="button"
        className="admin-menu-toggle"
        onClick={() => setMenuAberto(true)}
        aria-expanded={menuAberto}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Administração
      </button>

      {menuAberto && <div className="admin-sidebar-overlay" onClick={() => setMenuAberto(false)} />}

      <aside className={menuAberto ? 'admin-sidebar open' : 'admin-sidebar'} aria-label="Menu de administração">
        <div className="admin-sidebar-header">
          <span>Administração</span>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>
        <nav className="admin-sidebar-nav">
          {itens.map((item) => (
            <NavLink
              key={item.caminho}
              to={`/admin/${item.caminho}`}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setMenuAberto(false)}
            >
              {item.rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="admin-content">
        <EmpresaAdminProvider>
          <ConteudoComEmpresa />
        </EmpresaAdminProvider>
      </div>
    </div>
  )
}

function ConteudoComEmpresa() {
  const { ehAdmin, empresaId, empresas, carregando, erro, selecionar, recarregarEmpresas } = useEmpresaAdmin()
  const naTelaEmpresas = Boolean(useMatch('/admin/empresas/*'))

  if (naTelaEmpresas) return <Outlet />
  if (ehAdmin && carregando) return <Carregando texto="Carregando empresas..." />
  if (ehAdmin && erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregarEmpresas} />

  if (empresaId == null) {
    return (
      <EstadoVazio titulo="Nenhuma empresa cadastrada">
        {ehAdmin ? (
          <Link to="/admin/empresas" className="btn-link">
            Cadastrar empresa
          </Link>
        ) : (
          <p>Seu usuário não está vinculado a uma empresa.</p>
        )}
      </EstadoVazio>
    )
  }

  return (
    <>
      {ehAdmin && (
        <div className="seletor-empresa">
          <label htmlFor="seletor-empresa">Empresa</label>
          <select id="seletor-empresa" value={empresaId} onChange={(event) => selecionar(Number(event.target.value))}>
            {empresas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>
                {empresa.nome}
                {empresa.ativo ? '' : ' (inativa)'}
              </option>
            ))}
          </select>
        </div>
      )}
      <Outlet key={empresaId} />
    </>
  )
}
