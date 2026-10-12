import type { ResultadoRefresh } from '@/core/http/apiClient'

/**
 * Quién es el usuario con sesión. **Nunca incluye el token**: el access token vive solo en memoria
 * y el refresh en una cookie HttpOnly que el JavaScript no puede leer.
 */
export interface Sesion {
  /**
   * El id del usuario en el backend, leído del token. Es lo que dice si dos sesiones son de la misma
   * persona. `null` si el token no lo trae.
   */
  idUsuario: number | null
  /** El nombre de usuario, leído del token (o de la respuesta del login). `null` si no se conoce. */
  usuario: string | null
  nombre: string | null
  role: string
  area: string | null
  /** Qué aplicaciones puede usar; decide si ve Traslado. */
  allowedApps: readonly string[]
}

/**
 * - `restaurando`: se está comprobando si quedó una sesión (al abrir o recargar la página).
 * - `sinSesion`: hay que iniciar sesión.
 * - `activa`: hay sesión.
 * - `sinConexion`: se conoce al usuario pero no se pudo comprobar su sesión por falta de red.
 */
export type EstadoSesion = 'restaurando' | 'sinSesion' | 'activa' | 'sinConexion'

export interface InstantaneaSesion {
  readonly estado: EstadoSesion
  readonly sesion: Sesion | null
}

export type ResultadoLogin =
  | { ok: true }
  | { ok: false; motivo: 'credenciales' | 'red' | 'limite' | 'servidor'; mensaje: string }

/**
 * Lo que el resto de la aplicación necesita de la autenticación. La implementación de hoy es la
 * opción A de la decisión D1 (cookie de refresh en `/api/login`); si se cambiara a la B, solo
 * cambia esta pieza.
 */
export interface AuthPort {
  readonly getSnapshot: () => InstantaneaSesion
  readonly suscribir: (escucha: () => void) => () => void

  /** El access token, para el cliente HTTP. Solo en memoria. */
  getToken(): string | null

  /** Al abrir la página: intenta recuperar la sesión con la cookie de refresh. */
  restaurar(): Promise<void>

  login(usuario: string, clave: string): Promise<ResultadoLogin>

  /** Cierra la sesión. Borra lo local aunque no haya red. */
  logout(): Promise<void>

  /** Para el cliente HTTP: renueva el token. Un solo refresco a la vez. */
  refrescarSesion(): Promise<ResultadoRefresh>

  /** Para el cliente HTTP: la sesión terminó, se borra todo lo local. */
  limpiarSesion(): void
}
