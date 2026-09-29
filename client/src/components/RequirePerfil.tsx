import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Perfil } from '../types/api'

interface Props {
  perfis: Perfil[]
  children?: ReactNode
  redirecionarPara?: string
}

export function RequirePerfil({ perfis, children, redirecionarPara = '/' }: Props) {
  const { perfil } = useAuth()

  if (!perfil || !perfis.includes(perfil)) return <Navigate to={redirecionarPara} replace />

  return children ?? <Outlet />
}
