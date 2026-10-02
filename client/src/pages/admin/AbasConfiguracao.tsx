import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { entradasDaSecao, itensPermitidos, SECAO_CONFIGURACAO, type SecaoAdmin } from './navegacao'

/* Abas no topo das telas da Configuração e da Administração: cada entrada do menu (ex.: Usuários,
   Integrações, Configurações) junta várias telas; aqui o usuário troca entre elas. Com uma aba só
   (ex.: gestor em Integrações), a barra não aparece. */
export function AbasConfiguracao({ secao: secaoBase = SECAO_CONFIGURACAO }: { secao?: SecaoAdmin }) {
  const { perfil } = useAuth()
  const { pathname } = useLocation()
  const secao = { ...secaoBase, itens: itensPermitidos(secaoBase, perfil) }
  const base = secaoBase.base

  const entrada = entradasDaSecao(secao).find((item) =>
    item.abas.some((aba) => pathname.startsWith(`${base}/${aba.caminho}`)),
  )

  return (
    <>
      {entrada && entrada.abas.length > 1 && (
        <nav className="abas-config" aria-label={entrada.rotulo}>
          {entrada.abas.map((aba) => (
            <NavLink
              key={aba.caminho}
              to={`${base}/${aba.caminho}`}
              className={({ isActive }) => (isActive ? 'abas-config-item ativa' : 'abas-config-item')}
            >
              {aba.rotulo}
            </NavLink>
          ))}
        </nav>
      )}
      <Outlet />
    </>
  )
}
