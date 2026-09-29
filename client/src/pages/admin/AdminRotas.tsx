import type { ComponentType } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequirePerfil } from '../../components/RequirePerfil'
import { Acessos } from './Acessos'
import { AdminIndex } from './AdminIndex'
import { AdminLayout } from './AdminLayout'
import { Configuracoes } from './Configuracoes'
import { Empresas } from './Empresas'
import { Fechamentos } from './Fechamentos'
import { MapeamentoColunas } from './MapeamentoColunas'
import { ITENS_ADMIN } from './navegacao'
import { Unidades } from './Unidades'

const TELAS: Record<string, ComponentType> = {
  fechamentos: Fechamentos,
  unidades: Unidades,
  configuracoes: Configuracoes,
  colunas: MapeamentoColunas,
  acessos: Acessos,
  empresas: Empresas,
}

export default function AdminRotas() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminIndex />} />
        {ITENS_ADMIN.map(({ caminho, perfis }) => {
          const Tela = TELAS[caminho]
          return (
            <Route
              key={caminho}
              path={`${caminho}/*`}
              element={
                <RequirePerfil perfis={perfis} redirecionarPara="/admin">
                  <Tela />
                </RequirePerfil>
              }
            />
          )
        })}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}
