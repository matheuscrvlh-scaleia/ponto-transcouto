import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { RequirePerfil } from '../../components/RequirePerfil'
import { TelaNaoEncontrada } from '../../components/TelaAviso'
import { useAuth } from '../../context/AuthContext'
import { AbasConfiguracao } from './AbasConfiguracao'
import { AdminLayout, ComEmpresa } from './AdminLayout'
import { Configuracoes } from './Configuracoes'
import { Empresas } from './Empresas'
import { Equipe } from './Equipe'
import { Fechamentos } from './Fechamentos'
import { IntegracaoFriPonto } from './IntegracaoFriPonto'
import { MapeamentoColunas } from './MapeamentoColunas'
import { itensPermitidos, perfisDoItem, SECAO_ADMINISTRACAO, SECAO_CONFIGURACAO, type SecaoAdmin } from './navegacao'
import { Permissoes } from './Permissoes'
import { Unidades } from './Unidades'
import { Usuarios } from './Usuarios'

/* Carregado sob demanda pelo App. A guarda de cada seção fica no App (quem vê ao menos
   um item dela); aqui cada item da Configuração confere os próprios perfis — o gestor
   só entra em Integração FriPonto. */

/** Índice da seção: o primeiro item que o perfil vê. */
function PrimeiroItem({ secao }: { secao: SecaoAdmin }) {
  const { perfil } = useAuth()
  const [primeiro] = itensPermitidos(secao, perfil)
  return primeiro ? <Navigate to={primeiro.caminho} replace /> : <Navigate to="/" replace />
}

/** Rota de um item da Configuração, liberada só para os perfis do item. */
function itemConfiguracao(caminho: string, elemento: ReactNode) {
  return (
    <Route
      key={caminho}
      path={`${caminho}/*`}
      element={
        <RequirePerfil perfis={perfisDoItem(SECAO_CONFIGURACAO, caminho)} redirecionarPara={SECAO_CONFIGURACAO.base}>
          {elemento}
        </RequirePerfil>
      }
    />
  )
}

/** /configuracao/* — gestão da própria empresa (a equipe escolhe a empresa no seletor). */
export function RotasConfiguracao() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<PrimeiroItem secao={SECAO_CONFIGURACAO} />} />
        <Route element={<ComEmpresa />}>
          {/* abas das telas agrupadas no menu (Usuários, Integrações, Configurações) */}
          <Route element={<AbasConfiguracao />}>
            {itemConfiguracao('usuarios', <Usuarios />)}
            {itemConfiguracao('integracao', <IntegracaoFriPonto />)}
            {itemConfiguracao('atualizacao', <Configuracoes secao="atualizacao" />)}
            {itemConfiguracao('unidades', <Unidades />)}
            {itemConfiguracao('alertas', <Configuracoes secao="alertas" />)}
            {itemConfiguracao('fechamentos', <Fechamentos />)}
            {itemConfiguracao('permissoes', <Permissoes />)}
          </Route>
        </Route>
        <Route path="*" element={<TelaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}

function RedirecionarFechamentos() {
  const resto = useParams()['*']
  return <Navigate to={`/configuracao/fechamentos${resto ? `/${resto}` : ''}`} replace />
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
          {/* Configurações: abas Mapeamento de colunas e Calendário de extração */}
          <Route element={<AbasConfiguracao secao={SECAO_ADMINISTRACAO} />}>
            <Route path="colunas/*" element={<MapeamentoColunas />} />
            <Route path="calendario/*" element={<Configuracoes secao="calendario" />} />
          </Route>
        </Route>
        {/* links antigos: os fechamentos ficam em Configuração → Configurações */}
        <Route path="fechamentos/*" element={<RedirecionarFechamentos />} />
        <Route path="*" element={<TelaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}
