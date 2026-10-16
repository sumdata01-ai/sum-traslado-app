import type { Sesion } from './AuthPort'

export const APP_TRASLADO = 'traslado'

/** El rol que ve el seguimiento de los traslados (docs/07-planificacion/mapeo-rol-coordinador.md). */
export const ROL_COORDINADOR = 'coordinador'

/**
 * ¿Puede este usuario usar la aplicación? Lo decide `allowed_apps`, el catálogo que el supervisor
 * asigna a cada persona. Sin sesión no hay acceso.
 */
export function tieneAcceso(sesion: Sesion | null, app: string = APP_TRASLADO): boolean {
  return sesion?.allowedApps.includes(app) ?? false
}

/**
 * ¿Es coordinador? Entra a la vista de seguimiento **por su rol**, no por `allowed_apps` (decisión del 2026-10-15): ni lo
 * que su cuenta tenga ni lo que herede de un valor por defecto cambia a dónde va. La comparación es exacta, igual que la
 * del backend (`require_role`): un rol que se parezca («Coordinador», «coordinadores») no cuenta.
 */
export function esCoordinador(sesion: Sesion | null): boolean {
  return sesion?.role === ROL_COORDINADOR
}

/**
 * Los pares (rol, área) que ven el tablero de llegadas por QR, **a pedido del usuario el 2026-10-16**: supervisor de
 * Despacho, supervisor de Secado y asistente de Despacho; y `admin`, con cualquier área. Es el mismo criterio que el guard del
 * backend (`LLEGADA_QR_LECTOR_PARES` en `app/api/deps.py`): se mira el **par**, no solo el rol (un asistente de otra área no
 * entra). `secado_fisico` no entra. La comparación es exacta: «Supervisor» o «Despacho» no cuentan.
 *
 * Es solo para decidir qué pantalla mostrar: lo que de verdad cierra el paso es el servidor (responde 403 a cualquier otro).
 */
export const PARES_DEL_TABLERO: ReadonlyArray<readonly [string, string]> = [
  ['supervisor', 'despacho'],
  ['supervisor', 'secado'],
  ['asistente', 'despacho'],
]

export function puedeVerTablero(sesion: Sesion | null): boolean {
  if (!sesion) return false
  if (sesion.role === 'admin') return true
  return PARES_DEL_TABLERO.some(([role, area]) => sesion.role === role && sesion.area === area)
}
