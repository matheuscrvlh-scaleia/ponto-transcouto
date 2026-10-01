import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { IconeCheck, IconeEscudo, IconeMenos, IconeUsuarios } from '../../components/Icones'
import { api } from '../../lib/api'
import { NOME_PERFIL } from '../../lib/preferencias'
import { useRecurso } from '../../lib/useRecurso'
import type { Paginado, Perfil } from '../../types/api'
import './permissoes.css'

const PERFIS: Perfil[] = ['admin', 'rh', 'gestor']

const RESUMO_PERFIL: Record<Perfil, string> = {
  admin: 'Time da Scale IA: acesso a todas as empresas, à Configuração e à Administração do sistema.',
  rh: 'Cuida da própria empresa: usuários, unidades, alertas e acompanhamento dos fechamentos.',
  gestor: 'Acompanha o banco de horas apenas das unidades vinculadas a ele.',
}

type Nivel = 'total' | 'parcial' | 'nenhum'
type Celula = { nivel: Nivel; texto?: string }
type Linha = { area: string; descricao: string; perfis: Record<Perfil, Celula> }

const SEM_ACESSO: Celula = { nivel: 'nenhum' }

/* Espelha as regras do servidor (exigirPerfil nas rotas, regras de RH nos
   controllers e a função unidades_permitidas do banco). Ao mudar uma regra
   lá, atualize aqui. */
const MATRIZ: { grupo: string; linhas: Linha[] }[] = [
  {
    grupo: 'Gestão',
    linhas: [
      {
        area: 'Dashboard',
        descricao: 'Banco de horas, indicadores e detalhe dos colaboradores',
        perfis: {
          admin: { nivel: 'total', texto: 'Todas as empresas' },
          rh: { nivel: 'parcial', texto: 'Todas as unidades da empresa' },
          gestor: { nivel: 'parcial', texto: 'Só unidades vinculadas' },
        },
      },
    ],
  },
  {
    grupo: 'Configuração',
    linhas: [
      {
        area: 'Usuários',
        descricao: 'Cadastrar RH e gestores, vincular unidades e redefinir senha',
        perfis: {
          admin: { nivel: 'total', texto: 'Qualquer empresa' },
          rh: { nivel: 'parcial', texto: 'Somente a própria empresa' },
          gestor: SEM_ACESSO,
        },
      },
      {
        area: 'Unidades',
        descricao: 'Nome de exibição, ativação e sincronização com o ponto',
        perfis: {
          admin: { nivel: 'total', texto: 'Qualquer empresa' },
          rh: { nivel: 'parcial', texto: 'Unidades da empresa' },
          gestor: SEM_ACESSO,
        },
      },
      {
        area: 'Alertas e horas pagas',
        descricao: 'Limites “fora da curva”, teto e origem das horas pagas',
        perfis: {
          admin: { nivel: 'total', texto: 'Qualquer empresa' },
          rh: { nivel: 'parcial', texto: 'Da própria empresa' },
          gestor: SEM_ACESSO,
        },
      },
      {
        area: 'Fechamentos',
        descricao: 'Histórico de extrações e publicação dos dados',
        perfis: {
          admin: { nivel: 'total', texto: 'Consultar, reprocessar, publicar e ajustar agendamento' },
          rh: { nivel: 'parcial', texto: 'Somente consulta' },
          gestor: SEM_ACESSO,
        },
      },
      {
        area: 'Permissões',
        descricao: 'O que cada perfil pode fazer (esta tela)',
        perfis: {
          admin: { nivel: 'total', texto: 'Consulta' },
          rh: { nivel: 'total', texto: 'Consulta' },
          gestor: SEM_ACESSO,
        },
      },
    ],
  },
  {
    grupo: 'Administração',
    linhas: [
      {
        area: 'Administração do sistema',
        descricao: 'Empresas, mapeamento de colunas, ações nos fechamentos, calendário de extração e equipe Scale IA',
        perfis: {
          admin: { nivel: 'total' },
          rh: SEM_ACESSO,
          gestor: SEM_ACESSO,
        },
      },
    ],
  },
  {
    grupo: 'Conta',
    linhas: [
      {
        area: 'Conta própria',
        descricao: 'Ver o perfil e trocar a própria senha',
        perfis: {
          admin: { nivel: 'total' },
          rh: { nivel: 'total' },
          gestor: { nivel: 'total' },
        },
      },
    ],
  },
]

const ROTULO_NIVEL: Record<Nivel, string> = {
  total: 'Acesso completo',
  parcial: 'Acesso limitado',
  nenhum: 'Sem acesso',
}

function CelulaPermissao({ celula }: { celula: Celula }) {
  return (
    <span className={`perm-celula perm-${celula.nivel}`}>
      <span className="perm-marca" aria-hidden="true">
        {celula.nivel === 'nenhum' ? <IconeMenos tamanho={14} /> : <IconeCheck tamanho={14} />}
      </span>
      <span className="perm-celula-texto">
        <span className="sr-only">{ROTULO_NIVEL[celula.nivel]}. </span>
        {celula.texto ?? (celula.nivel === 'nenhum' ? '' : ROTULO_NIVEL[celula.nivel])}
      </span>
    </span>
  )
}

/** Quantas pessoas ativas existem no perfil (só o total da paginação interessa). */
function useTotalAtivos(perfil: Perfil, empresaId: number | undefined, habilitado: boolean) {
  // equipe Scale IA vem de /equipe (sem empresa); RH e gestores, de /clientes da empresa em foco
  const caminho = perfil === 'admin' ? '/equipe' : '/clientes'
  const query = perfil === 'admin' ? { ativo: 'true', por_pagina: 1 } : { perfil, ativo: 'true', empresa_id: empresaId, por_pagina: 1 }
  const recurso = useRecurso(
    (signal) => (habilitado ? api<Paginado<unknown>>(caminho, { signal, query }) : Promise.resolve(null)),
    `perm-total-${perfil}-${empresaId ?? 'propria'}-${habilitado}`,
  )
  return recurso.dados?.total ?? null
}

export function Permissoes() {
  const { perfil: meuPerfil } = useAuth()
  const { query } = useEmpresaSelecionada()
  const ehEquipe = meuPerfil === 'admin'

  // O RH não gerencia a equipe Scale IA: o cartão dela não mostra contagem nem link para ele.
  const totais: Record<Perfil, number | null> = {
    admin: useTotalAtivos('admin', undefined, ehEquipe),
    rh: useTotalAtivos('rh', query.empresa_id, true),
    gestor: useTotalAtivos('gestor', query.empresa_id, true),
  }

  useEffect(() => {
    document.title = 'Permissões — Copiloto de Ponto'
  }, [])

  const linkPerfil = (perfil: Perfil) => (perfil === 'admin' ? '/admin/equipe' : `/configuracao/usuarios?perfil=${perfil}`)
  const textoTotal = (perfil: Perfil, total: number | null) => {
    if (total == null) return perfil === 'admin' ? 'Ver equipe' : 'Ver usuários'
    if (perfil === 'admin') return `${total} ${total === 1 ? 'membro ativo' : 'membros ativos'}`
    return `${total} ${total === 1 ? 'usuário ativo' : 'usuários ativos'}`
  }

  return (
    <section className="pagina perm">
      <header className="pagina-header-linha">
        <div className="pagina-header">
          <h1>Permissões</h1>
          <p className="pagina-sub">O que cada perfil pode fazer no Copiloto de Ponto.</p>
        </div>
        <Link to="/configuracao/usuarios" className="btn-primary btn-compact">
          Gerenciar usuários
        </Link>
      </header>

      <ul className="perm-perfis">
        {PERFIS.map((perfil) => (
          <li key={perfil} className={`perm-perfil perm-perfil-${perfil}`}>
            <div className="perm-perfil-topo">
              <span className="perm-perfil-icone" aria-hidden="true">
                <IconeEscudo tamanho={20} />
              </span>
              <h2>{NOME_PERFIL[perfil]}</h2>
            </div>
            <p>{RESUMO_PERFIL[perfil]}</p>
            {(perfil !== 'admin' || ehEquipe) && (
              <Link to={linkPerfil(perfil)} className="perm-perfil-link">
                <IconeUsuarios tamanho={16} />
                {textoTotal(perfil, totais[perfil])}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className="perm-card">
        <div className="perm-tabela-rolagem">
          <table className="perm-tabela">
            <caption className="sr-only">Permissões por perfil</caption>
            <thead>
              <tr>
                <th scope="col">Área</th>
                {PERFIS.map((perfil) => (
                  <th key={perfil} scope="col">
                    {NOME_PERFIL[perfil]}
                  </th>
                ))}
              </tr>
            </thead>
            {MATRIZ.map(({ grupo, linhas }) => (
              <tbody key={grupo}>
                <tr className="perm-grupo">
                  <th scope="rowgroup" colSpan={PERFIS.length + 1}>
                    {grupo}
                  </th>
                </tr>
                {linhas.map((linha) => (
                  <tr key={linha.area}>
                    <th scope="row">
                      <span className="perm-area">{linha.area}</span>
                      <span className="perm-area-desc">{linha.descricao}</span>
                    </th>
                    {PERFIS.map((perfil) => (
                      <td key={perfil} data-perfil={NOME_PERFIL[perfil]}>
                        <CelulaPermissao celula={linha.perfis[perfil]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="perm-nota">
          Os perfis são definidos pelo sistema. Para mudar o que uma pessoa pode fazer, altere o perfil dela — e, para
          gestores, as unidades vinculadas — em <Link to="/configuracao/usuarios">Usuários</Link>.
          {ehEquipe && (
            <>
              {' '}
              A equipe Scale IA é gerenciada em <Link to="/admin/equipe">Administração › Equipe</Link>.
            </>
          )}
        </p>
      </div>
    </section>
  )
}
