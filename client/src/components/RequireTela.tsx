import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Tela } from '../types/api'

interface Props {
  /** Basta o grupo de permissão liberar uma delas. */
  telas: Tela[]
  children?: ReactNode
  redirecionarPara?: string
}

/** Guarda de rota pelas telas do grupo de permissão (a equipe Scale IA tem todas). */
export function RequireTela({ telas, children, redirecionarPara = '/' }: Props) {
  const { podeVer } = useAuth()

  if (!podeVer(...telas)) return <Navigate to={redirecionarPara} replace />

  return children ?? <Outlet />
}
