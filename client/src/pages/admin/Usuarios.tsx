import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { ModalSenhaTemporaria } from '../../components/ModalSenhaTemporaria'
import { IconeBloqueio, IconeChave, IconeCheck, IconeLapis, IconeLixeira, IconeMais } from '../../components/Icones'
import { api } from '../../lib/api'
import { alertarFalha, alertarSucesso } from '../../lib/alertas'
import { useRecurso } from '../../lib/useRecurso'
import type { ClienteAdmin, GrupoPermissao, Paginado, UnidadeAdmin } from '../../types/api'
import {
  BarraPessoas,
  CartaoPessoas,
  ContatoPessoa,
  EtiquetasUnidades,
  FiltroPessoas,
  MenuAcoesPessoa,
  PaginacaoPessoas,
  Pessoa,
  Situacao,
  UltimoAcesso,
  type AcaoPessoa,
} from './ListaPessoas'
import { ModalUsuario } from './ModalUsuario'
import { TituloPagina } from '../../components/TituloPagina'

const POR_PAGINA = 20

type Modal =
  | { tipo: 'criar' }
  | { tipo: 'editar'; usuario: ClienteAdmin }
  | { tipo: 'redefinir'; usuario: ClienteAdmin }
  | { tipo: 'desativar'; usuario: ClienteAdmin }
  | { tipo: 'excluir'; usuario: ClienteAdmin }
  | { tipo: 'senha'; nome: string; senha: string }
  | null

/* Usuários das empresas clientes, cada um num grupo de permissão (Configuração → Permissões).
   A equipe Scale IA fica em Administração › Usuários gestão. */
export function Usuarios() {
  const { usuario: eu } = useAuth()
  const { empresaId, ehAdmin, query } = useEmpresaSelecionada()
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [params] = useSearchParams()
  // a tela de Permissões abre esta lista já filtrada por grupo (?grupo=12)
  const [grupoId, setGrupoId] = useState(() => (/^\d+$/.test(params.get('grupo') ?? '') ? params.get('grupo')! : ''))
  const [ativo, setAtivo] = useState<'' | 'true' | 'false'>('')
  const [unidadeId, setUnidadeId] = useState('')
  const [pagina, setPagina] = useState(1)
  const [modal, setModal] = useState<Modal>(null)

  useEffect(() => {
    document.title = 'Usuários — Copiloto de Ponto'
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [busca])

  const filtros = {
    busca: buscaAplicada,
    grupo_id: grupoId,
    ativo,
    unidade_id: unidadeId,
    empresa_id: query.empresa_id,
    pagina,
    por_pagina: POR_PAGINA,
  }
  const lista = useRecurso(
    (signal) => api<Paginado<ClienteAdmin>>('/clientes', { signal, query: filtros }),
    `clientes-${JSON.stringify(filtros)}`,
  )
  const unidades = useRecurso(
    (signal) => api<UnidadeAdmin[]>('/admin/unidades', { signal, query }),
    `unidades-admin-${empresaId}`,
  )
  const unidadesVinculaveis = (unidades.dados ?? []).filter((unidade) => unidade.nome_exibicao)
  const grupos = useRecurso(
    (signal) => api<GrupoPermissao[]>('/permissoes/grupos', { signal, query }),
    `grupos-permissao-${empresaId}`,
  )
  const listaGrupos = grupos.dados ?? []
  // grupos em que quem está vendo pode mexer (o server confere de novo)
  const gruposEditaveis = new Set(listaGrupos.filter((grupo) => grupo.pode_editar).map((grupo) => grupo.id))

  // ids de clientes e da equipe podem coincidir: "sou eu" só vale para quem também é cliente
  const ehEu = (usuario: ClienteAdmin) => eu?.tipo === 'cliente' && usuario.id === eu.id

  function mudarFiltro(aplicar: () => void) {
    aplicar()
    setPagina(1)
  }

  async function alterarAtivo(usuario: ClienteAdmin, valor: boolean) {
    await api(`/clientes/${usuario.id}`, { method: 'PATCH', json: { ativo: valor } })
    alertarSucesso(`${usuario.nome} ${valor ? 'reativado' : 'desativado'}.`)
    lista.recarregar()
  }

  async function reativar(usuario: ClienteAdmin) {
    try {
      await alterarAtivo(usuario, true)
    } catch (e) {
      alertarFalha(e)
    }
  }

  const totalPaginas = lista.dados ? Math.max(1, Math.ceil(lista.dados.total / POR_PAGINA)) : 1
  const temFiltro = Boolean(buscaAplicada || grupoId || ativo || unidadeId)

  // cada um gerencia a própria conta e os usuários de grupos que não passam do dele (o server confere)
  const podeGerenciar = (usuario: ClienteAdmin) => ehAdmin || ehEu(usuario) || gruposEditaveis.has(usuario.grupo.id)

  const acoes = (usuario: ClienteAdmin): AcaoPessoa[] => (podeGerenciar(usuario) ? acoesDe(usuario) : [])

  const acoesDe = (usuario: ClienteAdmin): AcaoPessoa[] => [
    { rotulo: 'Editar', icone: <IconeLapis tamanho={17} />, onClick: () => setModal({ tipo: 'editar', usuario }) },
    { rotulo: 'Redefinir senha', icone: <IconeChave tamanho={17} />, onClick: () => setModal({ tipo: 'redefinir', usuario }) },
    usuario.ativo
      ? {
          rotulo: 'Desativar',
          icone: <IconeBloqueio tamanho={17} />,
          onClick: () => setModal({ tipo: 'desativar', usuario }),
          oculta: ehEu(usuario),
        }
      : { rotulo: 'Reativar', icone: <IconeCheck tamanho={17} />, onClick: () => reativar(usuario) },
    {
      rotulo: 'Excluir',
      icone: <IconeLixeira tamanho={17} />,
      onClick: () => setModal({ tipo: 'excluir', usuario }),
      perigo: true,
      oculta: ehEu(usuario),
    },
  ]

  // embaixo do nome: cargo; sem cargo, o e-mail (nos cartões do celular não há coluna de contato)
  const subtitulo = (usuario: ClienteAdmin) => usuario.cargo ?? usuario.email ?? undefined
  const nomesUnidades = (usuario: ClienteAdmin) => usuario.unidades.map((unidade) => unidade.nome_exibicao ?? `#${unidade.id}`)
  const itens = lista.dados?.itens ?? []

  return (
    <section className="pagina">
      <TituloPagina>Usuários</TituloPagina>
      <header className="pessoas-topo">
        <p>Cadastre os usuários da empresa, escolha o grupo de permissão de cada um e as unidades que ele acompanha.</p>
        <button type="button" className="pessoas-novo" onClick={() => setModal({ tipo: 'criar' })}>
          <IconeMais tamanho={18} />
          Novo usuário
        </button>
      </header>

      <CartaoPessoas>
        <BarraPessoas
          idBusca="busca-usuario"
          busca={busca}
          onBusca={setBusca}
          placeholder="Buscar por nome, e-mail ou CPF"
          contagem={lista.dados ? `${lista.dados.total} ${lista.dados.total === 1 ? 'usuário' : 'usuários'}` : undefined}
        >
          <FiltroPessoas rotulo="Grupo" valor={grupoId} onMudar={(valor) => mudarFiltro(() => setGrupoId(valor))}>
            <option value="">Todos</option>
            {listaGrupos.map((grupo) => (
              <option key={grupo.id} value={grupo.id}>
                {grupo.nome}
              </option>
            ))}
          </FiltroPessoas>
          <FiltroPessoas rotulo="Situação" valor={ativo} onMudar={(valor) => mudarFiltro(() => setAtivo(valor as typeof ativo))}>
            <option value="">Todas</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </FiltroPessoas>
          <FiltroPessoas rotulo="Unidade" valor={unidadeId} onMudar={(valor) => mudarFiltro(() => setUnidadeId(valor))}>
            <option value="">Todas</option>
            {unidadesVinculaveis.map((unidade) => (
              <option key={unidade.id} value={unidade.id}>
                {unidade.nome_exibicao}
              </option>
            ))}
          </FiltroPessoas>
        </BarraPessoas>

        {lista.carregando && (
          <div className="pessoas-estado">
            <Carregando texto="Carregando usuários..." />
          </div>
        )}
        {lista.erro && (
          <div className="pessoas-estado">
            <ErroCarregamento erro={lista.erro} onTentarDeNovo={lista.recarregar} />
          </div>
        )}

        {lista.dados && itens.length === 0 && (
          <div className="pessoas-estado">
            <EstadoVazio titulo={temFiltro || pagina > 1 ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}>
              {pagina > 1 ? (
                <button type="button" className="btn-link" onClick={() => setPagina(1)}>
                  Voltar para a primeira página
                </button>
              ) : temFiltro ? (
                <p>Ajuste a busca ou os filtros.</p>
              ) : (
                <p>Use “Novo usuário” para cadastrar o RH e os gestores.</p>
              )}
            </EstadoVazio>
          </div>
        )}

        {itens.length > 0 && (
          <>
            <div className="table-wrap pessoas-tabela-wrap">
              <table className="pessoas-tabela">
                <caption className="sr-only">Usuários</caption>
                <thead>
                  <tr>
                    <th scope="col">Usuário</th>
                    <th scope="col">Contato</th>
                    <th scope="col">Grupo</th>
                    <th scope="col">Unidades</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Último acesso</th>
                    <th scope="col" className="coluna-acoes">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((usuario) => (
                    <tr key={usuario.id} className={usuario.ativo ? undefined : 'inativa'}>
                      <th scope="row">
                        <Pessoa nome={usuario.nome} sub={subtitulo(usuario)} voce={ehEu(usuario)} />
                      </th>
                      <td>
                        <ContatoPessoa email={usuario.email} telefone={usuario.telefone} cpf={usuario.cpf_mascarado} />
                      </td>
                      <td>
                        <EtiquetaGrupo usuario={usuario} />
                      </td>
                      <td>
                        <EtiquetasUnidades nomes={nomesUnidades(usuario)} todas={usuario.grupo.alcance === 'empresa'} />
                      </td>
                      <td>
                        <Situacao ativo={usuario.ativo} senhaTemporaria={usuario.deve_trocar_senha} />
                      </td>
                      <td>
                        <UltimoAcesso iso={usuario.ultimo_login_em} />
                      </td>
                      <td className="coluna-acoes">
                        <MenuAcoesPessoa nome={usuario.nome} acoes={acoes(usuario)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="pessoas-cartoes">
              {itens.map((usuario) => (
                <li key={usuario.id} className={usuario.ativo ? 'pessoas-cartao' : 'pessoas-cartao inativa'}>
                  <div className="pessoas-cartao-topo">
                    <Pessoa nome={usuario.nome} sub={subtitulo(usuario)} voce={ehEu(usuario)} />
                    <MenuAcoesPessoa nome={usuario.nome} acoes={acoes(usuario)} />
                  </div>
                  <div className="pessoas-cartao-info">
                    <EtiquetaGrupo usuario={usuario} />
                    <Situacao ativo={usuario.ativo} senhaTemporaria={usuario.deve_trocar_senha} />
                    <UltimoAcesso iso={usuario.ultimo_login_em} />
                  </div>
                  {usuario.grupo.alcance === 'unidades' && (
                    <div className="pessoas-cartao-info">
                      <EtiquetasUnidades nomes={nomesUnidades(usuario)} max={3} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <PaginacaoPessoas pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} />
      </CartaoPessoas>

      {(modal?.tipo === 'criar' || modal?.tipo === 'editar') && (
        <ModalUsuario
          usuario={modal.tipo === 'editar' ? modal.usuario : null}
          empresaId={empresaId}
          ehAdmin={ehAdmin}
          ehProprio={modal.tipo === 'editar' && ehEu(modal.usuario)}
          unidades={unidadesVinculaveis}
          grupos={listaGrupos}
          onFechar={() => setModal(null)}
          onSalvo={(resultado) => {
            lista.recarregar()
            if (resultado.senha) {
              setModal({ tipo: 'senha', nome: resultado.nome, senha: resultado.senha })
              alertarSucesso(`Usuário ${resultado.nome} criado.`)
            } else {
              setModal(null)
              alertarSucesso(`Alterações de ${resultado.nome} salvas.`)
            }
          }}
        />
      )}

      {modal?.tipo === 'redefinir' && (
        <ModalConfirmacao
          titulo="Redefinir senha"
          rotuloConfirmar="Gerar nova senha"
          onFechar={() => setModal(null)}
          onConfirmar={async () => {
            const { senha_temporaria } = await api<{ senha_temporaria: string }>(`/clientes/${modal.usuario.id}/redefinir-senha`, {
              method: 'POST',
            })
            setModal({ tipo: 'senha', nome: modal.usuario.nome, senha: senha_temporaria })
            lista.recarregar()
          }}
        >
          <p>
            A senha atual de <strong>{modal.usuario.nome}</strong> deixa de funcionar e uma senha temporária é gerada. No
            próximo acesso a pessoa define uma nova senha.
          </p>
        </ModalConfirmacao>
      )}

      {modal?.tipo === 'desativar' && (
        <ModalConfirmacao
          titulo="Desativar usuário"
          rotuloConfirmar="Desativar"
          perigo
          onFechar={() => setModal(null)}
          onConfirmar={async () => {
            await alterarAtivo(modal.usuario, false)
            setModal(null)
          }}
        >
          <p>
            <strong>{modal.usuario.nome}</strong> perde o acesso imediatamente. Você pode reativar depois.
          </p>
        </ModalConfirmacao>
      )}

      {modal?.tipo === 'excluir' && (
        <ModalConfirmacao
          titulo="Excluir usuário"
          rotuloConfirmar="Excluir definitivamente"
          perigo
          onFechar={() => setModal(null)}
          onConfirmar={async () => {
            await api(`/clientes/${modal.usuario.id}`, { method: 'DELETE' })
            alertarSucesso(`${modal.usuario.nome} foi excluído.`)
            setModal(null)
            lista.recarregar()
          }}
        >
          <p>
            <strong>{modal.usuario.nome}</strong> perde o acesso e o cadastro é apagado. Essa ação não pode ser desfeita.
          </p>
          <p>Se for só bloquear o acesso por um tempo, prefira <strong>Desativar</strong>.</p>
        </ModalConfirmacao>
      )}

      {modal?.tipo === 'senha' && <ModalSenhaTemporaria nome={modal.nome} senha={modal.senha} onFechar={() => setModal(null)} />}
    </section>
  )
}

/** Nome do grupo, na cor do alcance (empresa toda x unidades vinculadas). */
function EtiquetaGrupo({ usuario }: { usuario: ClienteAdmin }) {
  const alcance = usuario.grupo.alcance === 'empresa' ? 'Vê todas as unidades da empresa' : 'Vê só as unidades vinculadas'
  return (
    <span className={`perfil-tag perfil-tag-${usuario.perfil}`} title={`${alcance} · ${usuario.grupo.telas.length} telas liberadas`}>
      {usuario.grupo.nome}
    </span>
  )
}
