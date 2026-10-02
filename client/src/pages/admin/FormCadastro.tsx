import { useRef, useState, type ReactNode } from 'react'
import { iniciais } from '../../lib/formato'
import './cadastro.css'

/* Peças dos formulários de cadastro (empresa, usuário, membro da equipe). */

/** Bloco do formulário com título e uma linha de explicação. */
export function SecaoCadastro({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <fieldset className="cadastro-secao">
      <legend className="cadastro-secao-titulo">{titulo}</legend>
      {descricao && <p className="cadastro-secao-descricao">{descricao}</p>}
      <div className="cadastro-secao-corpo">{children}</div>
    </fieldset>
  )
}

/** Topo do formulário: avatar (ou logo) e nome conforme vão sendo digitados. */
export function PreviaCadastro({
  nome,
  sub,
  vazio,
  imagem,
}: {
  nome: string
  sub?: string
  /** texto quando ainda não há nome */
  vazio: string
  imagem?: ReactNode
}) {
  const temNome = nome.trim().length > 0
  return (
    <div className="cadastro-previa" aria-hidden="true">
      {imagem ?? <span className="cadastro-previa-avatar">{temNome ? iniciais(nome) : '?'}</span>}
      <span className="cadastro-previa-texto">
        <strong className={temNome ? undefined : 'vazio'}>{temNome ? nome.trim() : vazio}</strong>
        {sub && <span>{sub}</span>}
      </span>
    </div>
  )
}

/** Logo da empresa (ou as iniciais, sem logo). */
export function LogoEmpresa({ nome, logo, tamanho = 40 }: { nome: string; logo: string | null; tamanho?: number }) {
  return (
    <span className="logo-empresa" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) }} aria-hidden="true">
      {logo ? <img src={logo} alt="" /> : iniciais(nome)}
    </span>
  )
}

const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp']
const LADO_MAXIMO = 256

/** Lê a imagem e reduz para no máx. 256px (WebP; PNG nos navegadores sem WebP). */
async function reduzirImagem(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo)
  try {
    const imagem = new Image()
    imagem.src = url
    await imagem.decode()
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.naturalWidth, imagem.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala))
    canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala))
    canvas.getContext('2d')?.drawImage(imagem, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/webp', 0.9)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Enviar / trocar / remover o logo, com prévia. */
export function CampoLogo({ nome, logo, onMudar }: { nome: string; logo: string | null; onMudar: (logo: string | null) => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setErro('')
    if (!TIPOS_LOGO.includes(arquivo.type)) return setErro('Use uma imagem PNG, JPG ou WebP.')
    if (arquivo.size > 5 * 1024 * 1024) return setErro('Imagem muito grande (máx. 5 MB).')
    setLendo(true)
    try {
      onMudar(await reduzirImagem(arquivo))
    } catch {
      setErro('Não foi possível ler esta imagem.')
    } finally {
      setLendo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <div className="campo-logo">
      <button
        type="button"
        className="campo-logo-previa"
        onClick={() => entrada.current?.click()}
        aria-label={logo ? 'Trocar logo' : 'Enviar logo'}
      >
        <LogoEmpresa nome={nome || '?'} logo={logo} tamanho={72} />
      </button>
      <div className="campo-logo-texto">
        <strong>Logo</strong>
        <span>PNG, JPG ou WebP. Ela é reduzida para 256px.</span>
        <div className="campo-logo-acoes">
          <button type="button" className="btn-link" onClick={() => entrada.current?.click()} disabled={lendo}>
            {lendo ? 'Lendo...' : logo ? 'Trocar' : 'Enviar imagem'}
          </button>
          {logo && (
            <button type="button" className="btn-link btn-link-danger" onClick={() => onMudar(null)}>
              Remover
            </button>
          )}
        </div>
        {erro && (
          <small className="campo-erro" role="alert">
            {erro}
          </small>
        )}
      </div>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_LOGO.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => escolher(event.target.files?.[0])}
      />
    </div>
  )
}
