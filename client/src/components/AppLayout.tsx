import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom'
import { IndicadorSincronizacao } from './IndicadorSincronizacao'
import { LimiteErro } from './TelaAviso'
import { useAuth } from '../context/AuthContext'
import { iniciais } from '../lib/formato'
import { lerMenuRecolhido, NOME_PERFIL, salvarMenuRecolhido } from '../lib/preferencias'
import { caminhoColaboradores } from '../lib/painel'
import { entradasDaSecao, secoesPermitidas } from '../pages/admin/navegacao'
import {
  IconeAjustes,
  IconeAtividade,
  IconeBatidas,
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
  IconeSincronizar,
  IconeUnidade,
  IconeUsuarios,
} from './Icones'
import { EmpresaAdminProvider } from '../context/EmpresaAdminContext'
import { Notificacoes } from './Notificacoes'
import { SeletorEmpresa } from './SeletorEmpresa'
import { SeletorUnidade } from './SeletorUnidade'
import { ThemeToggle } from './ThemeToggle'
import { DestinoTitulo } from './TituloPagina'
import logoTranscouto from '../assets/favicon/favicon.png'
import './app-layout.css'

const classeLink = ({ isActive }: { isActive: boolean }) => (isActive ? 'app-nav-item active' : 'app-nav-item')

// ícone de cada item de Configuração / Administração, pelo caminho
const ICONES_ITENS: Record<string, typeof IconeAjustes> = {
  // ids de grupos do menu (as demais chaves são itens)
  integracoes: IconeSincronizar,
  configuracoes: IconeAjustes,
  usuarios: IconeUsuarios,
  integracao: IconeSincronizar,
  atualizacao: IconeAtividade,
  unidades: IconeUnidade,
  alertas: IconeAjustes,
  permissoes: IconeEscudo,
  empresas: IconeEmpresa,
  colunas: IconeColunas,
  calendario: IconeRelogio,
  equipe: IconeUsuarios,
}

export function AppLayout() {
  return (
    <EmpresaAdminProvider>
      <CascaApp />
    </EmpresaAdminProvider>
  )
}

function CascaApp() {
  const { usuario, unidades, perfil, telas, podeVer, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  const [destinoTitulo, setDestinoTitulo] = useState<HTMLDivElement | null>(null)
  const { navRef, rolagem } = useRolagemDoMenu()
  // seções recolhidas da sidebar, guardadas por usuário neste navegador
  const [recolhidas, setRecolhidas] = useState(() => (usuario ? lerMenuRecolhido(usuario) : []))
  const { pathname } = useLocation()
  const matchUnidade = useMatch('/unidades/:unidadeId/*')
  const naUnidades = Boolean(useMatch('/unidades/*'))
  const naBatidas = Boolean(useMatch('/batidas'))
  const naColaboradores = Boolean(useMatch('/colaboradores'))
  const naFechamentos = Boolean(useMatch('/fechamentos/*'))
  const naGestao = naUnidades || naBatidas || naColaboradores || naFechamentos
  const naConfiguracao = Boolean(useMatch('/configuracao/*'))
  const naAdministracao = Boolean(useMatch('/admin/*'))
  const noPerfil = Boolean(useMatch('/perfil'))
  // Fechamentos tem ações da equipe (reprocessar, publicar): não é "somente leitura"
  const semNota = naConfiguracao || naAdministracao || noPerfil || naFechamentos
  const secaoAtual: Record<string, boolean> = { configuracao: naConfiguracao, administracao: naAdministracao }

  const secoes = secoesPermitidas(perfil, telas)
  const unicaUnidade = unidades.length === 1 ? unidades[0] : null
  // Dashboard e Colaboradores seguem a unidade em foco (a escolhida no seletor)
  const unidadeEmFoco = unicaUnidade?.id ?? matchUnidade?.params.unidadeId
  const nome = usuario?.nome ?? 'Usuário'
  const nomePerfil = usuario?.grupo?.nome ?? (perfil ? NOME_PERFIL[perfil] : '')

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
            {/* logo da Transcouto (o mesmo do favicon) */}
            <img className="brand-selo" src={logoTranscouto} alt="" width={34} height={34} />
            <span className="brand-nome">Copiloto de Ponto</span>
          </Link>
          <button type="button" className="app-sidebar-close" onClick={fecharMenu} aria-label="Fechar menu">
            ×
          </button>
        </div>

        {/* empresa em foco: só a equipe Scale IA escolhe (para os clientes o seletor não aparece) */}
        <SeletorEmpresa className="seletor-sidebar" />

        <nav
          ref={navRef}
          className={['app-sidebar-nav', rolagem.acima ? 'mais-acima' : '', rolagem.abaixo ? 'mais-abaixo' : ''].join(' ')}
          aria-label="Navegação"
        >
          <SecaoMenu
            id="gestao"
            titulo="Gestão"
            recolhida={recolhidas.includes('gestao')}
            contemPaginaAtual={naGestao}
            onAlternar={alternarSecao}
          >
            {/* cada item aparece se o grupo de permissão libera a tela */}
            {podeVer('dashboard') && (
              // `end`: na lista ou no detalhe de colaboradores quem fica ativo é "Colaboradores"
              <NavLink
                to={unidadeEmFoco ? `/unidades/${unidadeEmFoco}` : '/unidades'}
                end
                className={classeLink}
                onClick={fecharMenu}
              >
                <IconePainel className="app-nav-icone" />
                <span>{unicaUnidade ? unicaUnidade.nome_exibicao : 'Dashboard'}</span>
              </NavLink>
            )}
            {podeVer('batidas') && (
              <NavLink to="/batidas" className={classeLink} onClick={fecharMenu}>
                <IconeBatidas className="app-nav-icone" />
                <span>Batidas</span>
              </NavLink>
            )}
            {podeVer('colaboradores') && (
              <NavLink to={caminhoColaboradores(unidadeEmFoco)} className={classeLink} onClick={fecharMenu}>
                <IconeUsuarios className="app-nav-icone" />
                <span>Colaboradores</span>
              </NavLink>
            )}
            {podeVer('fechamentos') && (
              <NavLink to="/fechamentos" className={classeLink} onClick={fecharMenu}>
                <IconeCalendario className="app-nav-icone" />
                <span>Fechamentos</span>
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
              {entradasDaSecao(secao).map((entrada) => {
                const Icone = ICONES_ITENS[entrada.chave] ?? IconeAjustes
                // grupo com abas: fica ativo em qualquer uma delas
                const naEntrada = entrada.abas.some((aba) => pathname.startsWith(`${secao.base}/${aba.caminho}`))
                return (
                  <NavLink
                    key={entrada.chave}
                    to={`${secao.base}/${entrada.caminho}`}
                    className={({ isActive }) => classeLink({ isActive: isActive || naEntrada })}
                    onClick={fecharMenu}
                  >
                    <Icone className="app-nav-icone" />
                    <span>{entrada.rotulo}</span>
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
            Desenvolvido por{' '}
            <a href="https://scaleia.ai" target="_blank" rel="noopener noreferrer">
              Scale IA
            </a>
          </p>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="app-menu-toggle"
            onClick={() => setMenuAberto(true)}
            aria-expanded={menuAberto}
            aria-label="Abrir menu"
          >
            <IconeMenu />
          </button>
          {!semNota && (
            <p className="app-topbar-nota">
              <IconeOlho tamanho={16} />
              Painel somente leitura
            </p>
          )}
          {/* título da página atual (cada página manda o seu via <TituloPagina>) */}
          <div className="app-topbar-titulo" ref={setDestinoTitulo} />
          <div className="app-topbar-acoes">
            <SeletorUnidade className="seletor-topo" />
          </div>
        </header>
        <div className="app-conteudo">
          {/* erro numa página não derruba a sidebar; trocar de página limpa o erro */}
          <LimiteErro key={pathname}>
            <DestinoTitulo elemento={destinoTitulo}>
              <Outlet />
            </DestinoTitulo>
          </LimiteErro>
        </div>
      </main>

      <IndicadorSincronizacao />
    </div>
  )
}

/**
 * O menu rola sem barra visível; aqui ele avisa se há itens escondidos acima/abaixo
 * (para o esmaecido nas bordas) e, ao trocar de página, traz o item ativo para a vista.
 */
function useRolagemDoMenu() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [rolagem, setRolagem] = useState({ acima: false, abaixo: false })

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const medir = () => {
      const acima = nav.scrollTop > 2
      const abaixo = nav.scrollTop + nav.clientHeight < nav.scrollHeight - 2
      setRolagem((atual) => (atual.acima === acima && atual.abaixo === abaixo ? atual : { acima, abaixo }))
    }
    medir()
    nav.addEventListener('scroll', medir, { passive: true })
    // muda de tamanho com a janela e quando uma seção abre/recolhe
    const observador = new ResizeObserver(medir)
    observador.observe(nav)
    for (const filho of nav.children) observador.observe(filho)
    return () => {
      nav.removeEventListener('scroll', medir)
      observador.disconnect()
    }
  }, [])

  useEffect(() => {
    navRef.current?.querySelector('.app-nav-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [pathname])

  return { navRef, rolagem }
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
