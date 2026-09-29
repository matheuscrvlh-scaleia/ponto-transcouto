import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Carregando } from './Estados'

export function RequireAuth() {
  const { usuario, carregando } = useAuth()
  const location = useLocation()

  if (carregando) return <Carregando tela />

  if (!usuario) return <Navigate to="/login" replace state={{ de: location.pathname + location.search }} />

  if (usuario.deve_trocar_senha && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />
  }

  return <Outlet />
}
