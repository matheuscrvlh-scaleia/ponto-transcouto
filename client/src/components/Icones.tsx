import type { ReactNode, SVGProps } from 'react'

type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { tamanho?: number }

function Base({ tamanho = 18, children, ...resto }: Props & { children: ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  )
}

export function IconePainel(props: Props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </Base>
  )
}

export function IconeAjustes(props: Props) {
  return (
    <Base {...props}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Base>
  )
}

export function IconeChave(props: Props) {
  return (
    <Base {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" />
    </Base>
  )
}

export function IconeSair(props: Props) {
  return (
    <Base {...props}>
      <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 16l-4-4 4-4M6 12h9" />
    </Base>
  )
}

export function IconeMenu(props: Props) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  )
}

export function IconeSetaDiagonal(props: Props) {
  return (
    <Base {...props}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Base>
  )
}

export function IconeOlho(props: Props) {
  return (
    <Base {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Base>
  )
}

export function IconeRelogio(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  )
}

export function IconeCalendario(props: Props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Base>
  )
}

export function IconeMais(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  )
}

export function IconeMenos(props: Props) {
  return (
    <Base {...props}>
      <path d="M5 12h14" />
    </Base>
  )
}

export function IconeBanco(props: Props) {
  return (
    <Base {...props}>
      <path d="M3.5 9.5 12 4l8.5 5.5M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 20h17" />
    </Base>
  )
}

export function IconeMoeda(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.6-1.2M12 6.5V8M12 16v1.5" />
    </Base>
  )
}

export function IconeMedia(props: Props) {
  return (
    <Base {...props}>
      <path d="M4 19h16M7 15v-3M12 15V8M17 15v-5" />
    </Base>
  )
}

export function IconeUnidade(props: Props) {
  return (
    <Base {...props}>
      <path d="M4 20V8.5L12 4l8 4.5V20" />
      <path d="M9 20v-5h6v5M3 20h18" />
    </Base>
  )
}

export function IconeSeletor(props: Props) {
  return (
    <Base {...props}>
      <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
    </Base>
  )
}

export function IconeCheck(props: Props) {
  return (
    <Base {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Base>
  )
}

export function IconeSol(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" />
    </Base>
  )
}

export function IconeLua(props: Props) {
  return (
    <Base {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </Base>
  )
}

export function IconeSino(props: Props) {
  return (
    <Base {...props}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Base>
  )
}

export function IconeEmail(props: Props) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7.5 8 5.5 8-5.5" />
    </Base>
  )
}

export function IconeEscudo(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </Base>
  )
}

export function IconeUsuarios(props: Props) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5c.7-3.3 3.3-5.3 6.5-5.3s5.8 2 6.5 5.3" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.6c1.9.7 3.1 2.4 3.5 4.9" />
    </Base>
  )
}

export function IconeColunas(props: Props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M9.5 4v16M15 4v16" />
    </Base>
  )
}

export function IconeEmpresa(props: Props) {
  return (
    <Base {...props}>
      <path d="M4 20.5V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5v15" />
      <path d="M14 9.5h4.5A1.5 1.5 0 0 1 20 11v9.5M2.5 20.5h19" />
      <path d="M7.5 8h3M7.5 11.5h3M7.5 15h3M17 13.5h0M17 17h0" />
    </Base>
  )
}

export function IconeSetaBaixo(props: Props) {
  return (
    <Base {...props}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  )
}
