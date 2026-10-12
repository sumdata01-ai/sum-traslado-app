import type { Sesion } from './AuthPort'

export const APP_TRASLADO = 'traslado'

/**
 * ¿Puede este usuario usar la aplicación? Lo decide `allowed_apps`, el catálogo que el supervisor
 * asigna a cada persona. Sin sesión no hay acceso.
 */
export function tieneAcceso(sesion: Sesion | null, app: string = APP_TRASLADO): boolean {
  return sesion?.allowedApps.includes(app) ?? false
}
