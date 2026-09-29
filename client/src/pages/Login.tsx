import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { CartaoAcesso } from '../components/CartaoAcesso'
import { CampoSenha } from '../components/CampoSenha'

function mensagemErro(erro: unknown): string {
  if (!(erro instanceof ApiError)) return 'Não foi possível entrar. Tente novamente em instantes.'
  if (erro.status === 401 || erro.status === 400) return 'E-mail/CPF ou senha incorretos. Confira os dados e tente novamente.'
  return erro.message
}

function mascararCpf(valor: string) {
  if (/[^\d.\-\s]/.test(valor)) return valor
  const d = valor.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

export function Login() {
  const { usuario, carregando, entrar } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const destino = (location.state as { de?: string } | null)?.de ?? '/'

  if (!carregando && usuario) return <Navigate to={destino} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro('')
    setEnviando(true)

    const valor = identificador.trim()
    const login = valor.includes('@') ? valor : valor.replace(/\D/g, '')

    try {
      const logado = await entrar(login, senha)
      navigate(logado.deve_trocar_senha ? '/trocar-senha' : destino, { replace: true })
    } catch (e) {
      setErro(mensagemErro(e))
      setEnviando(false)
    }
  }

  return (
    <CartaoAcesso>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {params.get('expirou') && !erro && (
          <p className="form-info" role="status">
            Sua sessão expirou. Entre novamente.
          </p>
        )}
        <div className="field">
          <label htmlFor="identificador">E-mail ou CPF</label>
          <input
            id="identificador"
            type="text"
            value={identificador}
            onChange={(event) => setIdentificador(mascararCpf(event.target.value))}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <CampoSenha id="senha" rotulo="Senha" valor={senha} onChange={setSenha} autoComplete="current-password" />
        {erro && (
          <p className="form-erro" role="alert">
            {erro}
          </p>
        )}
        <button className="btn-primary" type="submit" disabled={enviando || !identificador.trim() || !senha}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
        <p className="login-ajuda">Esqueceu a senha? Fale com o RH.</p>
      </form>
    </CartaoAcesso>
  )
}
