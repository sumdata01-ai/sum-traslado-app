import { useCallback, useSyncExternalStore } from 'react'

/** La ruta del tablero de llegadas por QR (decidido el 2026-10-16). No empieza por `/api` ni `/mobile`: esas son del backend. */
export const RUTA_TABLERO = '/dashboard'

/** Un evento propio: `pushState` y `replaceState` no avisan a nadie (solo «atrás» y «adelante» disparan `popstate`). */
const EVENTO_RUTA = 'ruta:cambio'

/** `/dashboard/`, `/Dashboard` y `/dashboard?x=1` son el mismo lugar que `/dashboard`; la raíz es `/`. */
export function normalizarRuta(ruta: string): string {
  const sinParametros = (ruta.split(/[?#]/)[0] ?? '').toLowerCase()
  const sinBarraFinal = sinParametros.replace(/\/+$/, '')
  return sinBarraFinal === '' ? '/' : sinBarraFinal
}

/** La ruta actual del navegador, normalizada. */
export const rutaActual = (): string => normalizarRuta(window.location.pathname)

function suscribir(escucha: () => void): () => void {
  window.addEventListener('popstate', escucha)
  window.addEventListener(EVENTO_RUTA, escucha)
  return () => {
    window.removeEventListener('popstate', escucha)
    window.removeEventListener(EVENTO_RUTA, escucha)
  }
}

/**
 * Va a otra ruta **sin recargar la página** (la web no usa un router: qué pantalla se ve lo decide el estado y, ahora, la ruta
 * para el tablero). `reemplazar` cambia la dirección sin dejar una entrada nueva en el historial: se usa para corregir una
 * ruta que no corresponde (el botón «atrás» no vuelve a ella).
 */
export function navegar(ruta: string, { reemplazar = false }: { reemplazar?: boolean } = {}): void {
  if (normalizarRuta(ruta) === rutaActual()) return
  if (reemplazar) window.history.replaceState(null, '', ruta)
  else window.history.pushState(null, '', ruta)
  window.dispatchEvent(new Event(EVENTO_RUTA))
}

/** La ruta actual como estado de React, y cómo cambiarla. Se actualiza con el botón «atrás» del navegador. */
export function useRuta() {
  const ruta = useSyncExternalStore(suscribir, rutaActual, () => '/')
  const ir = useCallback((destino: string, opciones?: { reemplazar?: boolean }) => navegar(destino, opciones), [])
  return { ruta, navegar: ir }
}
