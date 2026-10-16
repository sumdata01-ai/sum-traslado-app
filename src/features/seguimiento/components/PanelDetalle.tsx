import { type ReactNode, useEffect, useRef } from 'react'

const ENFOCABLES = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

export interface PanelDetalleProps {
  children: ReactNode
  /** Cierra el panel (botón «Cerrar», Escape o tocar fuera). */
  onCerrar: () => void
  /** El elemento que lo abrió: recibe el foco de vuelta al cerrar. */
  devolverFoco: HTMLElement | null
  /** El nombre del diálogo para quien usa un lector de pantalla. Por defecto, el del traslado. */
  etiqueta?: string
}

/**
 * El detalle como ventana por encima de la lista: a pantalla completa en el teléfono y como panel a la derecha en pantalla
 * ancha. Así se ve siempre, sin importar cuánto se haya bajado por la lista (antes iba debajo de la tabla).
 *
 * Es un diálogo modal: el foco entra al abrir, no sale con Tab, Escape lo cierra y el foco vuelve a quien lo abrió. La página
 * de atrás no se desplaza mientras está abierto.
 */
export function PanelDetalle({ children, onCerrar, devolverFoco, etiqueta = 'Detalle del traslado' }: PanelDetalleProps) {
  const panel = useRef<HTMLDivElement>(null)
  // El último `onCerrar`/`devolverFoco` sin volver a montar los efectos cuando la página se renueva (cada minuto).
  const cerrar = useRef(onCerrar)
  const volver = useRef(devolverFoco)
  useEffect(() => {
    cerrar.current = onCerrar
    volver.current = devolverFoco
  })

  useEffect(() => {
    const { body, documentElement } = document
    const overflow = body.style.overflow
    const relleno = body.style.paddingRight
    // Al bloquear el desplazamiento de la página desaparece su barra y todo el contenido se correría a la derecha por el ancho
    // de esa barra: se compensa con un margen igual mientras el panel está abierto. En un teléfono (barra superpuesta) es 0.
    const barra = documentElement.clientWidth > 0 ? Math.max(0, window.innerWidth - documentElement.clientWidth) : 0
    body.style.overflow = 'hidden'
    if (barra > 0) body.style.paddingRight = `${barra}px`
    panel.current?.querySelector<HTMLElement>('[data-cerrar]')?.focus()
    return () => {
      body.style.overflow = overflow
      body.style.paddingRight = relleno
      volver.current?.focus()
    }
  }, [])

  const alTeclear = (evento: React.KeyboardEvent) => {
    if (evento.key === 'Escape') {
      evento.stopPropagation()
      cerrar.current()
      return
    }
    if (evento.key !== 'Tab' || !panel.current) return
    const enfocables = [...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)]
    const primero = enfocables[0]
    const ultimo = enfocables[enfocables.length - 1]
    if (!primero || !ultimo) return
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault()
      ultimo.focus()
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault()
      primero.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-40" onKeyDown={alTeclear}>
      <div aria-hidden="true" data-fondo onClick={onCerrar} className="absolute inset-0 hidden bg-ink-1/40 md:block" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        className="absolute inset-0 overflow-y-auto bg-surface md:right-0 md:left-auto md:w-[560px] md:shadow-2xl"
      >
        {children}
      </div>
    </div>
  )
}
