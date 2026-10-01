import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconeCheck, IconeSeletor } from './Icones'

export interface OpcaoLista<T extends string | number> {
  id: T
  nome: string
  /** Opção de visão geral ("Todas as ..."): ícone próprio e separada das demais por uma linha. */
  geral?: boolean
}

interface Props<T extends string | number> {
  rotulo: string
  opcoes: OpcaoLista<T>[]
  selecionadoId: T | null
  onEscolher: (id: T) => void
  /** Ícone do botão (pode variar com a opção escolhida). */
  icone: ReactNode
  /** Ícone da opção de visão geral dentro da lista. */
  iconeGeral?: ReactNode
  vazio?: string
  className?: string
}

/* Lista suspensa própria (botão + listbox) no lugar do <select> nativo,
   cujas opções o navegador não deixa estilizar. Teclado: setas, Home/End,
   Enter/Espaço escolhem, Esc fecha. Usada pelos seletores de unidade e de empresa. */
export function SeletorLista<T extends string | number>({
  rotulo,
  opcoes,
  selecionadoId,
  onEscolher,
  icone,
  iconeGeral,
  vazio = 'Escolha',
  className = '',
}: Props<T>) {
  const id = useId()
  const raizRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)

  useEffect(() => {
    if (!aberto) return
    function fecharFora(event: PointerEvent) {
      if (!raizRef.current?.contains(event.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', fecharFora)
    listaRef.current?.focus()
    return () => document.removeEventListener('pointerdown', fecharFora)
  }, [aberto])

  useEffect(() => {
    if (aberto) listaRef.current?.children[ativo]?.scrollIntoView({ block: 'nearest' })
  }, [aberto, ativo])

  const atual = opcoes.find((opcao) => opcao.id === selecionadoId) ?? null

  function abrir() {
    const indiceAtual = opcoes.findIndex((opcao) => opcao.id === selecionadoId)
    setAtivo(indiceAtual >= 0 ? indiceAtual : 0)
    setAberto(true)
  }

  function fechar() {
    setAberto(false)
    botaoRef.current?.focus()
  }

  function escolher(indice: number) {
    const opcao = opcoes[indice]
    fechar()
    if (opcao && opcao.id !== selecionadoId) onEscolher(opcao.id)
  }

  function teclaBotao(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      abrir()
    }
  }

  function teclaLista(event: KeyboardEvent<HTMLUListElement>) {
    const ultimo = opcoes.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setAtivo((i) => Math.min(i + 1, ultimo))
        break
      case 'ArrowUp':
        event.preventDefault()
        setAtivo((i) => Math.max(i - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setAtivo(0)
        break
      case 'End':
        event.preventDefault()
        setAtivo(ultimo)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        escolher(ativo)
        break
      case 'Escape':
        event.preventDefault()
        fechar()
        break
      case 'Tab':
        setAberto(false)
        break
    }
  }

  return (
    <div ref={raizRef} className={`seletor-unidade ${aberto ? 'aberto' : ''} ${className}`}>
      <button
        ref={botaoRef}
        type="button"
        className="seletor-gatilho"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={teclaBotao}
      >
        <span className="seletor-gatilho-icone" aria-hidden="true">
          {icone}
        </span>
        <span className="seletor-gatilho-texto">
          <span className="seletor-rotulo">{rotulo}</span>
          <span className={atual ? 'seletor-valor' : 'seletor-valor vazio'}>{atual ? atual.nome : vazio}</span>
        </span>
        <IconeSeletor tamanho={16} className="seletor-seta" />
      </button>

      {aberto && (
        <ul
          ref={listaRef}
          id={`${id}-lista`}
          className="seletor-lista"
          role="listbox"
          aria-label={rotulo}
          tabIndex={-1}
          aria-activedescendant={`${id}-op-${ativo}`}
          onKeyDown={teclaLista}
        >
          {opcoes.map((opcao, indice) => {
            const selecionada = opcao.id === selecionadoId
            return (
              <li
                key={opcao.id}
                id={`${id}-op-${indice}`}
                role="option"
                aria-selected={selecionada}
                className={[
                  'seletor-opcao',
                  opcao.geral ? 'todas' : '',
                  indice === ativo ? 'ativa' : '',
                  selecionada ? 'selecionada' : '',
                ].join(' ')}
                onPointerEnter={() => setAtivo(indice)}
                onClick={() => escolher(indice)}
              >
                {opcao.geral && iconeGeral && (
                  <span className="seletor-opcao-icone" aria-hidden="true">
                    {iconeGeral}
                  </span>
                )}
                <span className="seletor-opcao-nome">{opcao.nome}</span>
                {selecionada && <IconeCheck tamanho={16} className="seletor-opcao-check" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
