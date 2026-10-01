import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { api, type ApiError } from '../lib/api'
import { lerEmpresaAdmin, salvarEmpresaAdmin } from '../lib/preferencias'
import { useRecurso } from '../lib/useRecurso'
import type { Empresa } from '../types/api'

interface EmpresaAdminState {
  /** Equipe Scale IA (perfil admin): escolhe a empresa no seletor do topo. */
  ehAdmin: boolean
  /**
   * Empresa em foco: a escolhida no topo (equipe) ou a do próprio usuário (rh/gestor).
   * Para a equipe, null = "todas as empresas" (padrão).
   */
  empresaId: number | null
  empresa: Empresa | null
  empresas: Empresa[]
  carregando: boolean
  erro: ApiError | null
  selecionar: (id: number | null) => void
  recarregarEmpresas: () => void
  /** `{ empresa_id }` só para a equipe com empresa escolhida; o server infere a do cliente pelo token. */
  query: { empresa_id?: number }
}

const EmpresaAdminContext = createContext<EmpresaAdminState | null>(null)

/* Fica em volta de todo o app logado (AppLayout): a empresa escolhida no topo
   vale para Gestão, Configuração e Administração. */
export function EmpresaAdminProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfil === 'admin'
  const [escolhida, setEscolhida] = useState(lerEmpresaAdmin)
  const lista = useRecurso(
    (signal) => (ehAdmin ? api<Empresa[]>('/admin/empresas', { signal }) : Promise.resolve([])),
    `empresas-${ehAdmin}`,
  )

  const empresas = useMemo(() => lista.dados ?? [], [lista.dados])

  // equipe: a escolhida, se ainda existir (senão volta para "todas"); cliente: a dele
  const empresa = ehAdmin ? (empresas.find((item) => item.id === escolhida) ?? null) : null
  const empresaId = ehAdmin ? (empresa?.id ?? null) : (usuario?.empresa_id ?? null)

  const selecionar = useCallback((id: number | null) => {
    setEscolhida(id)
    salvarEmpresaAdmin(id)
  }, [])

  const valor = useMemo<EmpresaAdminState>(
    () => ({
      ehAdmin,
      empresaId,
      empresa,
      empresas,
      carregando: lista.carregando,
      erro: lista.erro,
      selecionar,
      recarregarEmpresas: lista.recarregar,
      query: ehAdmin && empresaId ? { empresa_id: empresaId } : {},
    }),
    [ehAdmin, empresaId, empresa, empresas, lista.carregando, lista.erro, lista.recarregar, selecionar],
  )

  return <EmpresaAdminContext.Provider value={valor}>{children}</EmpresaAdminContext.Provider>
}

export function useEmpresaAdmin() {
  const contexto = useContext(EmpresaAdminContext)
  if (!contexto) throw new Error('useEmpresaAdmin precisa estar dentro de <EmpresaAdminProvider>')
  return contexto
}

/** Para telas que só renderizam com uma empresa definida (garantido pelo ComEmpresa). */
export function useEmpresaSelecionada() {
  const contexto = useEmpresaAdmin()
  if (contexto.empresaId == null) throw new Error('Nenhuma empresa selecionada')
  return { ...contexto, empresaId: contexto.empresaId }
}
