import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { CampoSenha } from '../components/CampoSenha'
import { IconeCadeado, IconeUsuario, LayoutAcesso } from '../components/LayoutAcesso'
import { alertarErro, alertarInfo } from '../lib/alertas'

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
  const [enviando, setEnviando] = useState(false)

  const destino = (location.state as { de?: string } | null)?.de ?? '/'
  const expirou = Boolean(params.get('expirou'))

  useEffect(() => {
    if (expirou) alertarInfo('Entre novamente para continuar.', 'Sua sessão expirou')
  }, [expirou])

  if (!carregando && usuario) return <Navigate to={destino} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setEnviando(true)

    const valor = identificador.trim()
    const login = valor.includes('@') ? valor : valor.replace(/\D/g, '')

    try {
      const logado = await entrar(login, senha)
      navigate(logado.deve_trocar_senha ? '/trocar-senha' : destino, { replace: true })
    } catch (e) {
      if (!(e instanceof ApiError && e.alertado)) alertarErro({ titulo: 'Não foi possível entrar', mensagem: mensagemErro(e) })
      setEnviando(false)
    }
  }

  return (
    <LayoutAcesso
      tituloPainel="Bem-vindo de volta!"
      textoPainel="Entre para acompanhar o banco de horas da sua unidade, atualizado automaticamente."
      titulo="Entrar"
      subtitulo="Use seu e-mail ou CPF cadastrado."
    >
      <form className="lg-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="identificador">E-mail ou CPF</label>
          <div className="lg-pilula">
            <span className="campo-icone" aria-hidden="true">
              <IconeUsuario />
            </span>
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
        </div>
        <CampoSenha
          id="senha"
          rotulo="Senha"
          valor={senha}
          onChange={setSenha}
          autoComplete="current-password"
          icone={<IconeCadeado />}
        />
        <button className="lg-botao" type="submit" disabled={enviando || !identificador.trim() || !senha}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
        <p className="lg-ajuda">Esqueceu a senha? Fale com o RH.</p>
      </form>
    </LayoutAcesso>
  )
}
