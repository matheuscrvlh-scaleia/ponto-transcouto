import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AppLayout } from './components/AppLayout'
import { Carregando } from './components/Estados'
import { RequireAuth } from './components/RequireAuth'
import { RequirePerfil } from './components/RequirePerfil'
import { DashboardUnidade } from './pages/DashboardUnidade'
import { DetalheColaborador } from './pages/DetalheColaborador'
import { Inicio } from './pages/Inicio'
import { Login } from './pages/Login'
import { SelecionarUnidade } from './pages/SelecionarUnidade'
import { TrocarSenha } from './pages/TrocarSenha'

const AdminRotas = lazy(() => import('./pages/admin/AdminRotas'))

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route path="/trocar-senha" element={<TrocarSenha />} />
              <Route element={<AppLayout />}>
                <Route index element={<Inicio />} />
                <Route path="unidades" element={<SelecionarUnidade />} />
                <Route path="unidades/:unidadeId" element={<DashboardUnidade />} />
                <Route path="unidades/:unidadeId/colaboradores/:colaboradorId" element={<DetalheColaborador />} />
                <Route
                  path="admin/*"
                  element={
                    <RequirePerfil perfis={['admin', 'rh']}>
                      <Suspense fallback={<Carregando />}>
                        <AdminRotas />
                      </Suspense>
                    </RequirePerfil>
                  }
                />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
