/**
 * URL base del API.
 *
 * Vacía por defecto: las peticiones van a una ruta relativa del mismo origen (proxy de Vite en
 * desarrollo, nginx en producción). El portal cae a `http://localhost:8050` cuando la variable
 * está vacía; aquí no, porque un teléfono no puede alcanzar el `localhost` de la PC y porque
 * la cookie de refresh solo viaja bien si el API cuelga del mismo origen (decisión D1 = A).
 *
 * `VITE_API_URL` existe solo como escape explícito.
 */
export function getApiBaseUrl(): string {
  const configurada = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? ''
  return configurada.replace(/\/+$/, '')
}

export function buildApiUrl(path: string, base: string = getApiBaseUrl()): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizada = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizada}`
}
