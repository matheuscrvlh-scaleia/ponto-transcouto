import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './tela-aviso.css'

/* Telas de "não encontrado" e "algo deu errado". Dentro do app aparecem no
   lugar do conteúdo (a sidebar continua); fora dele, ocupam a tela inteira. */

function IlustracaoBusca() {
  return (
    <svg className="aviso-ilustracao" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle className="aviso-ilustracao-fundo" cx="60" cy="60" r="56" />
      <circle className="aviso-ilustracao-lente" cx="54" cy="52" r="24" />
      <path className="aviso-ilustracao-traco" d="M71.5 69.5 90 88" />
      <path className="aviso-ilustracao-traco fino" d="M46 46l16 12M62 46 46 58" />
    </svg>
  )
}

function IlustracaoErro() {
  return (
    <svg className="aviso-ilustracao" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle className="aviso-ilustracao-fundo" cx="60" cy="60" r="56" />
      <path className="aviso-ilustracao-lente" d="M60 28 92 84H28Z" />
      <path className="aviso-ilustracao-traco" d="M60 50v16" />
      <circle className="aviso-ilustracao-ponto" cx="60" cy="75" r="3" />
    </svg>
  )
}

interface TelaAvisoProps {
  codigo?: string
  ilustracao: ReactNode
  titulo: string
  texto: ReactNode
  acoes: ReactNode
  telaCheia?: boolean
}

function TelaAviso({ codigo, ilustracao, titulo, texto, acoes, telaCheia = false }: TelaAvisoProps) {
  return (
    <section className={telaCheia ? 'aviso-tela cheia' : 'aviso-tela'} aria-labelledby="aviso-titulo">
      <div className="aviso-cartao">
        {ilustracao}
        {codigo && (
          <p className="aviso-codigo" aria-hidden="true">
            {codigo}
          </p>
        )}
        <h1 id="aviso-titulo">{titulo}</h1>
        <p className="aviso-texto">{texto}</p>
        <div className="aviso-acoes">{acoes}</div>
      </div>
    </section>
  )
}

function BotaoVoltar() {
  const navigate = useNavigate()
  // sem histórico (link aberto direto numa aba nova), "voltar" sairia do app
  const temHistorico = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0

  if (!temHistorico) return null
  return (
    <button type="button" className="aviso-botao" onClick={() => navigate(-1)}>
      ← Voltar
    </button>
  )
}

export function TelaNaoEncontrada({
  titulo = 'Página não encontrada',
  texto = 'O endereço que você tentou abrir não existe ou foi movido.',
  telaCheia = false,
}: {
  titulo?: string
  texto?: ReactNode
  telaCheia?: boolean
}) {
  return (
    <TelaAviso
      codigo="404"
      ilustracao={<IlustracaoBusca />}
      titulo={titulo}
      texto={texto}
      telaCheia={telaCheia}
      acoes={
        <>
          <BotaoVoltar />
          <Link to="/" className="aviso-botao aviso-botao-primario">
            Ir para o início
          </Link>
        </>
      }
    />
  )
}

function TelaErroInesperado({ telaCheia }: { telaCheia: boolean }) {
  return (
    <TelaAviso
      ilustracao={<IlustracaoErro />}
      titulo="Algo deu errado"
      texto="Esta tela encontrou um problema inesperado. Recarregue a página; se continuar, avise o suporte."
      telaCheia={telaCheia}
      acoes={
        <>
          <button type="button" className="aviso-botao" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
          {/* link comum (não <Link>): recarrega o app do zero, sem o estado que quebrou */}
          <a href="/" className="aviso-botao aviso-botao-primario">
            Ir para o início
          </a>
        </>
      }
    />
  )
}

interface LimiteErroProps {
  children: ReactNode
  telaCheia?: boolean
}

/** Error boundary: um erro de renderização mostra a tela de aviso em vez de deixar a página em branco. */
export class LimiteErro extends Component<LimiteErroProps, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro de renderização:', erro, info.componentStack)
  }

  render() {
    if (this.state.erro) return <TelaErroInesperado telaCheia={this.props.telaCheia ?? false} />
    return this.props.children
  }
}
