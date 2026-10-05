import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento } from '../../components/Estados'
import { IconeCheck, IconeEscudo, IconeLapis, IconeLixeira, IconeMais, IconeMenos, IconeUsuarios } from '../../components/Icones'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { alertarSucesso } from '../../lib/alertas'
import { api } from '../../lib/api'
import { SECOES_TELAS, TELAS } from '../../lib/telas'
import { useRecurso } from '../../lib/useRecurso'
import type { GrupoPermissao } from '../../types/api'
import { ModalGrupo } from './ModalGrupo'
import './permissoes.css'
import { TituloPagina } from '../../components/TituloPagina'

type Modal = { tipo: 'criar' } | { tipo: 'editar'; grupo: GrupoPermissao } | { tipo: 'excluir'; grupo: GrupoPermissao } | null

const ROTULO_ALCANCE = { empresa: 'Toda a empresa', unidades: 'Unidades vinculadas' } as const

/* Grupos de permissão da empresa: cada grupo libera um conjunto de telas e define se os
   usuários veem a empresa toda ou só as unidades vinculadas. RH e Gestor são os grupos
   padrão (editáveis, não excluíveis). A equipe Scale IA tem acesso total e fica fora. */
export function Permissoes() {
  const { perfil } = useAuth()
  const { empresaId, query } = useEmpresaSelecionada()
  const ehEquipe = perfil === 'admin'
  const [modal, setModal] = useState<Modal>(null)

  const grupos = useRecurso(
    (signal) => api<GrupoPermissao[]>('/permissoes/grupos', { signal, query }),
    `grupos-permissao-${empresaId}`,
  )

  useEffect(() => {
    document.title = 'Permissões — Copiloto de Ponto'
  }, [])

  const lista = grupos.dados ?? []

  return (
    <section className="pagina perm">
      <TituloPagina>Permissões</TituloPagina>
      <header className="pagina-header-linha">
        <p className="pagina-sub">Crie grupos de permissão e escolha as telas que cada grupo pode acessar.</p>
        <div className="perm-acoes-topo">
          <Link to="/configuracao/usuarios" className="btn-secondary btn-compact">
            Gerenciar usuários
          </Link>
          <button type="button" className="btn-primary btn-compact perm-novo" onClick={() => setModal({ tipo: 'criar' })}>
            <IconeMais tamanho={16} />
            Novo grupo
          </button>
        </div>
      </header>

      {grupos.carregando && !grupos.dados ? (
        <Carregando texto="Carregando grupos..." />
      ) : grupos.erro ? (
        <ErroCarregamento erro={grupos.erro} onTentarDeNovo={grupos.recarregar} />
      ) : (
        <>
          <ul className="perm-perfis">
            <li className="perm-perfil perm-perfil-admin">
              <div className="perm-perfil-topo">
                <span className="perm-perfil-icone" aria-hidden="true">
                  <IconeEscudo tamanho={20} />
                </span>
                <h2>Equipe Scale IA</h2>
              </div>
              <p>Time da Scale IA: acesso total a todas as empresas, à Configuração e à Administração. Não muda por grupo.</p>
              {ehEquipe && (
                <Link to="/admin/equipe" className="perm-perfil-link">
                  <IconeUsuarios tamanho={16} />
                  Ver equipe
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </li>

            {lista.map((grupo) => (
              <li key={grupo.id} className="perm-perfil">
                <div className="perm-perfil-topo">
                  <span className="perm-perfil-icone" aria-hidden="true">
                    <IconeEscudo tamanho={20} />
                  </span>
                  <h2>{grupo.nome}</h2>
                  <span className="perm-etiquetas">
                    {grupo.padrao && <span className="perm-etiqueta">Padrão</span>}
                    {grupo.proprio && <span className="perm-etiqueta perm-etiqueta-voce">Seu grupo</span>}
                  </span>
                  {grupo.pode_editar && (
                    <span className="perm-grupo-acoes">
                      <button
                        type="button"
                        className="perm-icone-botao"
                        onClick={() => setModal({ tipo: 'editar', grupo })}
                        aria-label={`Editar ${grupo.nome}`}
                        title="Editar"
                      >
                        <IconeLapis tamanho={16} />
                      </button>
                      {!grupo.padrao && (
                        <button
                          type="button"
                          className="perm-icone-botao perigo"
                          onClick={() => setModal({ tipo: 'excluir', grupo })}
                          aria-label={`Excluir ${grupo.nome}`}
                          title="Excluir"
                        >
                          <IconeLixeira tamanho={16} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {grupo.descricao && <p>{grupo.descricao}</p>}
                <p className="perm-resumo">
                  {ROTULO_ALCANCE[grupo.alcance]} · {grupo.telas.length} {grupo.telas.length === 1 ? 'tela' : 'telas'}
                </p>
                <Link to={`/configuracao/usuarios?grupo=${grupo.id}`} className="perm-perfil-link">
                  <IconeUsuarios tamanho={16} />
                  {grupo.usuarios} {grupo.usuarios === 1 ? 'usuário' : 'usuários'}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="perm-card">
            <div className="perm-tabela-rolagem">
              <table className="perm-tabela">
                <caption className="sr-only">Telas liberadas por grupo de permissão</caption>
                <thead>
                  <tr>
                    <th scope="col">Tela</th>
                    <th scope="col">Equipe Scale IA</th>
                    {lista.map((grupo) => (
                      <th key={grupo.id} scope="col">
                        {grupo.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                {SECOES_TELAS.map((secao) => (
                  <tbody key={secao}>
                    <tr className="perm-grupo">
                      <th scope="rowgroup" colSpan={lista.length + 2}>
                        {secao}
                      </th>
                    </tr>
                    {TELAS.filter((tela) => tela.secao === secao).map((tela) => (
                      <tr key={tela.id}>
                        <th scope="row">
                          <span className="perm-area">{tela.rotulo}</span>
                          <span className="perm-area-desc">{tela.descricao}</span>
                        </th>
                        <td data-perfil="Equipe Scale IA">
                          <Marca liberada total />
                        </td>
                        {lista.map((grupo) => (
                          <td key={grupo.id} data-perfil={grupo.nome}>
                            <Marca liberada={grupo.telas.includes(tela.id)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="perm-nota">
              O alcance do grupo define as unidades: <strong>toda a empresa</strong> ou só as <strong>unidades vinculadas</strong>{' '}
              a cada usuário (marcadas em <Link to="/configuracao/usuarios">Usuários</Link>). Ninguém libera telas que o próprio
              grupo não tem, nem altera o grupo ao qual pertence.
            </p>
          </div>
        </>
      )}

      {(modal?.tipo === 'criar' || modal?.tipo === 'editar') && (
        <ModalGrupo
          grupo={modal.tipo === 'editar' ? modal.grupo : null}
          query={query}
          onFechar={() => setModal(null)}
          onSalvo={(salvo) => {
            alertarSucesso(modal.tipo === 'editar' ? `Grupo ${salvo.nome} salvo.` : `Grupo ${salvo.nome} criado.`)
            setModal(null)
            grupos.recarregar()
          }}
        />
      )}

      {modal?.tipo === 'excluir' && (
        <ModalConfirmacao
          titulo="Excluir grupo"
          rotuloConfirmar="Excluir grupo"
          perigo
          onFechar={() => setModal(null)}
          onConfirmar={async () => {
            await api(`/permissoes/grupos/${modal.grupo.id}`, { method: 'DELETE' })
            alertarSucesso(`Grupo ${modal.grupo.nome} excluído.`)
            setModal(null)
            grupos.recarregar()
          }}
        >
          {modal.grupo.usuarios > 0 ? (
            <p>
              <strong>{modal.grupo.nome}</strong> tem {modal.grupo.usuarios} {modal.grupo.usuarios === 1 ? 'usuário' : 'usuários'}.
              Mova {modal.grupo.usuarios === 1 ? 'ele' : 'eles'} para outro grupo em Usuários antes de excluir.
            </p>
          ) : (
            <p>
              O grupo <strong>{modal.grupo.nome}</strong> será apagado. Essa ação não pode ser desfeita.
            </p>
          )}
        </ModalConfirmacao>
      )}
    </section>
  )
}

function Marca({ liberada, total = false }: { liberada: boolean; total?: boolean }) {
  const nivel = !liberada ? 'nenhum' : total ? 'total' : 'parcial'
  return (
    <span className={`perm-celula perm-${nivel}`}>
      <span className="perm-marca" aria-hidden="true">
        {liberada ? <IconeCheck tamanho={14} /> : <IconeMenos tamanho={14} />}
      </span>
      <span className="sr-only">{liberada ? 'Liberada' : 'Sem acesso'}</span>
    </span>
  )
}
