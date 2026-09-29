import { useState, type FormEvent } from 'react'
import { Campo } from '../../components/Campo'
import { Modal } from '../../components/Modal'
import { ApiError, api } from '../../lib/api'
import { errosDeCampos, mensagemDeErro } from '../../lib/erros'
import { mascararCpfEntrada } from '../../lib/formato'
import { NOME_PERFIL } from '../../lib/preferencias'
import type { Perfil, UnidadeAdmin, UsuarioAdmin, UsuarioCriado } from '../../types/api'

function cpfValido(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const digito = (tamanho: number) => {
    const soma = [...d.slice(0, tamanho)].reduce((total, n, i) => total + Number(n) * (tamanho + 1 - i), 0)
    return ((soma * 10) % 11) % 10
  }
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  usuario: UsuarioAdmin | null
  empresaId: number
  ehAdmin: boolean
  ehProprio: boolean
  unidades: UnidadeAdmin[]
  onFechar: () => void
  onSalvo: (resultado: { nome: string; senha?: string }) => void
}

export function ModalUsuario({ usuario, empresaId, ehAdmin, ehProprio, unidades, onFechar, onSalvo }: Props) {
  const editando = usuario !== null
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [cpf, setCpf] = useState('')
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? 'gestor')
  const [unidadeIds, setUnidadeIds] = useState<number[]>(() => usuario?.unidades.map((unidade) => unidade.id) ?? [])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)

  function validar() {
    const saida: Record<string, string> = {}
    if (nome.trim().length < 2) saida.nome = 'Informe o nome (mín. 2 caracteres).'
    if (email.trim() && !EMAIL.test(email.trim())) saida.email = 'E-mail inválido.'
    if (cpf && !cpfValido(cpf)) saida.cpf = 'CPF inválido.'
    const temCpf = Boolean(cpf) || Boolean(usuario?.cpf_mascarado)
    if (!email.trim() && !temCpf) saida.email = 'Informe e-mail ou CPF (usados para entrar).'
    if (perfil === 'gestor' && unidadeIds.length === 0) saida.unidade_ids = 'Escolha ao menos uma unidade.'
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
      if (!usuario) {
        const criado = await api<UsuarioCriado>('/usuarios', {
          method: 'POST',
          json: {
            nome: nome.trim(),
            email: emailLimpo,
            cpf: cpfDigitos,
            perfil,
            empresa_id: ehAdmin && perfil !== 'admin' ? empresaId : undefined,
            unidade_ids: perfil === 'gestor' ? unidadeIds : [],
          },
        })
        return onSalvo({ nome: nome.trim(), senha: criado.senha_temporaria })
      }

      const alteracoes: Record<string, unknown> = {}
      if (nome.trim() !== usuario.nome) alteracoes.nome = nome.trim()
      if (emailLimpo !== usuario.email) alteracoes.email = emailLimpo
      if (cpfDigitos) alteracoes.cpf = cpfDigitos
      if (perfil !== usuario.perfil) {
        alteracoes.perfil = perfil
        if (ehAdmin && perfil !== 'admin' && usuario.empresa_id == null) alteracoes.empresa_id = empresaId
      }
      if (Object.keys(alteracoes).length) {
        await api(`/usuarios/${usuario.id}`, { method: 'PATCH', json: alteracoes })
      }

      const anteriores = usuario.perfil === 'gestor' ? usuario.unidades.map((unidade) => unidade.id) : []
      const mudouUnidades = [...anteriores].sort().join() !== [...unidadeIds].sort().join() || perfil !== usuario.perfil
      if (perfil === 'gestor' && mudouUnidades) {
        await api(`/usuarios/${usuario.id}/unidades`, { method: 'PUT', json: { unidade_ids: unidadeIds } })
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

  function alternarUnidade(id: number) {
    setUnidadeIds((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]))
  }

  const perfisDisponiveis: Perfil[] = ehAdmin ? ['gestor', 'rh', 'admin'] : ['gestor', 'rh']
  const ordenadas = [...unidades].sort((a, b) => (a.nome_exibicao ?? '').localeCompare(b.nome_exibicao ?? '', 'pt-BR'))

  return (
    <Modal titulo={editando ? `Editar ${usuario.nome}` : 'Novo usuário'} onFechar={onFechar} largo>
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
        <div className="campos-grade">
          <Campo rotulo="E-mail" erro={erros.email} ajuda="Usado para entrar. Opcional se houver CPF.">
            {(props) => (
              <input
                {...props}
                type="email"
                value={email}
                autoComplete="off"
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Campo>
          <Campo
            rotulo="CPF"
            erro={erros.cpf}
            ajuda={usuario?.cpf_mascarado ? `Atual: ${usuario.cpf_mascarado}. Deixe em branco para manter.` : 'Também pode ser usado para entrar.'}
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
        <Campo rotulo="Perfil" erro={erros.perfil} ajuda={ehProprio ? 'Você não pode alterar o próprio perfil.' : perfilAjuda(perfil)}>
          {(props) => (
            <select {...props} value={perfil} disabled={ehProprio} onChange={(event) => setPerfil(event.target.value as Perfil)}>
              {perfisDisponiveis.map((item) => (
                <option key={item} value={item}>
                  {NOME_PERFIL[item]}
                </option>
              ))}
            </select>
          )}
        </Campo>

        {perfil === 'gestor' && (
          <fieldset className="form-secao" aria-describedby={erros.unidade_ids ? 'erro-unidades' : undefined}>
            <legend>Unidades que o gestor vê</legend>
            {ordenadas.length === 0 ? (
              <p className="texto-suave">Nenhuma unidade com nome de exibição. Configure em Unidades.</p>
            ) : (
              <div className="checkbox-list">
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
          </fieldset>
        )}

        {!editando && (
          <p className="modal-texto">Uma senha temporária será gerada e exibida uma única vez ao salvar.</p>
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
            {enviando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function perfilAjuda(perfil: Perfil) {
  if (perfil === 'gestor') return 'Vê somente as unidades marcadas abaixo.'
  if (perfil === 'rh') return 'Vê todas as unidades da empresa e acessa a administração.'
  return 'Acesso técnico a todas as empresas (Scale).'
}
