import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AppLayout } from './components/AppLayout'
import { CentralAlertas } from './components/CentralAlertas'
import { Carregando } from './components/Estados'
import { RequireAuth } from './components/RequireAuth'
import { RequirePerfil } from './components/RequirePerfil'
import { RequireTela } from './components/RequireTela'
import { LimiteErro, TelaNaoEncontrada } from './components/TelaAviso'
import { Batidas } from './pages/Batidas'
import { Colaboradores } from './pages/Colaboradores'
import { DashboardUnidade } from './pages/DashboardUnidade'
import { DetalheColaborador } from './pages/DetalheColaborador'
import { Inicio } from './pages/Inicio'
import { Login } from './pages/Login'
import { Perfil } from './pages/Perfil'
import { TrocarSenha } from './pages/TrocarSenha'
import { SECAO_CONFIGURACAO } from './pages/admin/navegacao'
import type { Tela } from './types/api'

// quem tem ao menos uma tela da Configuração no grupo de permissão (cada item confere a sua)
const TELAS_CONFIGURACAO = SECAO_CONFIGURACAO.itens.flatMap((item) => (item.tela ? [item.tela] : []))
// o detalhe do colaborador abre a partir do Dashboard, de Colaboradores e de Batidas
const TELAS_DETALHE: Tela[] = ['dashboard', 'colaboradores', 'batidas']

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
        {/* alertas de erro no canto inferior esquerdo, em qualquer tela */}
        <CentralAlertas />
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
                  {/* Gestão: cada tela vale pelo grupo de permissão (Configuração → Permissões) */}
                  <Route element={<RequireTela telas={['dashboard']} />}>
                    <Route path="unidades" element={<DashboardUnidade />} />
                    <Route path="unidades/:unidadeId" element={<DashboardUnidade />} />
                  </Route>
                  <Route element={<RequireTela telas={['colaboradores']} />}>
                    <Route path="unidades/:unidadeId/colaboradores" element={<Colaboradores />} />
                    <Route path="colaboradores" element={<Colaboradores />} />
                  </Route>
                  <Route element={<RequireTela telas={TELAS_DETALHE} />}>
                    <Route path="unidades/:unidadeId/colaboradores/:colaboradorId" element={<DetalheColaborador />} />
                  </Route>
                  <Route element={<RequireTela telas={['batidas']} />}>
                    <Route path="batidas" element={<Batidas />} />
                  </Route>
                  <Route
                    path="configuracao/*"
                    element={
                      <RequireTela telas={TELAS_CONFIGURACAO}>
                        <Suspense fallback={<Carregando />}>
                          <RotasConfiguracao />
                        </Suspense>
                      </RequireTela>
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
