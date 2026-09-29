import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { CampoSenha } from '../components/CampoSenha'
import { CartaoAcesso } from '../components/CartaoAcesso'

const TAMANHO_MINIMO = 8

export function TrocarSenha() {
  const { usuario, trocarSenha, sair } = useAuth()
  const navigate = useNavigate()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const obrigatoria = Boolean(usuario?.deve_trocar_senha)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro('')

    if (nova.length < TAMANHO_MINIMO) return setErro(`A nova senha deve ter ao menos ${TAMANHO_MINIMO} caracteres.`)
    if (nova !== confirmacao) return setErro('A confirmação não confere com a nova senha.')
    if (nova === atual) return setErro('A nova senha deve ser diferente da atual.')

    setEnviando(true)
    try {
      await trocarSenha(atual, nova)
      navigate('/', { replace: true })
    } catch (e) {
      const campo = e instanceof ApiError ? e.campos?.nova_senha?.[0] : undefined
      setErro(campo ?? (e instanceof ApiError ? e.message : 'Não foi possível trocar a senha.'))
      setEnviando(false)
    }
  }

  return (
    <CartaoAcesso titulo={obrigatoria ? 'Crie sua senha' : 'Trocar senha'}>
      {obrigatoria && (
        <p className="login-texto">
          Olá, {usuario?.nome.split(' ')[0]}. Para continuar, troque a senha temporária que você recebeu por uma senha
          pessoal.
        </p>
      )}
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <CampoSenha
          id="senha-atual"
          rotulo={obrigatoria ? 'Senha temporária' : 'Senha atual'}
          valor={atual}
          onChange={setAtual}
          autoComplete="current-password"
        />
        <CampoSenha
          id="nova-senha"
          rotulo="Nova senha"
          valor={nova}
          onChange={setNova}
          autoComplete="new-password"
          descricao={`Mínimo de ${TAMANHO_MINIMO} caracteres.`}
        />
        <CampoSenha
          id="confirmacao"
          rotulo="Confirme a nova senha"
          valor={confirmacao}
          onChange={setConfirmacao}
          autoComplete="new-password"
        />
        {erro && (
          <p className="form-erro" role="alert">
            {erro}
          </p>
        )}
        <button className="btn-primary" type="submit" disabled={enviando || !atual || !nova || !confirmacao}>
          {enviando ? 'Salvando...' : 'Salvar nova senha'}
        </button>
        {obrigatoria ? (
          <button type="button" className="btn-link login-ajuda" onClick={sair}>
            Sair
          </button>
        ) : (
          <Link to="/" className="btn-link login-ajuda">
            Voltar
          </Link>
        )}
      </form>
    </CartaoAcesso>
  )
}
