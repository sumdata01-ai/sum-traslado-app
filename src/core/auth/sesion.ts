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
