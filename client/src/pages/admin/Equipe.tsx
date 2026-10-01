import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Campo } from '../../components/Campo'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { Modal } from '../../components/Modal'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { ModalSenhaTemporaria } from '../../components/ModalSenhaTemporaria'
import { PilulaAtivo } from '../../components/PilulaStatus'
import { ApiError, api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { cpfValido, EMAIL_VALIDO, formatarDataHora, mascararCpfEntrada } from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { ContaCriada, MembroEquipe, Paginado } from '../../types/api'

const POR_PAGINA = 20

type ModalAberto =
  | { tipo: 'criar' }
  | { tipo: 'editar'; membro: MembroEquipe }
  | { tipo: 'redefinir'; membro: MembroEquipe }
  | { tipo: 'desativar'; membro: MembroEquipe }
  | { tipo: 'senha'; nome: string; senha: string }
  | null

/* Equipe Scale IA: quem administra o sistema e enxerga todas as empresas. */
export function Equipe() {
  const { usuario: eu } = useAuth()
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [ativo, setAtivo] = useState<'' | 'true' | 'false'>('')
  const [pagina, setPagina] = useState(1)
  const [modal, setModal] = useState<ModalAberto>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    document.title = 'Equipe Scale IA — Copiloto de Ponto'
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [busca])

  const filtros = { busca: buscaAplicada, ativo, pagina, por_pagina: POR_PAGINA }
  const lista = useRecurso(
    (signal) => api<Paginado<MembroEquipe>>('/equipe', { signal, query: filtros }),
    `equipe-${JSON.stringify(filtros)}`,
  )

  const ehEu = (membro: MembroEquipe) => eu?.tipo === 'equipe' && membro.id === eu.id

  async function alterarAtivo(membro: MembroEquipe, valor: boolean) {
    await api(`/equipe/${membro.id}`, { method: 'PATCH', json: { ativo: valor } })
    setMensagem({ tipo: 'ok', texto: `${membro.nome} ${valor ? 'reativado' : 'desativado'}.` })
    lista.recarregar()
  }

  async function reativar(membro: MembroEquipe) {
    try {
      await alterarAtivo(membro, true)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) })
    }
  }

  const totalPaginas = lista.dados ? Math.max(1, Math.ceil(lista.dados.total / POR_PAGINA)) : 1
  const temFiltro = Boolean(buscaAplicada || ativo)

  const contato = (membro: MembroEquipe) => [membro.email, membro.cpf_mascarado].filter(Boolean).join(' · ')

  const acoes = (membro: MembroEquipe) => (
    <>
      <button type="button" className="btn-link" onClick={() => setModal({ tipo: 'editar', membro })} aria-label={`Editar ${membro.nome}`}>
        Editar
      </button>
      <button
        type="button"
        className="btn-link"
        onClick={() => setModal({ tipo: 'redefinir', membro })}
        aria-label={`Redefinir senha de ${membro.nome}`}
      >
        Redefinir senha
      </button>
      {!ehEu(membro) &&
        (membro.ativo ? (
          <button
            type="button"
            className="btn-link btn-link-danger"
            onClick={() => setModal({ tipo: 'desativar', membro })}
            aria-label={`Desativar ${membro.nome}`}
          >
            Desativar
          </button>
        ) : (
          <button type="button" className="btn-link" onClick={() => reativar(membro)} aria-label={`Reativar ${membro.nome}`}>
            Reativar
          </button>
        ))}
    </>
  )

  return (
    <section className="pagina">
      <header className="pagina-header-linha">
        <div className="pagina-header">
          <h1>Equipe Scale IA</h1>
          <p className="pagina-sub">Quem administra o Copiloto: acesso a todas as empresas, à Configuração e à Administração.</p>
        </div>
        <button type="button" className="btn-primary btn-compact" onClick={() => setModal({ tipo: 'criar' })}>
          Novo membro
        </button>
      </header>

      {mensagem && (
        <p className={mensagem.tipo === 'ok' ? 'form-ok' : 'form-erro'} role={mensagem.tipo === 'ok' ? 'status' : 'alert'}>
          {mensagem.texto}
        </p>
      )}

      <div className="filtros-admin" role="group" aria-label="Filtros">
        <div className="field" style={{ flexBasis: 240 }}>
          <label htmlFor="busca-equipe">Buscar</label>
          <input
            id="busca-equipe"
            type="search"
            placeholder="Nome, e-mail ou CPF"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="filtro-ativo-equipe">Situação</label>
          <select
            id="filtro-ativo-equipe"
            value={ativo}
            onChange={(event) => {
              setAtivo(event.target.value as typeof ativo)
              setPagina(1)
            }}
          >
            <option value="">Todas</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>
      </div>

      {lista.carregando && <Carregando texto="Carregando equipe..." />}
      {lista.erro && <ErroCarregamento erro={lista.erro} onTentarDeNovo={lista.recarregar} />}

      {lista.dados && lista.dados.itens.length === 0 && (
        <EstadoVazio titulo={temFiltro || pagina > 1 ? 'Ninguém encontrado' : 'Nenhum membro cadastrado'}>
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
                <caption className="sr-only">Equipe Scale IA</caption>
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Último acesso</th>
                    <th scope="col">Cadastrado em</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lista.dados.itens.map((membro) => (
                    <tr key={membro.id} className={membro.ativo ? undefined : 'linha-inativa'}>
                      <th scope="row">
                        {membro.nome}
                        {ehEu(membro) && ' (você)'}
                        <span className="celula-sub">{contato(membro)}</span>
                      </th>
                      <td>
                        <PilulaAtivo ativo={membro.ativo} />
                        {membro.deve_trocar_senha && <span className="celula-sub">Senha temporária</span>}
                      </td>
                      <td>{membro.ultimo_login_em ? formatarDataHora(membro.ultimo_login_em) : 'Nunca'}</td>
                      <td>{membro.criado_em ? formatarDataHora(membro.criado_em) : '—'}</td>
                      <td className="table-actions">{acoes(membro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="cartoes-admin">
            {lista.dados.itens.map((membro) => (
              <li key={membro.id} className={membro.ativo ? 'cartao-admin' : 'cartao-admin inativo'}>
                <div className="cartao-admin-topo">
                  <span className="cartao-admin-titulo">
                    {membro.nome}
                    {ehEu(membro) && ' (você)'}
                    <span className="celula-sub">{contato(membro)}</span>
                  </span>
                  <PilulaAtivo ativo={membro.ativo} />
                </div>
                <span>Último acesso: {membro.ultimo_login_em ? formatarDataHora(membro.ultimo_login_em) : 'nunca'}</span>
                <div className="barra-acoes">{acoes(membro)}</div>
              </li>
            ))}
          </ul>

          <nav className="paginacao" aria-label="Paginação">
            <span>
              {lista.dados.total} {lista.dados.total === 1 ? 'membro' : 'membros'} · página {pagina} de {totalPaginas}
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
        <ModalMembro
          membro={modal.tipo === 'editar' ? modal.membro : null}
          onFechar={() => setModal(null)}
          onSalvo={(resultado) => {
            lista.recarregar()
            if (resultado.senha) {
              setModal({ tipo: 'senha', nome: resultado.nome, senha: resultado.senha })
              setMensagem({ tipo: 'ok', texto: `${resultado.nome} adicionado à equipe.` })
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
            const { senha_temporaria } = await api<{ senha_temporaria: string }>(`/equipe/${modal.membro.id}/redefinir-senha`, {
              method: 'POST',
            })
            setModal({ tipo: 'senha', nome: modal.membro.nome, senha: senha_temporaria })
            lista.recarregar()
          }}
        >
          <p>
            A senha atual de <strong>{modal.membro.nome}</strong> deixa de funcionar e uma senha temporária é gerada. No
            próximo acesso a pessoa define uma nova senha.
          </p>
        </ModalConfirmacao>
      )}

      {modal?.tipo === 'desativar' && (
        <ModalConfirmacao
          titulo="Desativar membro da equipe"
          rotuloConfirmar="Desativar"
          perigo
          onFechar={() => setModal(null)}
          onConfirmar={async () => {
            await alterarAtivo(modal.membro, false)
            setModal(null)
          }}
        >
          <p>
            <strong>{modal.membro.nome}</strong> perde o acesso imediatamente. Você pode reativar depois.
          </p>
        </ModalConfirmacao>
      )}

      {modal?.tipo === 'senha' && <ModalSenhaTemporaria nome={modal.nome} senha={modal.senha} onFechar={() => setModal(null)} />}
    </section>
  )
}

interface ModalMembroProps {
  membro: MembroEquipe | null
  onFechar: () => void
  onSalvo: (resultado: { nome: string; senha?: string }) => void
}

function ModalMembro({ membro, onFechar, onSalvo }: ModalMembroProps) {
  const editando = membro !== null
  const [nome, setNome] = useState(membro?.nome ?? '')
  const [email, setEmail] = useState(membro?.email ?? '')
  const [cpf, setCpf] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)

  function validar() {
    const saida: Record<string, string> = {}
    if (nome.trim().length < 2) saida.nome = 'Informe o nome (mín. 2 caracteres).'
    if (email.trim() && !EMAIL_VALIDO.test(email.trim())) saida.email = 'E-mail inválido.'
    if (cpf && !cpfValido(cpf)) saida.cpf = 'CPF inválido.'
    const temCpf = Boolean(cpf) || Boolean(membro?.cpf_mascarado)
    if (!email.trim() && !temCpf) saida.email = 'Informe e-mail ou CPF (usados para entrar).'
    return saida
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const locais = validar()
    setErros(locais)
    setErroGeral('')
    if (Object.keys(locais).length) return

    const emailLimpo = email.trim() || null
    const cpfDigitos = cpf.replace(/\D/g, '') || null
    setEnviando(true)
    try {
      if (!membro) {
        const criado = await api<ContaCriada<MembroEquipe>>('/equipe', {
          method: 'POST',
          json: { nome: nome.trim(), email: emailLimpo, cpf: cpfDigitos },
        })
        return onSalvo({ nome: nome.trim(), senha: criado.senha_temporaria })
      }

      const alteracoes: Record<string, unknown> = {}
      if (nome.trim() !== membro.nome) alteracoes.nome = nome.trim()
      if (emailLimpo !== membro.email) alteracoes.email = emailLimpo
      if (cpfDigitos) alteracoes.cpf = cpfDigitos
      if (Object.keys(alteracoes).length) {
        await api(`/equipe/${membro.id}`, { method: 'PATCH', json: alteracoes })
      }
      onSalvo({ nome: nome.trim() })
    } catch (e) {
      const campos = errosDeCampos(e)
      if (e instanceof ApiError && !e.campos && /cpf/i.test(e.message)) campos.cpf = e.message
      setErros(campos)
      setErroGeral(Object.keys(campos).length && e instanceof ApiError && e.status === 400 ? '' : mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={editando ? `Editar ${membro.nome}` : 'Novo membro da equipe'} onFechar={onFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <Campo rotulo="Nome" erro={erros.nome}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={nome}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => setNome(event.target.value)}
              data-autofoco
            />
          )}
        </Campo>
        <Campo rotulo="E-mail" erro={erros.email} ajuda="Usado para entrar. Opcional se houver CPF.">
          {(props) => (
            <input {...props} type="email" value={email} autoComplete="off" onChange={(event) => setEmail(event.target.value)} />
          )}
        </Campo>
        <Campo
          rotulo="CPF"
          erro={erros.cpf}
          ajuda={membro?.cpf_mascarado ? `Atual: ${membro.cpf_mascarado}. Deixe em branco para manter.` : 'Também pode ser usado para entrar.'}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              autoComplete="off"
              onChange={(event) => setCpf(mascararCpfEntrada(event.target.value))}
            />
          )}
        </Campo>

        {!editando && (
          <p className="modal-texto">
            O novo membro terá acesso a todas as empresas. Uma senha temporária será gerada e exibida uma única vez ao salvar.
          </p>
        )}
        {erroGeral && (
          <p className="form-erro" role="alert">
            {erroGeral}
          </p>
        )}
        <div className="form-acoes">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Adicionar à equipe'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
