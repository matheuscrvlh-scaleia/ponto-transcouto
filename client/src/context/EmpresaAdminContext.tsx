import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { api, type ApiError } from '../lib/api'
import { lerEmpresaAdmin, salvarEmpresaAdmin } from '../lib/preferencias'
import { useRecurso } from '../lib/useRecurso'
import type { Empresa } from '../types/api'

interface EmpresaAdminState {
  ehAdmin: boolean
  /** Empresa em foco: a escolhida no seletor (admin) ou a do próprio usuário (rh). */
  empresaId: number | null
  empresas: Empresa[]
  carregando: boolean
  erro: ApiError | null
  selecionar: (id: number) => void
  recarregarEmpresas: () => void
  /** `{ empresa_id }` só para admin; o server infere a empresa do rh pelo token. */
  query: { empresa_id?: number }
}

const EmpresaAdminContext = createContext<EmpresaAdminState | null>(null)

export function EmpresaAdminProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfil === 'admin'
  const [escolhida, setEscolhida] = useState(lerEmpresaAdmin)
  const lista = useRecurso(
    (signal) => (ehAdmin ? api<Empresa[]>('/admin/empresas', { signal }) : Promise.resolve([])),
    `empresas-${ehAdmin}`,
  )

  const empresas = useMemo(() => lista.dados ?? [], [lista.dados])

  let empresaId: number | null = usuario?.empresa_id ?? null
  if (ehAdmin) {
    const valida = empresas.find((empresa) => empresa.id === escolhida)
    empresaId = (valida ?? empresas.find((empresa) => empresa.ativo) ?? empresas[0])?.id ?? null
  }

  const selecionar = useCallback((id: number) => {
    setEscolhida(id)
    salvarEmpresaAdmin(id)
  }, [])

  const valor = useMemo<EmpresaAdminState>(
    () => ({
      ehAdmin,
      empresaId,
      empresas,
      carregando: lista.carregando,
      erro: lista.erro,
      selecionar,
      recarregarEmpresas: lista.recarregar,
      query: ehAdmin && empresaId ? { empresa_id: empresaId } : {},
    }),
    [ehAdmin, empresaId, empresas, lista.carregando, lista.erro, lista.recarregar, selecionar],
  )

  return <EmpresaAdminContext.Provider value={valor}>{children}</EmpresaAdminContext.Provider>
}

export function useEmpresaAdmin() {
  const contexto = useContext(EmpresaAdminContext)
  if (!contexto) throw new Error('useEmpresaAdmin precisa estar dentro de <EmpresaAdminProvider>')
  return contexto
}

/** Para telas que só renderizam com uma empresa definida (garantido pelo AdminLayout). */
export function useEmpresaSelecionada() {
  const contexto = useEmpresaAdmin()
  if (contexto.empresaId == null) throw new Error('Nenhuma empresa selecionada')
  return { ...contexto, empresaId: contexto.empresaId }
}
