import type { SVGProps } from 'react'

/** Iconos de línea, decorativos (`aria-hidden`): siempre van junto a un texto que dice lo mismo. */
function Icono({ children, strokeWidth = 2, ...resto }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  )
}

export const IconoBuscar = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icono>
)
export const IconoFiltro = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M3 5h18l-7 8v6l-4-2v-4z" />
  </Icono>
)
export const IconoFlecha = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icono>
)
export const IconoActualizar = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 4v5h-5" />
  </Icono>
)
export const IconoVolver = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icono>
)
export const IconoVisto = (p: SVGProps<SVGSVGElement>) => (
  <Icono strokeWidth={3} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icono>
)
export const IconoCerrar = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icono>
)
export const IconoFlechaDerecha = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icono>
)
export const IconoCalendario = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icono>
)
