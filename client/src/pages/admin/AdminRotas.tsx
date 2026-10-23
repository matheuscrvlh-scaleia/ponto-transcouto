import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { TelaNaoEncontrada } from '../../components/TelaAviso'
import { useAuth } from '../../context/AuthContext'
import { AbasConfiguracao } from './AbasConfiguracao'
import { AdminLayout, ComEmpresa } from './AdminLayout'
import { Configuracoes } from './Configuracoes'
import { Empresas } from './Empresas'
import { Equipe } from './Equipe'
import { IntegracaoFriPonto } from './IntegracaoFriPonto'
import { MapeamentoColunas } from './MapeamentoColunas'
import { itemPermitido, itensPermitidos, SECAO_ADMINISTRACAO, SECAO_CONFIGURACAO, type SecaoAdmin } from './navegacao'
import { Permissoes } from './Permissoes'
import { Unidades } from './Unidades'
import { Usuarios } from './Usuarios'

/* Carregado sob demanda pelo App. A guarda de cada seção fica no App (quem vê ao menos
   um item dela); aqui cada item da Configuração confere a própria tela no grupo de
   permissão do usuário (Configuração → Permissões). */

/** Índice da seção: o primeiro item que o perfil vê. */
function PrimeiroItem({ secao }: { secao: SecaoAdmin }) {
  const { perfil, telas } = useAuth()
  const [primeiro] = itensPermitidos(secao, perfil, telas)
  return primeiro ? <Navigate to={primeiro.caminho} replace /> : <Navigate to="/" replace />
}

/** Item da Configuração liberado para o usuário; senão volta para o primeiro item que ele vê. */
function RequireItem({ caminho, children }: { caminho: string; children: ReactNode }) {
  const { perfil, telas } = useAuth()
  const item = SECAO_CONFIGURACAO.itens.find((atual) => atual.caminho === caminho)
  if (!item || !itemPermitido(SECAO_CONFIGURACAO, item, perfil, telas)) {
    return <Navigate to={SECAO_CONFIGURACAO.base} replace />
  }
  return children
}

function itemConfiguracao(caminho: string, elemento: ReactNode) {
  return <Route key={caminho} path={`${caminho}/*`} element={<RequireItem caminho={caminho}>{elemento}</RequireItem>} />
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
            {itemConfiguracao('colunas', <MapeamentoColunas />)}
            {itemConfiguracao('unidades', <Unidades />)}
            {itemConfiguracao('alertas', <Configuracoes secao="alertas" />)}
            {itemConfiguracao('permissoes', <Permissoes />)}
          </Route>
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
          {/* Configurações: Calendário de extração (o mapeamento de colunas foi para Configuração → Integrações) */}
          <Route element={<AbasConfiguracao secao={SECAO_ADMINISTRACAO} />}>
            <Route path="calendario/*" element={<Configuracoes secao="calendario" />} />
          </Route>
        </Route>
        <Route path="*" element={<TelaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}
