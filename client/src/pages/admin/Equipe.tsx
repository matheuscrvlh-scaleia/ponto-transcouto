import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Campo } from '../../components/Campo'
import { Carregando, ErroCarregamento, EstadoVazio } from '../../components/Estados'
import { Modal } from '../../components/Modal'
import { ModalConfirmacao } from '../../components/ModalConfirmacao'
import { ModalSenhaTemporaria } from '../../components/ModalSenhaTemporaria'
import { IconeBloqueio, IconeChave, IconeCheck, IconeLapis, IconeLixeira, IconeMais } from '../../components/Icones'
import { ApiError, api } from '../../lib/api'
import { alertarFalha, alertarSucesso } from '../../lib/alertas'
import { errosDeCampos } from '../../lib/erros'
import {
  cpfValido,
  dataDoInstante,
  EMAIL_VALIDO,
  formatarData,
  formatarTelefone,
  mascararCpfEntrada,
  mascararTelefoneEntrada,
} from '../../lib/formato'
import { useRecurso } from '../../lib/useRecurso'
import type { ContaCriada, MembroEquipe, Paginado } from '../../types/api'
import { TituloPagina } from '../../components/TituloPagina'
import {
  BarraPessoas,
  CartaoPessoas,
  ContatoPessoa,
  FiltroPessoas,
  MenuAcoesPessoa,
  PaginacaoPessoas,
  Pessoa,
  Situacao,
  UltimoAcesso,
  type AcaoPessoa,
} from './ListaPessoas'
import { PreviaCadastro, SecaoCadastro } from './FormCadastro'

const POR_PAGINA = 20

type ModalAberto =
  | { tipo: 'criar' }
  | { tipo: 'editar'; membro: MembroEquipe }
  | { tipo: 'redefinir'; membro: MembroEquipe }
  | { tipo: 'desativar'; membro: MembroEquipe }
  | { tipo: 'excluir'; membro: MembroEquipe }
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

  useEffect(() => {
    document.title = 'Usuários gestão Copiloto de Ponto'
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
    alertarSucesso(`${membro.nome} ${valor ? 'reativado' : 'desativado'}.`)
    lista.recarregar()
  }

  async function reativar(membro: MembroEquipe) {
    try {
      await alterarAtivo(membro, true)
    } catch (e) {
      alertarFalha(e)
    }
  }

  const totalPaginas = lista.dados ? Math.max(1, Math.ceil(lista.dados.total / POR_PAGINA)) : 1
  const temFiltro = Boolean(buscaAplicada || ativo)

  const subtitulo = (membro: MembroEquipe) => membro.cargo ?? membro.email ?? undefined
  const itens = lista.dados?.itens ?? []

  const acoes = (membro: MembroEquipe): AcaoPessoa[] => [
    { rotulo: 'Editar', icone: <IconeLapis tamanho={17} />, onClick: () => setModal({ tipo: 'editar', membro }) },
    { rotulo: 'Redefinir senha', icone: <IconeChave tamanho={17} />, onClick: () => setModal({ tipo: 'redefinir', membro }) },
    membro.ativo
      ? {
          rotulo: 'Desativar',
          icone: <IconeBloqueio tamanho={17} />,
          onClick: () => setModal({ tipo: 'desativar', membro }),
          oculta: ehEu(membro),
        }
      : { rotulo: 'Reativar', icone: <IconeCheck tamanho={17} />, onClick: () => reativar(membro) },
    {
      rotulo: 'Excluir',
      icone: <IconeLixeira tamanho={17} />,
      onClick: () => setModal({ tipo: 'excluir', membro }),
      perigo: true,
      oculta: ehEu(membro),
    },
  ]

  return (
    <section className="pagina">
      <TituloPagina>Usuários gestão</TituloPagina>
      <header className="pessoas-topo">
        <button type="button" className="pessoas-novo" onClick={() => setModal({ tipo: 'criar' })}>
          <IconeMais tamanho={18} />
          Novo membro
        </button>
      </header>

      <CartaoPessoas>
        <BarraPessoas
          idBusca="busca-equipe"
          busca={busca}
          onBusca={setBusca}
          placeholder="Buscar por nome, e-mail ou CPF"
          contagem={lista.dados ? `${lista.dados.total} ${lista.dados.total === 1 ? 'membro' : 'membros'}` : undefined}
        >
          <FiltroPessoas
            rotulo="Situação"
            valor={ativo}
            onMudar={(valor) => {
              setAtivo(valor as typeof ativo)
              setPagina(1)
            }}
          >
            <option value="">Todas</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </FiltroPessoas>
        </BarraPessoas>

        {lista.carregando && (
          <div className="pessoas-estado">
            <Carregando texto="Carregando equipe..." />
          </div>
        )}
        {lista.erro && (
          <div className="pessoas-estado">
            <ErroCarregamento erro={lista.erro} onTentarDeNovo={lista.recarregar} />
          </div>
        )}

        {lista.dados && itens.length === 0 && (
          <div className="pessoas-estado">
            <EstadoVazio titulo={temFiltro || pagina > 1 ? 'Ninguém encontrado' : 'Nenhum membro cadastrado'}>
              {pagina > 1 ? (
                <button type="button" className="btn-link" onClick={() => setPagina(1)}>
                  Voltar para a primeira página
                </button>
              ) : (
                temFiltro && <p>Ajuste a busca ou os filtros.</p>
              )}
            </EstadoVazio>
          </div>
        )}

        {itens.length > 0 && (
          <>
            <div className="table-wrap pessoas-tabela-wrap">
              <table className="pessoas-tabela">
                <caption className="sr-only">Usuários gestão</caption>
                <thead>
                  <tr>
                    <th scope="col">Membro</th>
                    <th scope="col">Contato</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Último acesso</th>
                    <th scope="col">Cadastrado em</th>
                    <th scope="col" className="coluna-acoes">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((membro) => (
                    <tr key={membro.id} className={membro.ativo ? undefined : 'inativa'}>
                      <th scope="row">
                        <Pessoa nome={membro.nome} sub={subtitulo(membro)} voce={ehEu(membro)} />
                      </th>
                      <td>
                        <ContatoPessoa email={membro.email} telefone={membro.telefone} cpf={membro.cpf_mascarado} />
                      </td>
                      <td>
                        <Situacao ativo={membro.ativo} senhaTemporaria={membro.deve_trocar_senha} />
                      </td>
                      <td>
                        <UltimoAcesso iso={membro.ultimo_login_em} />
                      </td>
                      <td className="ultimo-acesso">{membro.criado_em ? formatarData(dataDoInstante(membro.criado_em)) : '—'}</td>
                      <td className="coluna-acoes">
                        <MenuAcoesPessoa nome={membro.nome} acoes={acoes(membro)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="pessoas-cartoes">
              {itens.map((membro) => (
                <li key={membro.id} className={membro.ativo ? 'pessoas-cartao' : 'pessoas-cartao inativa'}>
                  <div className="pessoas-cartao-topo">
                    <Pessoa nome={membro.nome} sub={subtitulo(membro)} voce={ehEu(membro)} />
                    <MenuAcoesPessoa nome={membro.nome} acoes={acoes(membro)} />
                  </div>
                  <div className="pessoas-cartao-info">
                    <Situacao ativo={membro.ativo} senhaTemporaria={membro.deve_trocar_senha} />
                    <UltimoAcesso iso={membro.ultimo_login_em} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <PaginacaoPessoas pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} />
      </CartaoPessoas>

      {(modal?.tipo === 'criar' || modal?.tipo === 'editar') && (
        <ModalMembro
          membro={modal.tipo === 'editar' ? modal.membro : null}
          onFechar={() => setModal(null)}
          onSalvo={(resultado) => {
            lista.recarregar()
            if (resultado.senha) {
              setModal({ tipo: 'senha', nome: resultado.nome, senha: resultado.senha })
              alertarSucesso(`${resultado.nome} adicionado à equipe.`)
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

      {modal?.tipo === 'excluir' && (
        <ModalConfirmacao
          titulo="Excluir membro da equipe"
          rotuloConfirmar="Excluir definitivamente"
          perigo
          onFechar={() => setModal(null)}
          onConfirmar={async () => {
            await api(`/equipe/${modal.membro.id}`, { method: 'DELETE' })
            alertarSucesso(`${modal.membro.nome} foi excluído.`)
            setModal(null)
            lista.recarregar()
          }}
        >
          <p>
            <strong>{modal.membro.nome}</strong> perde o acesso e o cadastro é apagado. Essa ação não pode ser desfeita.
          </p>
          <p>Se for só bloquear o acesso por um tempo, prefira <strong>Desativar</strong>.</p>
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
  const [cargo, setCargo] = useState(membro?.cargo ?? '')
  const [telefone, setTelefone] = useState(membro?.telefone ? formatarTelefone(membro.telefone) : '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  function validar() {
    const saida: Record<string, string> = {}
    if (nome.trim().length < 2) saida.nome = 'Informe o nome (mín. 2 caracteres).'
    if (email.trim() && !EMAIL_VALIDO.test(email.trim())) saida.email = 'E-mail inválido.'
    if (cpf && !cpfValido(cpf)) saida.cpf = 'CPF inválido.'
    const digitosTelefone = telefone.replace(/\D/g, '')
    if (digitosTelefone && (digitosTelefone.length < 10 || digitosTelefone.length > 11)) saida.telefone = 'Informe DDD e número.'
    const temCpf = Boolean(cpf) || Boolean(membro?.cpf_mascarado)
    if (!email.trim() && !temCpf) saida.email = 'Informe e-mail ou CPF (usados para entrar).'
    return saida
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    const locais = validar()
    setErros(locais)
    if (Object.keys(locais).length) return

    const emailLimpo = email.trim() || null
    const cpfDigitos = cpf.replace(/\D/g, '') || null
    const cargoLimpo = cargo.trim() || null
    const telefoneDigitos = telefone.replace(/\D/g, '') || null
    setEnviando(true)
    try {
      if (!membro) {
        const criado = await api<ContaCriada<MembroEquipe>>('/equipe', {
          method: 'POST',
          json: { nome: nome.trim(), email: emailLimpo, cpf: cpfDigitos, cargo: cargoLimpo, telefone: telefoneDigitos },
        })
        return onSalvo({ nome: nome.trim(), senha: criado.senha_temporaria })
      }

      const alteracoes: Record<string, unknown> = {}
      if (nome.trim() !== membro.nome) alteracoes.nome = nome.trim()
      if (emailLimpo !== membro.email) alteracoes.email = emailLimpo
      if (cpfDigitos) alteracoes.cpf = cpfDigitos
      if (cargoLimpo !== membro.cargo) alteracoes.cargo = cargoLimpo
      if (telefoneDigitos !== membro.telefone) alteracoes.telefone = telefoneDigitos
      if (Object.keys(alteracoes).length) {
        await api(`/equipe/${membro.id}`, { method: 'PATCH', json: alteracoes })
      }
      onSalvo({ nome: nome.trim() })
    } catch (e) {
      const campos = errosDeCampos(e)
      if (e instanceof ApiError && !e.campos && /cpf/i.test(e.message)) campos.cpf = e.message
      setErros(campos)
      if (!(Object.keys(campos).length && e instanceof ApiError && e.status === 400)) alertarFalha(e)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={editando ? `Editar ${membro.nome}` : 'Novo membro da equipe'} onFechar={onFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <PreviaCadastro nome={nome} vazio="Nome do membro" sub={['Equipe Scale IA', cargo.trim()].filter(Boolean).join(' · ')} />

        <SecaoCadastro titulo="Dados pessoais">
          <Campo rotulo="Nome completo" erro={erros.nome}>
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
          <div className="campos-grade">
            <Campo rotulo="Cargo" erro={erros.cargo} ajuda="Ex.: Suporte, Implantação, Comercial.">
              {(props) => (
                <input {...props} type="text" value={cargo} maxLength={80} autoComplete="off" onChange={(event) => setCargo(event.target.value)} />
              )}
            </Campo>
            <Campo rotulo="Telefone" erro={erros.telefone}>
              {(props) => (
                <input
                  {...props}
                  type="tel"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  autoComplete="off"
                  onChange={(event) => setTelefone(mascararTelefoneEntrada(event.target.value))}
                />
              )}
            </Campo>
          </div>
        </SecaoCadastro>

        <SecaoCadastro titulo="Acesso ao sistema" descricao="E-mail ou CPF servem para entrar no Copiloto.">
          <div className="campos-grade">
            <Campo rotulo="E-mail" erro={erros.email} ajuda="Opcional se houver CPF.">
              {(props) => (
                <input {...props} type="email" value={email} autoComplete="off" onChange={(event) => setEmail(event.target.value)} />
              )}
            </Campo>
            <Campo
              rotulo="CPF"
              erro={erros.cpf}
              ajuda={membro?.cpf_mascarado ? `Atual: ${membro.cpf_mascarado}. Deixe em branco para manter.` : undefined}
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
          </div>
        </SecaoCadastro>

        {!editando && (
          <p className="modal-texto">
            O novo membro terá acesso a todas as empresas. Uma senha temporária será gerada e exibida uma única vez ao salvar.
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
