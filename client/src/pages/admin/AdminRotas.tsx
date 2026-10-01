import { Navigate, Route, Routes } from 'react-router-dom'
import { TelaNaoEncontrada } from '../../components/TelaAviso'
import { AdminLayout, ComEmpresa } from './AdminLayout'
import { Configuracoes } from './Configuracoes'
import { Empresas } from './Empresas'
import { Equipe } from './Equipe'
import { Fechamentos } from './Fechamentos'
import { MapeamentoColunas } from './MapeamentoColunas'
import { SECAO_ADMINISTRACAO, SECAO_CONFIGURACAO } from './navegacao'
import { Permissoes } from './Permissoes'
import { Unidades } from './Unidades'
import { Usuarios } from './Usuarios'

/* Carregado sob demanda pelo App. As guardas de perfil de cada seção ficam no App
   (Configuração: equipe e RH; Administração: só equipe). */

/** /configuracao/* — gestão da própria empresa (a equipe escolhe a empresa no seletor). */
export function RotasConfiguracao() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to={SECAO_CONFIGURACAO.itens[0].caminho} replace />} />
        <Route element={<ComEmpresa />}>
          <Route path="usuarios/*" element={<Usuarios />} />
          <Route path="unidades/*" element={<Unidades />} />
          <Route path="alertas/*" element={<Configuracoes secao="alertas" />} />
          <Route path="fechamentos/*" element={<Fechamentos />} />
          <Route path="permissoes/*" element={<Permissoes />} />
        </Route>
        <Route path="*" element={<TelaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}

/** /admin/* — administração do sistema, só equipe Scale IA. */
export function RotasAdministracao() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to={SECAO_ADMINISTRACAO.itens[0].caminho} replace />} />
        {/* não dependem de uma empresa escolhida */}
        <Route path="empresas/*" element={<Empresas />} />
        <Route path="equipe/*" element={<Equipe />} />
        <Route element={<ComEmpresa />}>
          <Route path="colunas/*" element={<MapeamentoColunas />} />
          <Route path="fechamentos/*" element={<Fechamentos />} />
          <Route path="calendario/*" element={<Configuracoes secao="calendario" />} />
        </Route>
        <Route path="*" element={<TelaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}
