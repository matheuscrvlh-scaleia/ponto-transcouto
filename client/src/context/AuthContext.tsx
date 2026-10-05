import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, sessao } from '../lib/api'
import type { LoginResposta, MeResposta, Perfil, Tela, TrocarSenhaResposta, UnidadeRef, UsuarioSessao } from '../types/api'

interface AuthState {
  usuario: UsuarioSessao | null
  unidades: UnidadeRef[]
  perfil: Perfil | null
  /** Telas liberadas pelo grupo de permissão (a equipe Scale IA tem todas). */
  telas: Tela[]
  /** O usuário vê esta tela (ou alguma destas)? */
  podeVer: (...telas: Tela[]) => boolean
  carregando: boolean
  entrar: (login: string, senha: string) => Promise<UsuarioSessao>
  sair: () => void
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>
  recarregar: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null)
  const [unidades, setUnidades] = useState<UnidadeRef[]>([])
  const [carregando, setCarregando] = useState(() => Boolean(sessao.obter()))

  const limpar = useCallback(() => {
    sessao.definir(null)
    setUsuario(null)
    setUnidades([])
  }, [])

  const recarregar = useCallback(async () => {
    const dados = await api<MeResposta>('/auth/me')
    setUsuario(dados.usuario)
    setUnidades(dados.unidades)
  }, [])

  useEffect(() => {
    sessao.aoExpirar(() => {
      setUsuario(null)
      setUnidades([])
      navigate('/login?expirou=1', { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    if (!sessao.obter()) return
    api<MeResposta>('/auth/me')
      .then((dados) => {
        setUsuario(dados.usuario)
        setUnidades(dados.unidades)
      })
      .catch(() => limpar())
      .finally(() => setCarregando(false))
  }, [limpar])

  const entrar = useCallback(async (login: string, senha: string) => {
    const dados = await api<LoginResposta>('/auth/login', { method: 'POST', json: { login, senha } })
    sessao.definir(dados.token)
    setUsuario(dados.usuario)
    setUnidades(dados.unidades)
    return dados.usuario
  }, [])

  const sair = useCallback(() => {
    limpar()
    navigate('/login', { replace: true })
  }, [limpar, navigate])

  const trocarSenha = useCallback(
    async (senhaAtual: string, novaSenha: string) => {
      const { token } = await api<TrocarSenhaResposta>('/auth/trocar-senha', {
        method: 'POST',
        json: { senha_atual: senhaAtual, nova_senha: novaSenha },
      })
      sessao.definir(token)
      await recarregar()
    },
    [recarregar],
  )

  const telas = useMemo(() => usuario?.telas ?? [], [usuario])
  const podeVer = useCallback((...lista: Tela[]) => lista.some((tela) => telas.includes(tela)), [telas])

  const valor = useMemo<AuthState>(
    () => ({
      usuario,
      unidades,
      perfil: usuario?.perfil ?? null,
      telas,
      podeVer,
      carregando,
      entrar,
      sair,
      trocarSenha,
      recarregar,
    }),
    [usuario, unidades, telas, podeVer, carregando, entrar, sair, trocarSenha, recarregar],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const contexto = useContext(AuthContext)
  if (!contexto) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return contexto
}
