import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { IconeEmail, IconeUnidade } from '../components/Icones'
import { MenuPerfil } from '../components/MenuPerfil'
import { iniciais } from '../lib/formato'
import { NOME_PERFIL } from '../lib/preferencias'
import './perfil.css'
import { TituloPagina } from '../components/TituloPagina'

const DESCRICAO_PERFIL = {
  admin: 'Acesso a todas as empresas, à Configuração e à Administração do sistema.',
  rh: 'Acompanha as unidades da empresa e cuida da Configuração: usuários, unidades, alertas e fechamentos.',
  gestor: 'Acompanha o banco de horas das unidades vinculadas.',
} as const

export function Perfil() {
  const { usuario, unidades, perfil } = useAuth()

  useEffect(() => {
    document.title = 'Meu perfil — Copiloto de Ponto'
  }, [])

  if (!usuario) return null

  // cliente: o nome do grupo de permissão; equipe: "Equipe Scale IA"
  const nomeAcesso = usuario.grupo?.nome ?? (perfil ? NOME_PERFIL[perfil] : null)
  const descricaoAcesso = usuario.grupo
    ? `${usuario.telas.length} ${usuario.telas.length === 1 ? 'tela liberada' : 'telas liberadas'} pelo grupo de permissão.`
    : perfil
      ? DESCRICAO_PERFIL[perfil]
      : null

  const ordenadas = [...unidades].sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, 'pt-BR'))

  return (
    <section className="pagina perfil">
      <TituloPagina>Meu perfil</TituloPagina>
      <header className="perfil-hero">
        <div className="perfil-hero-faixa" aria-hidden="true" />
        <MenuPerfil className="perfil-hero-menu" />
        <div className="perfil-hero-corpo">
          <span className="perfil-avatar" aria-hidden="true">
            {iniciais(usuario.nome)}
          </span>
          <div className="perfil-identidade">
            <h2>{usuario.nome}</h2>
            <div className="perfil-meta">
              {nomeAcesso && <span className="perfil-pilula">{nomeAcesso}</span>}
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
            {nomeAcesso && (
              <div>
                <dt>{usuario.grupo ? 'Grupo de permissão' : 'Perfil de acesso'}</dt>
                <dd>
                  {nomeAcesso}
                  {descricaoAcesso && <small>{descricaoAcesso}</small>}
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
      </div>
    </section>
  )
}
