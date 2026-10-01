import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { CampoSenha } from '../components/CampoSenha'
import { IconeCadeado, LayoutAcesso } from '../components/LayoutAcesso'

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
      // no primeiro acesso segue para o app; quando veio do perfil, volta para ele
      navigate(obrigatoria ? '/' : '/perfil', { replace: true })
    } catch (e) {
      const campo = e instanceof ApiError ? e.campos?.nova_senha?.[0] : undefined
      setErro(campo ?? (e instanceof ApiError ? e.message : 'Não foi possível trocar a senha.'))
      setEnviando(false)
    }
  }

  const primeiroNome = usuario?.nome.split(' ')[0]

  return (
    <LayoutAcesso
      tituloPainel={obrigatoria ? (primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!') : 'Proteja seu acesso'}
      textoPainel={
        obrigatoria
          ? 'Antes de começar, crie uma senha pessoal no lugar da senha temporária que você recebeu.'
          : 'Escolha uma senha forte e que só você saiba para manter seus dados seguros.'
      }
      titulo={obrigatoria ? 'Crie sua senha' : 'Trocar senha'}
      subtitulo={
        obrigatoria
          ? 'Para continuar, troque a senha temporária por uma senha pessoal.'
          : 'Informe a senha atual e escolha a nova.'
      }
    >
      <form className="lg-form" onSubmit={handleSubmit} noValidate>
        <CampoSenha
          id="senha-atual"
          rotulo={obrigatoria ? 'Senha temporária' : 'Senha atual'}
          valor={atual}
          onChange={setAtual}
          autoComplete="current-password"
          icone={<IconeCadeado />}
        />
        <CampoSenha
          id="nova-senha"
          rotulo="Nova senha"
          valor={nova}
          onChange={setNova}
          autoComplete="new-password"
          descricao={`Mínimo de ${TAMANHO_MINIMO} caracteres.`}
          icone={<IconeCadeado />}
        />
        <CampoSenha
          id="confirmacao"
          rotulo="Confirme a nova senha"
          valor={confirmacao}
          onChange={setConfirmacao}
          autoComplete="new-password"
          icone={<IconeCadeado />}
        />
        {erro && (
          <p className="form-erro" role="alert">
            {erro}
          </p>
        )}
        <button className="lg-botao" type="submit" disabled={enviando || !atual || !nova || !confirmacao}>
          {enviando ? 'Salvando...' : 'Salvar nova senha'}
        </button>
        {obrigatoria ? (
          <button type="button" className="lg-link" onClick={sair}>
            Sair
          </button>
        ) : (
          <Link to="/perfil" className="lg-link">
            Voltar ao perfil
          </Link>
        )}
      </form>
    </LayoutAcesso>
  )
}
