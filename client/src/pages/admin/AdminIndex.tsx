import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { itensPermitidos } from './navegacao'

export function AdminIndex() {
  const { perfil } = useAuth()
  const primeiro = itensPermitidos(perfil)[0]
  return <Navigate to={primeiro ? `/admin/${primeiro.caminho}` : '/'} replace />
}
