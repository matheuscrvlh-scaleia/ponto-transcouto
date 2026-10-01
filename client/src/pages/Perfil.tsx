import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { IconeChave, IconeEmail, IconeEscudo, IconeSair, IconeUnidade } from '../components/Icones'
import { ThemeToggle } from '../components/ThemeToggle'
import { iniciais } from '../lib/formato'
import { NOME_PERFIL } from '../lib/preferencias'
import './perfil.css'

const DESCRICAO_PERFIL = {
  admin: 'Acesso a todas as empresas, à Configuração e à Administração do sistema.',
  rh: 'Acompanha as unidades da empresa e cuida da Configuração: usuários, unidades, alertas e fechamentos.',
  gestor: 'Acompanha o banco de horas das unidades vinculadas.',
} as const

export function Perfil() {
  const { usuario, unidades, perfil, sair } = useAuth()

  useEffect(() => {
    document.title = 'Meu perfil — Copiloto de Ponto'
  }, [])

  if (!usuario) return null

  const ordenadas = [...unidades].sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, 'pt-BR'))

  return (
    <section className="pagina perfil">
      <header className="perfil-hero">
        <div className="perfil-hero-faixa" aria-hidden="true" />
        <div className="perfil-hero-corpo">
          <span className="perfil-avatar" aria-hidden="true">
            {iniciais(usuario.nome)}
          </span>
          <div className="perfil-identidade">
            <h1>{usuario.nome}</h1>
            <div className="perfil-meta">
              {perfil && <span className="perfil-pilula">{NOME_PERFIL[perfil]}</span>}
              {usuario.email && (
                <span className="perfil-email">
                  <IconeEmail tamanho={15} />
                  {usuario.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="perfil-grade">
        <article className="perfil-card">
          <h2>Dados da conta</h2>
          <dl className="perfil-dados">
            <div>
              <dt>Nome</dt>
              <dd>{usuario.nome}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{usuario.email || 'Não informado'}</dd>
            </div>
            {perfil && (
              <div>
                <dt>Perfil de acesso</dt>
                <dd>
                  {NOME_PERFIL[perfil]}
                  <small>{DESCRICAO_PERFIL[perfil]}</small>
                </dd>
              </div>
            )}
          </dl>
          <p className="perfil-nota">
            {usuario.tipo === 'equipe'
              ? 'Para alterar nome ou e-mail, peça a outro membro da equipe Scale IA.'
              : 'Para alterar nome ou e-mail, fale com o RH.'}
          </p>
        </article>

        <article className="perfil-card">
          <div className="perfil-card-topo">
            <h2>Unidades com acesso</h2>
            <span className="perfil-contador">{unidades.length}</span>
          </div>
          {ordenadas.length === 0 ? (
            <p className="perfil-nota">Você ainda não está vinculado a nenhuma unidade.</p>
          ) : (
            <ul className="perfil-unidades">
              {ordenadas.map((unidade) => (
                <li key={unidade.id}>
                  <Link to={`/unidades/${unidade.id}`}>
                    <span className="perfil-unidade-icone" aria-hidden="true">
                      <IconeUnidade tamanho={16} />
                    </span>
                    <span className="perfil-unidade-nome">{unidade.nome_exibicao}</span>
                    <span className="perfil-unidade-ir" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="perfil-card">
          <div className="perfil-card-topo">
            <h2>Segurança</h2>
            <IconeEscudo tamanho={20} className="perfil-card-icone" />
          </div>
          <p className="perfil-texto">Use uma senha forte e só sua. Se suspeitar que alguém sabe sua senha, troque agora.</p>
          <div className="perfil-acoes">
            <Link to="/trocar-senha" className="perfil-botao perfil-botao-primario">
              <IconeChave tamanho={16} />
              Trocar senha
            </Link>
            <button type="button" className="perfil-botao perfil-botao-sair" onClick={sair}>
              <IconeSair tamanho={16} />
              Sair da conta
            </button>
          </div>
        </article>

        <article className="perfil-card">
          <h2>Preferências</h2>
          <div className="perfil-preferencia">
            <div>
              <strong>Aparência</strong>
              <span>Tema claro ou escuro, salvo neste navegador.</span>
            </div>
            <ThemeToggle />
          </div>
        </article>
      </div>
    </section>
  )
}
