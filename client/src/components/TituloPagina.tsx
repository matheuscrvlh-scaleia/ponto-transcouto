import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* O título de cada página aparece no centro da barra do topo (AppLayout).
   A página declara <TituloPagina> onde antes ficava o <h1>; o componente
   desenha o título lá no topo via portal e não ocupa espaço no corpo. */

const DestinoContext = createContext<HTMLElement | null>(null)

/** Usado pelo AppLayout: o elemento do topo que recebe o título. */
export function DestinoTitulo({ elemento, children }: { elemento: HTMLElement | null; children: ReactNode }) {
  return <DestinoContext.Provider value={elemento}>{children}</DestinoContext.Provider>
}

export function TituloPagina({ children }: { children: ReactNode }) {
  const destino = useContext(DestinoContext)
  if (!destino) return null
  return createPortal(<h1 className="app-topbar-titulo-texto">{children}</h1>, destino)
}
