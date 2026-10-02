import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconeBusca, IconePontos } from '../../components/Icones'
import { formatarDataHora, formatarTelefone, formatarUltimoAcesso, iniciais } from '../../lib/formato'
import { NOME_PERFIL } from '../../lib/preferencias'
import type { Perfil } from '../../types/api'
import './pessoas.css'

/* Peças das listas de contas (Configuração › Usuários e Administração › Usuários gestão). */

/** Cartão que junta a barra de filtros, a lista e a paginação. */
export function CartaoPessoas({ children }: { children: ReactNode }) {
  return <div className="pessoas">{children}</div>
}

export function BarraPessoas({
  idBusca,
  busca,
  onBusca,
  placeholder,
  contagem,
  children,
}: {
  idBusca: string
  busca: string
  onBusca: (valor: string) => void
  placeholder: string
  /** ex.: "3 usuários" (some enquanto carrega) */
  contagem?: string
  /** filtros extras (FiltroPessoas) */
  children?: ReactNode
}) {
  return (
    <div className="pessoas-barra" role="group" aria-label="Filtros">
      <label className="pessoas-busca" htmlFor={idBusca}>
        <IconeBusca tamanho={17} />
        <span className="sr-only">Buscar</span>
        <input id={idBusca} type="search" placeholder={placeholder} value={busca} onChange={(event) => onBusca(event.target.value)} />
      </label>
      {children}
      {contagem && (
        <span className="pessoas-contagem" aria-live="polite">
          {contagem}
        </span>
      )}
    </div>
  )
}

/** Select compacto da barra: o rótulo fica dentro do próprio campo ("Perfil: Todos"). */
export function FiltroPessoas({
  rotulo,
  valor,
  onMudar,
  children,
}: {
  rotulo: string
  valor: string
  onMudar: (valor: string) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className={valor ? 'pessoas-filtro ativo' : 'pessoas-filtro'}>
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(event) => onMudar(event.target.value)}>
        {children}
      </select>
    </div>
  )
}

/** Matiz fixa por nome: cada pessoa tem sempre a mesma cor de avatar. */
function matiz(nome: string) {
  let soma = 0
  for (const letra of nome) soma = (soma * 31 + letra.charCodeAt(0)) % 360
  return soma
}

/** Avatar com iniciais + nome + linha de contato. */
export function Pessoa({ nome, sub, voce = false }: { nome: string; sub?: string; voce?: boolean }) {
  return (
    <div className="pessoa">
      <span className="pessoa-avatar" aria-hidden="true" style={{ '--matiz': matiz(nome) } as CSSProperties}>
        {iniciais(nome)}
      </span>
      <span className="pessoa-texto">
        <span className="pessoa-nome">
          {nome}
          {voce && <span className="pessoa-voce">Você</span>}
        </span>
        {sub && <span className="pessoa-sub">{sub}</span>}
      </span>
    </div>
  )
}

export function EtiquetaPerfil({ perfil }: { perfil: Perfil }) {
  return <span className={`perfil-tag perfil-tag-${perfil}`}>{NOME_PERFIL[perfil]}</span>
}

export function Situacao({
  ativo,
  senhaTemporaria = false,
  rotulos = ['Ativo', 'Inativo'],
}: {
  ativo: boolean
  senhaTemporaria?: boolean
  rotulos?: [string, string]
}) {
  return (
    <span className="situacao">
      <span className={ativo ? 'situacao-ponto ativo' : 'situacao-ponto'}>{ativo ? rotulos[0] : rotulos[1]}</span>
      {ativo && senhaTemporaria && (
        <span className="situacao-aviso" title="Ainda não trocou a senha temporária">
          Senha temporária
        </span>
      )}
    </span>
  )
}

/** E-mail, telefone e CPF, um por linha (o primeiro em destaque). */
export function ContatoPessoa({ email, telefone, cpf }: { email: string | null; telefone: string | null; cpf?: string | null }) {
  const linhas = [email, telefone && formatarTelefone(telefone), cpf && `CPF ${cpf}`].filter((linha): linha is string =>
    Boolean(linha),
  )
  if (linhas.length === 0) return <span className="etiqueta-vazia">Não informado</span>
  const [principal, ...resto] = linhas
  return (
    <span className="contato-celula">
      {principal}
      {resto.map((linha) => (
        <small key={linha}>{linha}</small>
      ))}
    </span>
  )
}

export function UltimoAcesso({ iso }: { iso: string | null }) {
  return (
    <span className={iso ? 'ultimo-acesso' : 'ultimo-acesso nunca'} title={iso ? formatarDataHora(iso) : undefined}>
      {formatarUltimoAcesso(iso)}
    </span>
  )
}

/** Unidades como etiquetas: mostra as primeiras e resume o resto em "+N". */
export function EtiquetasUnidades({ nomes, todas = false, max = 2 }: { nomes: string[]; todas?: boolean; max?: number }) {
  if (todas) return <span className="etiqueta etiqueta-todas">Todas da empresa</span>
  if (nomes.length === 0) return <span className="etiqueta-vazia">Nenhuma unidade</span>
  const visiveis = nomes.slice(0, max)
  const resto = nomes.length - visiveis.length
  return (
    <span className="etiquetas">
      {visiveis.map((nome) => (
        <span key={nome} className="etiqueta">
          {nome}
        </span>
      ))}
      {resto > 0 && (
        <span className="etiqueta etiqueta-mais" title={nomes.slice(max).join(', ')}>
          +{resto}
        </span>
      )}
    </span>
  )
}

export interface AcaoPessoa {
  rotulo: string
  icone: ReactNode
  onClick: () => void
  perigo?: boolean
  /** some do menu (ex.: desativar a si mesmo) */
  oculta?: boolean
}

/**
 * Botão "⋯" com as ações da linha. A lista abre em `position: fixed` (num portal) para
 * não ser cortada pela rolagem horizontal da tabela; rolar ou redimensionar fecha.
 */
export function MenuAcoesPessoa({ nome, acoes }: { nome: string; acoes: AcaoPessoa[] }) {
  const id = useId()
  const botaoRef = useRef<HTMLButtonElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const [posicao, setPosicao] = useState<{ top: number; right: number; acima: boolean } | null>(null)
  const visiveis = acoes.filter((acao) => !acao.oculta)

  function abrir() {
    const caixa = botaoRef.current?.getBoundingClientRect()
    if (!caixa) return
    const acima = window.innerHeight - caixa.bottom < 60 + visiveis.length * 42
    setPosicao({ top: acima ? caixa.top - 6 : caixa.bottom + 6, right: window.innerWidth - caixa.right, acima })
  }

  function fechar(devolverFoco = false) {
    setPosicao(null)
    if (devolverFoco) botaoRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (posicao) listaRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [posicao])

  useEffect(() => {
    if (!posicao) return
    const fora = (event: PointerEvent) => {
      const alvo = event.target as Node
      if (!listaRef.current?.contains(alvo) && !botaoRef.current?.contains(alvo)) fechar()
    }
    const sumir = () => fechar()
    document.addEventListener('pointerdown', fora)
    window.addEventListener('scroll', sumir, true)
    window.addEventListener('resize', sumir)
    return () => {
      document.removeEventListener('pointerdown', fora)
      window.removeEventListener('scroll', sumir, true)
      window.removeEventListener('resize', sumir)
    }
  }, [posicao])

  function teclar(event: KeyboardEvent<HTMLDivElement>) {
    const itens = [...(listaRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const atual = itens.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      fechar(true)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const passo = event.key === 'ArrowDown' ? 1 : -1
      itens[(atual + passo + itens.length) % itens.length]?.focus()
    }
  }

  if (visiveis.length === 0) return null

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className={posicao ? 'acoes-pessoa-botao aberto' : 'acoes-pessoa-botao'}
        aria-label={`Ações de ${nome}`}
        title="Ações"
        aria-haspopup="menu"
        aria-expanded={Boolean(posicao)}
        aria-controls={posicao ? id : undefined}
        onClick={() => (posicao ? fechar() : abrir())}
      >
        <IconePontos tamanho={18} />
      </button>
      {posicao &&
        createPortal(
          <div
            ref={listaRef}
            id={id}
            role="menu"
            aria-label={`Ações de ${nome}`}
            className="acoes-pessoa-lista"
            style={{ top: posicao.top, right: posicao.right, transform: posicao.acima ? 'translateY(-100%)' : undefined }}
            onKeyDown={teclar}
          >
            {visiveis.map((acao, indice) => (
              <button
                key={acao.rotulo}
                type="button"
                role="menuitem"
                className={[
                  'acoes-pessoa-item',
                  acao.perigo ? 'perigo' : '',
                  // separa as ações perigosas das comuns
                  acao.perigo && indice > 0 && !visiveis[indice - 1].perigo ? 'separada' : '',
                ].join(' ')}
                onClick={() => {
                  fechar()
                  acao.onClick()
                }}
              >
                {acao.icone}
                {acao.rotulo}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

export function PaginacaoPessoas({
  pagina,
  totalPaginas,
  onPagina,
}: {
  pagina: number
  totalPaginas: number
  onPagina: (pagina: number) => void
}) {
  if (totalPaginas <= 1) return null
  return (
    <nav className="pessoas-paginacao" aria-label="Paginação">
      <span>
        Página {pagina} de {totalPaginas}
      </span>
      <div className="pessoas-paginacao-botoes">
        <button type="button" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
          Anterior
        </button>
        <button type="button" disabled={pagina >= totalPaginas} onClick={() => onPagina(pagina + 1)}>
          Próxima
        </button>
      </div>
    </nav>
  )
}
