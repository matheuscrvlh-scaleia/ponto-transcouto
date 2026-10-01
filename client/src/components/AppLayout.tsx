import { useId, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom'
import { LimiteErro } from './TelaAviso'
import { useAuth } from '../context/AuthContext'
import { iniciais } from '../lib/formato'
import { lerMenuRecolhido, NOME_PERFIL, salvarMenuRecolhido } from '../lib/preferencias'
import { secoesPermitidas } from '../pages/admin/navegacao'
import {
  IconeAjustes,
  IconeCalendario,
  IconeColunas,
  IconeEmpresa,
  IconeEscudo,
  IconeMenu,
  IconeOlho,
  IconePainel,
  IconeRelogio,
  IconeSair,
  IconeSetaBaixo,
  IconeUnidade,
  IconeUsuarios,
} from './Icones'
import { EmpresaAdminProvider } from '../context/EmpresaAdminContext'
import { Notificacoes } from './Notificacoes'
import { SeletorEmpresa } from './SeletorEmpresa'
import { SeletorUnidade } from './SeletorUnidade'
import { ThemeToggle } from './ThemeToggle'
import logo from '../assets/logos/logo.avif'
import './app-layout.css'

const classeLink = ({ isActive }: { isActive: boolean }) => (isActive ? 'app-nav-item active' : 'app-nav-item')

// ícone de cada item de Configuração / Administração, pelo caminho
const ICONES_ITENS: Record<string, typeof IconeAjustes> = {
  usuarios: IconeUsuarios,
  unidades: IconeUnidade,
  alertas: IconeAjustes,
  fechamentos: IconeCalendario,
  permissoes: IconeEscudo,
  empresas: IconeEmpresa,
  colunas: IconeColunas,
  calendario: IconeRelogio,
  equipe: IconeUsuarios,
}

/* A empresa escolhida no topo (equipe) vale para o app inteiro: Gestão, Configuração e Administração. */
export function AppLayout() {
  return (
    <EmpresaAdminProvider>
      <CascaApp />
    </EmpresaAdminProvider>
  )
}

function CascaApp() {
  const { usuario, unidades, perfil, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  // seções recolhidas da sidebar, guardadas por usuário neste navegador
  const [recolhidas, setRecolhidas] = useState(() => (usuario ? lerMenuRecolhido(usuario) : []))
  const { pathname } = useLocation()
  const naGestao = Boolean(useMatch('/unidades/*'))
  const naConfiguracao = Boolean(useMatch('/configuracao/*'))
  const naAdministracao = Boolean(useMatch('/admin/*'))
  const noPerfil = Boolean(useMatch('/perfil'))
  const semNota = naConfiguracao || naAdministracao || noPerfil
  const secaoAtual: Record<string, boolean> = { configuracao: naConfiguracao, administracao: naAdministracao }

  const secoes = secoesPermitidas(perfil)
  const unicaUnidade = unidades.length === 1 ? unidades[0] : null
  const nome = usuario?.nome ?? 'Usuário'
  const nomePerfil = perfil ? NOME_PERFIL[perfil] : ''

  function fecharMenu() {
    setMenuAberto(false)
  }

  function alternarSecao(secao: string) {
    const proximas = recolhidas.includes(secao) ? recolhidas.filter((item) => item !== secao) : [...recolhidas, secao]
    setRecolhidas(proximas)
    if (usuario) salvarMenuRecolhido(usuario, proximas)
  }

  return (
    <div className="app-shell">
      {menuAberto && <div className="app-sidebar-overlay" onClick={fecharMenu} />}

      <aside className={menuAberto ? 'app-sidebar open' : 'app-sidebar'} aria-label="Menu principal">
        <div className="app-sidebar-top">
          <Link to="/" className="brand" onClick={fecharMenu}>
            <span className="brand-logo-wrap">
              <img src={logo} alt="Transcouto" className="brand-logo" />
            </span>
            <span className="brand-nome">Copiloto de Ponto</span>
          </Link>
          <button type="button" className="app-sidebar-close" onClick={fecharMenu} aria-label="Fechar menu">
            ×
          </button>
        </div>

        <SeletorUnidade className="seletor-sidebar" />

        <nav className="app-sidebar-nav" aria-label="Navegação">
          <SecaoMenu
            id="gestao"
            titulo="Gestão"
            recolhida={recolhidas.includes('gestao')}
            contemPaginaAtual={naGestao}
            onAlternar={alternarSecao}
          >
            {unicaUnidade ? (
              <NavLink to={`/unidades/${unicaUnidade.id}`} className={classeLink} onClick={fecharMenu}>
                <IconePainel className="app-nav-icone" />
                <span>{unicaUnidade.nome_exibicao}</span>
              </NavLink>
            ) : (
              <NavLink to="/unidades" className={classeLink} onClick={fecharMenu}>
                <IconePainel className="app-nav-icone" />
                <span>Dashboard</span>
              </NavLink>
            )}
          </SecaoMenu>

          {secoes.map((secao) => (
            <SecaoMenu
              key={secao.id}
              id={secao.id}
              titulo={secao.titulo}
              recolhida={recolhidas.includes(secao.id)}
              contemPaginaAtual={secaoAtual[secao.id]}
              onAlternar={alternarSecao}
            >
              {secao.itens.map(({ caminho, rotulo }) => {
                const Icone = ICONES_ITENS[caminho] ?? IconeAjustes
                return (
                  <NavLink key={caminho} to={`${secao.base}/${caminho}`} className={classeLink} onClick={fecharMenu}>
                    <Icone className="app-nav-icone" />
                    <span>{rotulo}</span>
                  </NavLink>
                )
              })}
            </SecaoMenu>
          ))}
        </nav>

        <div className="app-sidebar-rodape">
          <div className="app-sidebar-acoes">
            <ThemeToggle />
            <Notificacoes />
          </div>

          <div className="app-usuario">
            <NavLink
              to="/perfil"
              className={({ isActive }) => (isActive ? 'app-usuario-link active' : 'app-usuario-link')}
              onClick={fecharMenu}
              title="Meu perfil"
            >
              <span className="avatar" aria-hidden="true">
                {iniciais(nome)}
              </span>
              <span className="user-info">
                <span className="user-name">{nome}</span>
                <span className="user-cargos">{usuario?.email || nomePerfil}</span>
              </span>
            </NavLink>
            <button type="button" className="app-sair" onClick={sair} aria-label="Sair" title="Sair">
              <IconeSair />
            </button>
          </div>

          <p className="app-assinatura">
            Desenvolvido por <strong>Scale IA</strong>
          </p>
        </div>
      </aside>

      <main className="app-main">
        {/* no desktop o topo some quando não tem nada: sem o aviso e sem o seletor de empresa da equipe */}
        <header className={semNota && perfil !== 'admin' ? 'app-topbar sem-nota' : 'app-topbar'}>
          <button
            type="button"
            className="app-menu-toggle"
            onClick={() => setMenuAberto(true)}
            aria-expanded={menuAberto}
            aria-label="Abrir menu"
          >
            <IconeMenu />
          </button>
          <SeletorUnidade className="seletor-topbar" />
          {!semNota && (
            <p className="app-topbar-nota">
              <IconeOlho tamanho={16} />
              Painel semanal · somente leitura
            </p>
          )}
          <div className="app-topbar-acoes">
            <SeletorEmpresa />
          </div>
        </header>
        <div className="app-conteudo">
          {/* erro numa página não derruba a sidebar; trocar de página limpa o erro */}
          <LimiteErro key={pathname}>
            <Outlet />
          </LimiteErro>
        </div>
      </main>
    </div>
  )
}

function SecaoMenu({
  id,
  titulo,
  recolhida,
  contemPaginaAtual,
  onAlternar,
  children,
}: {
  id: string
  titulo: string
  recolhida: boolean
  contemPaginaAtual: boolean
  onAlternar: (id: string) => void
  children: ReactNode
}) {
  const idItens = useId()

  return (
    <div className={recolhida ? 'app-nav-grupo recolhido' : 'app-nav-grupo'}>
      <button
        type="button"
        className="app-nav-secao"
        aria-expanded={!recolhida}
        aria-controls={idItens}
        onClick={() => onAlternar(id)}
      >
        <span className="app-nav-secao-nome">{titulo}</span>
        {recolhida && contemPaginaAtual && <span className="app-nav-secao-ponto" title="Página atual nesta seção" />}
        <IconeSetaBaixo tamanho={14} className="app-nav-secao-seta" />
      </button>
      <div id={idItens} className="app-nav-itens" hidden={recolhida}>
        {children}
      </div>
    </div>
  )
}
