import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEmpresaSelecionada } from '../../context/EmpresaAdminContext'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { ModalSenhaTemporaria } from '../../components/ModalSenhaTemporaria'
import { PilulaAtivo } from '../../components/PilulaStatus'
import { api } from '../../lib/api'
import { mensagemDeErro } from '../../lib/erros'
import { formatarDataHora } from '../../lib/formato'
import { NOME_PERFIL } from '../../lib/preferencias'
import { useRecurso } from '../../lib/useRecurso'
import type { ClienteAdmin, Paginado, PerfilCliente, UnidadeAdmin } from '../../types/api'
import { ModalUsuario } from './ModalUsuario'

const POR_PAGINA = 20

type Modal =
  | { tipo: 'criar' }
  | { tipo: 'editar'; usuario: ClienteAdmin }
  | { tipo: 'redefinir'; usuario: ClienteAdmin }
  | { tipo: 'desativar'; usuario: ClienteAdmin }
  | { tipo: 'senha'; nome: string; senha: string }
  | null

/* Usuários das empresas clientes (RH e gestores). A equipe Scale IA fica em Administração > Equipe. */
export function Usuarios() {
  const { usuario: eu } = useAuth()
  const { empresaId, ehAdmin, query } = useEmpresaSelecionada()
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [params] = useSearchParams()
  // a tela de Permissões abre esta lista já filtrada por perfil (?perfil=gestor)
  const [perfil, setPerfil] = useState<PerfilCliente | ''>(() => {
    const inicial = params.get('perfil')
    return inicial === 'rh' || inicial === 'gestor' ? inicial : ''
  })
  const [ativo, setAtivo] = useState<'' | 'true' | 'false'>('')
  const [unidadeId, setUnidadeId] = useState('')
  const [pagina, setPagina] = useState(1)
  const [modal, setModal] = useState<Modal>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

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
    perfil,
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

  // ids de clientes e da equipe podem coincidir: "sou eu" só vale para quem também é cliente
  const ehEu = (usuario: ClienteAdmin) => eu?.tipo === 'cliente' && usuario.id === eu.id

  function mudarFiltro(aplicar: () => void) {
    aplicar()
    setPagina(1)
  }

  async function alterarAtivo(usuario: ClienteAdmin, valor: boolean) {
    await api(`/clientes/${usuario.id}`, { method: 'PATCH', json: { ativo: valor } })
    setMensagem({ tipo: 'ok', texto: `${usuario.nome} ${valor ? 'reativado' : 'desativado'}.` })
    lista.recarregar()
  }

  async function reativar(usuario: ClienteAdmin) {
    try {
      await alterarAtivo(usuario, true)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) })
    }
  }

  const totalPaginas = lista.dados ? Math.max(1, Math.ceil(lista.dados.total / POR_PAGINA)) : 1
  const temFiltro = Boolean(buscaAplicada || perfil || ativo || unidadeId)

  const acoes = (usuario: ClienteAdmin) => (
    <>
      <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'editar', usuario })} aria-label={`Editar ${usuario.nome}`}>
        Editar
      </button>
      <button
        type="button"
        className="btn-link"
        onClick={() => setModal({ tipo: 'redefinir', usuario })}
        aria-label={`Redefinir senha de ${usuario.nome}`}
      >
        Redefinir senha
      </button>
      {!ehEu(usuario) &&
        (usuario.ativo ? (
          <button
            type="button"
            className="btn-link btn-link-danger"
            onClick={() => setModal({ tipo: 'desativar', usuario })}
            aria-label={`Desativar ${usuario.nome}`}
          >
            Desativar
          </button>
        ) : (
          <button type="button" className="btn-link" onClick={() => reativar(usuario)} aria-label={`Reativar ${usuario.nome}`}>
            Reativar
          </button>
        ))}
    </>
  )

  const nomesUnidades = (usuario: ClienteAdmin) =>
    usuario.perfil !== 'gestor'
      ? 'Todas da empresa'
      : usuario.unidades.map((unidade) => unidade.nome_exibicao ?? `#${unidade.id}`).join(', ') || 'Nenhuma'

  return (
    <section className="pagina">
      <header className="pagina-header-linha">
        <div className="pagina-header">
          <h1>Usuários</h1>
          <p className="pagina-sub">Cadastre, edite e desative o RH e os gestores da empresa, e defina as unidades de cada gestor.</p>
        </div>
        <button type="button" className="btn-primary btn-compact" onClick={() => setModal({ tipo: 'criar' })}>
          Novo usuário
        </button>
      </header>

      {mensagem && (
        <p className={mensagem.tipo === 'ok' ? 'form-ok' : 'form-erro'} role={mensagem.tipo === 'ok' ? 'status' : 'alert'}>
          {mensagem.texto}
        </p>
      )}

      <div className="filtros-admin" role="group" aria-label="Filtros">
        <div className="field" style={{ flexBasis: 240 }}>
          <label htmlFor="busca-usuario">Buscar</label>
          <input
            id="busca-usuario"
            type="search"
            placeholder="Nome, e-mail ou CPF"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="filtro-perfil">Perfil</label>
          <select
            id="filtro-perfil"
            value={perfil}
            onChange={(event) => mudarFiltro(() => setPerfil(event.target.value as PerfilCliente | ''))}
          >
            <option value="">Todos</option>
            <option value="gestor">{NOME_PERFIL.gestor}</option>
            <option value="rh">{NOME_PERFIL.rh}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="filtro-ativo">Situação</label>
          <select id="filtro-ativo" value={ativo} onChange={(event) => mudarFiltro(() => setAtivo(event.target.value as typeof ativo))}>
            <option value="">Todas</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="filtro-unidade-usuario">Unidade</label>
          <select id="filtro-unidade-usuario" value={unidadeId} onChange={(event) => mudarFiltro(() => setUnidadeId(event.target.value))}>
            <option value="">Todas</option>
            {unidadesVinculaveis.map((unidade) => (
              <option key={unidade.id} value={unidade.id}>
                {unidade.nome_exibicao}
              </option>
            ))}
          </select>
        </div>
      </div>

      {lista.carregando && <Carregando texto="Carregando usuários..." />}
      {lista.erro && <ErroCarregamento erro={lista.erro} onTentarDeNovo={lista.recarregar} />}

      {lista.dados && lista.dados.itens.length === 0 && (
        <EstadoVazio titulo={temFiltro || pagina > 1 ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}>
          {pagina > 1 ? (
            <button type="button" className="btn-link" onClick={() => setPagina(1)}>
              Voltar para a primeira página
            </button>
          ) : (
            temFiltro && <p>Ajuste a busca ou os filtros.</p>
          )}
        </EstadoVazio>
      )}

      {lista.dados && lista.dados.itens.length > 0 && (
        <>
          <div className="card card-tabela tabela-desktop">
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Usuários</caption>
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Perfil</th>
                    <th scope="col">Unidades</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Último acesso</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lista.dados.itens.map((usuario) => (
                    <tr key={usuario.id} className={usuario.ativo ? undefined : 'linha-inativa'}>
                      <th scope="row">
                        {usuario.nome}
                        <span className="celula-sub">{[usuario.email, usuario.cpf_mascarado].filter(Boolean).join(' · ')}</span>
                      </th>
                      <td>{NOME_PERFIL[usuario.perfil]}</td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>{nomesUnidades(usuario)}</td>
                      <td>
                        <PilulaAtivo ativo={usuario.ativo} />
                        {usuario.deve_trocar_senha && <span className="celula-sub">Senha temporária</span>}
                      </td>
                      <td>{usuario.ultimo_login_em ? formatarDataHora(usuario.ultimo_login_em) : 'Nunca'}</td>
                      <td className="table-actions">{acoes(usuario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="cartoes-admin">
            {lista.dados.itens.map((usuario) => (
              <li key={usuario.id} className={usuario.ativo ? 'cartao-admin' : 'cartao-admin inativo'}>
                <div className="cartao-admin-topo">
                  <span className="cartao-admin-titulo">
                    {usuario.nome}
                    <span className="celula-sub">{[usuario.email, usuario.cpf_mascarado].filter(Boolean).join(' · ')}</span>
                  </span>
                  <PilulaAtivo ativo={usuario.ativo} />
                </div>
                <span>
                  {NOME_PERFIL[usuario.perfil]} · {nomesUnidades(usuario)}
                </span>
                <div className="barra-acoes">{acoes(usuario)}</div>
              </li>
            ))}
          </ul>

          <nav className="paginacao" aria-label="Paginação">
            <span>
              {lista.dados.total} usuário{lista.dados.total === 1 ? '' : 's'} · página {pagina} de {totalPaginas}
            </span>
            <div className="barra-acoes">
              <button type="button" className="btn-secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </nav>
        </>
      )}

      {(modal?.tipo === 'criar' || modal?.tipo === 'editar') && (
        <ModalUsuario
          usuario={modal.tipo === 'editar' ? modal.usuario : null}
          empresaId={empresaId}
          ehAdmin={ehAdmin}
          ehProprio={modal.tipo === 'editar' && ehEu(modal.usuario)}
          unidades={unidadesVinculaveis}
          onFechar={() => setModal(null)}
          onSalvo={(resultado) => {
            lista.recarregar()
            if (resultado.senha) {
              setModal({ tipo: 'senha', nome: resultado.nome, senha: resultado.senha })
              setMensagem({ tipo: 'ok', texto: `Usuário ${resultado.nome} criado.` })
            } else {
              setModal(null)
              setMensagem({ tipo: 'ok', texto: `Alterações de ${resultado.nome} salvas.` })
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

      {modal?.tipo === 'senha' && <ModalSenhaTemporaria nome={modal.nome} senha={modal.senha} onFechar={() => setModal(null)} />}
    </section>
  )
}
