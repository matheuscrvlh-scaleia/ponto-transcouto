import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEmpresaAdmin } from '../context/EmpresaAdminContext'
import { api } from '../lib/api'
import { formatarData, formatarDataHora } from '../lib/formato'
import { lerNotificacoesVistas, salvarNotificacoesVistas } from '../lib/preferencias'
import { useRecurso } from '../lib/useRecurso'
import type { UnidadeResumo } from '../types/api'
import { IconeSino } from './Icones'

/** Publicações mais antigas que isso não contam como novidade no sino. */
const JANELA_NOVIDADE_MS = 14 * 24 * 60 * 60 * 1000
const MAXIMO_ITENS = 8
const LARGURA_PAINEL = 320

/* Sino da sidebar: avisa quando chegam dados novos (fechamento publicado)
   das unidades do usuário. "Não lidas" = publicadas depois da última vez
   que o painel foi aberto, guardado por usuário no navegador. */
export function Notificacoes() {
  const { usuario } = useAuth()
  const { query: empresaQuery } = useEmpresaAdmin()
  const location = useLocation()
  const id = useId()
  const botaoRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const [abertoEm, setAbertoEm] = useState<string | null>(null)
  const [destacadas, setDestacadas] = useState<number[]>([])
  const [posicao, setPosicao] = useState<CSSProperties>({})
  const [vistasAte, setVistasAte] = useState(() => (usuario ? lerNotificacoesVistas(usuario) : null))
  const { dados, erro, carregando, recarregar } = useRecurso(
    (signal) => api<UnidadeResumo[]>('/unidades', { signal, query: empresaQuery }),
    `notificacoes-${usuario ? `${usuario.tipo}-${usuario.id}` : 0}-${empresaQuery.empresa_id ?? 'todas'}`,
  )

  const [agora] = useState(() => Date.now())
  const itens = (dados ?? [])
    .filter((unidade) => unidade.ultimo_fechamento)
    .map((unidade) => {
      const publicadoEm = unidade.ultimo_fechamento!.publicado_em
      const momento = new Date(publicadoEm).getTime()
      const nova = agora - momento < JANELA_NOVIDADE_MS && (!vistasAte || momento > new Date(vistasAte).getTime())
      return { unidade, publicadoEm, momento, nova }
    })
    .sort((a, b) => b.momento - a.momento)
    .slice(0, MAXIMO_ITENS)
  const naoLidas = itens.filter((item) => item.nova).length

  // fecha sozinho ao trocar de página
  const aberto = abertoEm === location.pathname
  const setAberto = (valor: boolean) => setAbertoEm(valor ? location.pathname : null)

  useEffect(() => {
    if (!aberto) return
    function fecharFora(event: PointerEvent) {
      const alvo = event.target as Node
      if (!painelRef.current?.contains(alvo) && !botaoRef.current?.contains(alvo)) setAbertoEm(null)
    }
    function teclar(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAbertoEm(null)
        botaoRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', fecharFora)
    document.addEventListener('keydown', teclar)
    return () => {
      document.removeEventListener('pointerdown', fecharFora)
      document.removeEventListener('keydown', teclar)
    }
  }, [aberto])

  function alternar() {
    if (aberto) return setAberto(false)

    // O painel é fixo na tela (a sidebar rola e cortaria um popover absoluto):
    // abre para cima, a partir do sino, sem sair da janela.
    const rect = botaoRef.current?.getBoundingClientRect()
    if (rect) {
      const largura = Math.min(LARGURA_PAINEL, window.innerWidth - 24)
      setPosicao({
        width: largura,
        left: Math.max(12, Math.min(rect.left - 12, window.innerWidth - largura - 12)),
        bottom: window.innerHeight - rect.top + 10,
      })
    }
    setAberto(true)
    recarregar()

    // o badge zera, mas as novas continuam destacadas enquanto o painel está aberto
    setDestacadas(itens.filter((item) => item.nova).map((item) => item.unidade.id))
    if (usuario && itens.length > 0) {
      salvarNotificacoesVistas(usuario, itens[0].publicadoEm)
      setVistasAte(itens[0].publicadoEm)
    }
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className={aberto ? 'notif-botao aberto' : 'notif-botao'}
        aria-label={naoLidas ? `Notificações: ${naoLidas} novas` : 'Notificações'}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={`${id}-painel`}
        onClick={alternar}
      >
        <IconeSino tamanho={20} />
        {naoLidas > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto &&
        // portal: a sidebar (sticky) cria um contexto de empilhamento próprio e o
        // painel ficaria por baixo do conteúdo da página
        createPortal(
          <div
            ref={painelRef}
            id={`${id}-painel`}
            className="notif-painel"
            role="dialog"
            aria-label="Notificações"
            style={posicao}
          >
            <header className="notif-cabecalho">
              <strong>Notificações</strong>
              <span>Novos dados publicados</span>
            </header>
  
            {carregando && itens.length === 0 && <p className="notif-vazio">Carregando…</p>}
            {erro && itens.length === 0 && <p className="notif-vazio">Não foi possível carregar as notificações.</p>}
            {!carregando && !erro && itens.length === 0 && (
              <p className="notif-vazio">Nenhuma novidade por enquanto.</p>
            )}
  
            {itens.length > 0 && (
              <ul className="notif-lista">
                {itens.map(({ unidade, publicadoEm }) => (
                  <li key={unidade.id}>
                    <Link
                      to={`/unidades/${unidade.id}`}
                      className={destacadas.includes(unidade.id) ? 'notif-item nova' : 'notif-item'}
                    >
                      <span className="notif-ponto" aria-hidden="true" />
                      <span className="notif-texto">
                        <span className="notif-titulo">
                          {unidade.nome_exibicao}: dados até {formatarData(unidade.ultimo_fechamento?.data_referencia)}
                        </span>
                        {unidade.total_colaboradores !== undefined && (
                          <span className="notif-detalhe">
                            {unidade.total_colaboradores} colaboradores
                            {unidade.fora_da_curva ? ` · ${unidade.fora_da_curva} fora da curva` : ''}
                          </span>
                        )}
                        <span className="notif-quando">Publicado em {formatarDataHora(publicadoEm)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
