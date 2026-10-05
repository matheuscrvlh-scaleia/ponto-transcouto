import { useState, type FormEvent } from 'react'
import { Campo } from '../../components/Campo'
import { Modal } from '../../components/Modal'
import { ApiError, api } from '../../lib/api'
import { errosDeCampos } from '../../lib/erros'
import { cpfValido, EMAIL_VALIDO, formatarTelefone, mascararCpfEntrada, mascararTelefoneEntrada } from '../../lib/formato'
import type { ClienteAdmin, ContaCriada, GrupoPermissao, UnidadeAdmin } from '../../types/api'
import { PreviaCadastro, SecaoCadastro } from './FormCadastro'
import { alertarFalha } from '../../lib/alertas'

interface Props {
  usuario: ClienteAdmin | null
  empresaId: number
  /** Equipe Scale IA: informa a empresa ao criar (o RH usa a própria). */
  ehAdmin: boolean
  ehProprio: boolean
  unidades: UnidadeAdmin[]
  /** grupos de permissão da empresa (Configuração → Permissões) */
  grupos: GrupoPermissao[]
  onFechar: () => void
  onSalvo: (resultado: { nome: string; senha?: string }) => void
}

/** Grupo sugerido para um usuário novo: o Gestor padrão, se quem cadastra pode usá-lo. */
function grupoInicial(grupos: GrupoPermissao[]) {
  const disponiveis = grupos.filter((grupo) => grupo.pode_editar)
  return (disponiveis.find((grupo) => grupo.padrao === 'gestor') ?? disponiveis[0])?.id ?? null
}

export function ModalUsuario({ usuario, empresaId, ehAdmin, ehProprio, unidades, grupos, onFechar, onSalvo }: Props) {
  const editando = usuario !== null
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [cpf, setCpf] = useState('')
  const [cargo, setCargo] = useState(usuario?.cargo ?? '')
  const [telefone, setTelefone] = useState(usuario?.telefone ? formatarTelefone(usuario.telefone) : '')
  const [grupoId, setGrupoId] = useState<number | null>(() => usuario?.grupo.id ?? grupoInicial(grupos))
  const [unidadeIds, setUnidadeIds] = useState<number[]>(() => usuario?.unidades.map((unidade) => unidade.id) ?? [])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  const grupo = grupos.find((item) => item.id === grupoId) ?? (usuario && usuario.grupo.id === grupoId ? usuario.grupo : null)
  // alcance "unidades vinculadas": escolhe as unidades que a pessoa vê
  const porUnidade = (grupo?.alcance ?? 'unidades') === 'unidades'
  // grupos que quem cadastra pode usar (mais o atual, para aparecer selecionado)
  const opcoesGrupo = grupos.filter((item) => item.pode_editar || item.id === usuario?.grupo.id)
  const grupoTravado = ehProprio || (usuario !== null && !grupos.find((item) => item.id === usuario.grupo.id)?.pode_editar && !ehAdmin)

  function validar() {
    const saida: Record<string, string> = {}
    if (nome.trim().length < 2) saida.nome = 'Informe o nome (mín. 2 caracteres).'
    if (email.trim() && !EMAIL_VALIDO.test(email.trim())) saida.email = 'E-mail inválido.'
    if (cpf && !cpfValido(cpf)) saida.cpf = 'CPF inválido.'
    const digitosTelefone = telefone.replace(/\D/g, '')
    if (digitosTelefone && (digitosTelefone.length < 10 || digitosTelefone.length > 11)) saida.telefone = 'Informe DDD e número.'
    const temCpf = Boolean(cpf) || Boolean(usuario?.cpf_mascarado)
    if (!email.trim() && !temCpf) saida.email = 'Informe e-mail ou CPF (usados para entrar).'
    if (!grupoId) saida.grupo_id = 'Escolha o grupo de permissão.'
    if (porUnidade && unidadeIds.length === 0) saida.unidade_ids = 'Escolha ao menos uma unidade.'
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
      if (!usuario) {
        const criado = await api<ContaCriada<ClienteAdmin>>('/clientes', {
          method: 'POST',
          json: {
            nome: nome.trim(),
            email: emailLimpo,
            cpf: cpfDigitos,
            grupo_id: grupoId,
            cargo: cargoLimpo,
            telefone: telefoneDigitos,
            empresa_id: ehAdmin ? empresaId : undefined,
            unidade_ids: porUnidade ? unidadeIds : [],
          },
        })
        return onSalvo({ nome: nome.trim(), senha: criado.senha_temporaria })
      }

      const alteracoes: Record<string, unknown> = {}
      if (nome.trim() !== usuario.nome) alteracoes.nome = nome.trim()
      if (emailLimpo !== usuario.email) alteracoes.email = emailLimpo
      if (cpfDigitos) alteracoes.cpf = cpfDigitos
      if (cargoLimpo !== usuario.cargo) alteracoes.cargo = cargoLimpo
      if (telefoneDigitos !== usuario.telefone) alteracoes.telefone = telefoneDigitos
      if (grupoId !== usuario.grupo.id) alteracoes.grupo_id = grupoId
      if (Object.keys(alteracoes).length) {
        await api(`/clientes/${usuario.id}`, { method: 'PATCH', json: alteracoes })
      }

      const anteriores = usuario.grupo.alcance === 'unidades' ? usuario.unidades.map((unidade) => unidade.id) : []
      const mudouUnidades = [...anteriores].sort().join() !== [...unidadeIds].sort().join() || grupoId !== usuario.grupo.id
      if (porUnidade && mudouUnidades) {
        await api(`/clientes/${usuario.id}/unidades`, { method: 'PUT', json: { unidade_ids: unidadeIds } })
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

  function alternarUnidade(id: number) {
    setUnidadeIds((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]))
  }

  const ordenadas = [...unidades].sort((a, b) => (a.nome_exibicao ?? '').localeCompare(b.nome_exibicao ?? '', 'pt-BR'))

  return (
    <Modal titulo={editando ? `Editar ${usuario.nome}` : 'Novo usuário'} onFechar={onFechar} largo>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <PreviaCadastro
          nome={nome}
          vazio="Nome do usuário"
          sub={[grupo?.nome, cargo.trim()].filter(Boolean).join(' · ')}
        />

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
            <Campo rotulo="Cargo" erro={erros.cargo} ajuda="Ex.: Analista de RH, Supervisor de turno.">
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
              ajuda={usuario?.cpf_mascarado ? `Atual: ${usuario.cpf_mascarado}. Deixe em branco para manter.` : undefined}
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
          <Campo
            rotulo="Grupo de permissão"
            erro={erros.grupo_id}
            ajuda={ehProprio ? 'Você não pode trocar o próprio grupo.' : grupoAjuda(grupo)}
          >
            {(props) => (
              <select
                {...props}
                value={grupoId ?? ''}
                disabled={grupoTravado}
                onChange={(event) => setGrupoId(event.target.value ? Number(event.target.value) : null)}
              >
                {grupoId === null && <option value="">Escolha um grupo</option>}
                {opcoesGrupo.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        </SecaoCadastro>

        {porUnidade && (
          <SecaoCadastro titulo="Unidades que o usuário vê" descricao={`${unidadeIds.length} de ${ordenadas.length} marcadas.`}>
            {ordenadas.length === 0 ? (
              <p className="texto-suave">Nenhuma unidade com nome de exibição. Configure em Unidades.</p>
            ) : (
              <div className="checkbox-list" aria-describedby={erros.unidade_ids ? 'erro-unidades' : undefined}>
                {ordenadas.map((unidade) => (
                  <label key={unidade.id} className="checkbox-item">
                    <input type="checkbox" checked={unidadeIds.includes(unidade.id)} onChange={() => alternarUnidade(unidade.id)} />
                    {unidade.nome_exibicao}
                    {!unidade.ativo && ' (inativa)'}
                  </label>
                ))}
              </div>
            )}
            {erros.unidade_ids && (
              <small id="erro-unidades" className="campo-erro" role="alert">
                {erros.unidade_ids}
              </small>
            )}
          </SecaoCadastro>
        )}

        {!editando && (
          <p className="modal-texto">Uma senha temporária será gerada e exibida uma única vez ao salvar.</p>
        )}
        <div className="form-acoes">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function grupoAjuda(grupo: Pick<GrupoPermissao, 'alcance' | 'telas'> | null) {
  if (!grupo) return 'As telas de cada grupo são definidas em Permissões.'
  const telas = `${grupo.telas.length} ${grupo.telas.length === 1 ? 'tela liberada' : 'telas liberadas'}`
  return grupo.alcance === 'empresa'
    ? `Vê todas as unidades da empresa · ${telas}.`
    : `Vê somente as unidades marcadas abaixo · ${telas}.`
}
