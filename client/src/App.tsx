import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AppLayout } from './components/AppLayout'
import { Carregando } from './components/Estados'
import { RequireAuth } from './components/RequireAuth'
import { RequirePerfil } from './components/RequirePerfil'
import { LimiteErro, TelaNaoEncontrada } from './components/TelaAviso'
import { DashboardUnidade } from './pages/DashboardUnidade'
import { DetalheColaborador } from './pages/DetalheColaborador'
import { Inicio } from './pages/Inicio'
import { Login } from './pages/Login'
import { Perfil } from './pages/Perfil'
import { TrocarSenha } from './pages/TrocarSenha'

// Configuração e Administração ficam no mesmo pedaço carregado sob demanda
const carregarAdmin = () => import('./pages/admin/AdminRotas')
const RotasConfiguracao = lazy(() => carregarAdmin().then((m) => ({ default: m.RotasConfiguracao })))
const RotasAdministracao = lazy(() => carregarAdmin().then((m) => ({ default: m.RotasAdministracao })))

/* Endereços antigos da área admin que passaram para Configuração. */
const REDIRECIONAMENTOS: [string, string][] = [
  ['admin/usuarios', '/configuracao/usuarios'],
  ['admin/acessos', '/configuracao/usuarios'],
  ['admin/permissoes', '/configuracao/permissoes'],
  ['admin/unidades', '/configuracao/unidades'],
  ['admin/configuracoes', '/configuracao/alertas'],
]

/** Redireciona mantendo a query (ex.: ?perfil=gestor). */
function Redirecionar({ para }: { para: string }) {
  const { search } = useLocation()
  return <Navigate to={{ pathname: para, search }} replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/* último recurso: um erro fora das páginas (ex.: na sidebar) não deixa a tela em branco */}
        <LimiteErro telaCheia>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth />}>
                <Route path="/trocar-senha" element={<TrocarSenha />} />
                <Route element={<AppLayout />}>
                  <Route index element={<Inicio />} />
                  <Route path="perfil" element={<Perfil />} />
                  <Route path="unidades" element={<DashboardUnidade />} />
                  <Route path="unidades/:unidadeId" element={<DashboardUnidade />} />
                  <Route path="unidades/:unidadeId/colaboradores/:colaboradorId" element={<DetalheColaborador />} />
                  <Route
                    path="configuracao/*"
                    element={
                      <RequirePerfil perfis={['admin', 'rh']}>
                        <Suspense fallback={<Carregando />}>
                          <RotasConfiguracao />
                        </Suspense>
                      </RequirePerfil>
                    }
                  />
                  {REDIRECIONAMENTOS.map(([de, para]) => (
                    <Route key={de} path={`${de}/*`} element={<Redirecionar para={para} />} />
                  ))}
                  <Route
                    path="admin/*"
                    element={
                      // o RH que abrir um endereço antigo de /admin cai na Configuração
                      <RequirePerfil perfis={['admin']} redirecionarPara="/configuracao">
                        <Suspense fallback={<Carregando />}>
                          <RotasAdministracao />
                        </Suspense>
                      </RequirePerfil>
                    }
                  />
                  {/* endereço inexistente: aviso dentro do app (quem não está logado vai para o login) */}
                  <Route path="*" element={<TelaNaoEncontrada />} />
                </Route>
              </Route>
            </Routes>
          </AuthProvider>
        </LimiteErro>
      </BrowserRouter>
    </ThemeProvider>
  )
}
