import { buildApiUrl } from '@/core/config/apiBase'
import { ApiError } from './ApiError'

/** Evento que se emite cuando la sesión terminó y hay que volver al login. */
export const SESION_EXPIRADA_EVENT = 'auth:session-expired'

const TIMEOUT_POR_DEFECTO_MS = 12_000
const MENSAJE_SIN_CONEXION = 'Sin conexión al backend o internet.'
const MENSAJE_SESION_EXPIRADA = 'Sesión expirada. Inicia sesión nuevamente.'
const MENSAJE_PERMISO_REVOCADO = 'Tu permiso ha sido revocado. Contacta al supervisor.'
const MENSAJE_DEMASIADOS_INTENTOS = 'Demasiados intentos. Intenta en unos momentos.'

/**
 * Resultado de renovar la sesión. Se distingue la falta de red de la sesión vencida porque piden
 * cosas opuestas: sin red no se cierra la sesión (el operario puede seguir con sus fotos), con la
 * sesión vencida sí. Mismo criterio que `SessionRefreshResult` de la app.
 */
export type ResultadoRefresh = 'ok' | 'expirada' | 'sin_conexion'

export interface OpcionesApiClient {
  /** Access token actual, o `null` si no hay sesión. */
  getToken: () => string | null
  /**
   * Renueva la sesión. El cliente no sabe cómo: eso depende del esquema de login (D1 = cookie en
   * `/api/refresh`) y vive en el módulo de autenticación. Si lanza, se trata como `sin_conexion`.
   */
  refreshSession: () => Promise<ResultadoRefresh>
  /** Borra token y metadatos de la sesión. Se llama una sola vez por cada expiración. */
  limpiarSesion: () => void
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Dónde se emite {@link SESION_EXPIRADA_EVENT}. Por defecto `window`. */
  eventTarget?: EventTarget
}

export interface OpcionesPeticion {
  /**
   * Por defecto un 403 se lee como «permiso revocado» y cierra la sesión. Un endpoint cuyo 403
   * signifique otra cosa pasa `false` y recibe la respuesta tal cual. Es explícito y por llamada,
   * para que un endpoint nuevo no herede la excepción sin querer.
   */
  cerrarSesionEn403?: boolean
}

export interface OpcionesJson extends OpcionesPeticion {
  fallbackError?: string
  query?: Record<string, string>
  headers?: HeadersInit
}

const ENDPOINTS_DE_SESION = ['/api/login', '/api/refresh', '/api/logout']

const esUrlAbsoluta = (path: string) => /^https?:\/\//i.test(path)
const esEndpointDeSesion = (path: string) => ENDPOINTS_DE_SESION.some((s) => path.includes(s))

async function extraerMensaje(respuesta: Response, fallback: string): Promise<string> {
  try {
    const cuerpo: unknown = await respuesta.json()
    if (cuerpo && typeof cuerpo === 'object') {
      const { detail, message } = cuerpo as { detail?: unknown; message?: unknown }
      const texto = detail ?? message
      if (typeof texto === 'string' && texto) return texto
      // FastAPI responde los 422 con una lista de { loc, msg, type }.
      if (Array.isArray(texto)) {
        const mensajes = texto.map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : String(d)))
        if (mensajes.length > 0) return mensajes.join('; ')
      }
    }
  } catch {
    // Cuerpo vacío o que no es JSON: se usa el mensaje de respaldo.
  }
  return fallback
}

export function createApiClient(opciones: OpcionesApiClient) {
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS
  let refreshEnCurso: Promise<ResultadoRefresh> | null = null

  function expirarSesion(): void {
    opciones.limpiarSesion()
    const destino = opciones.eventTarget ?? (typeof window !== 'undefined' ? window : undefined)
    destino?.dispatchEvent(new CustomEvent(SESION_EXPIRADA_EVENT))
  }

  /**
   * Un solo refresh compartido: si cinco llamadas reciben 401 a la vez, se renueva una vez. Si la
   * sesión expiró, también se expira una sola vez y no una por llamada.
   */
  function renovar(): Promise<ResultadoRefresh> {
    if (!refreshEnCurso) {
      refreshEnCurso = (async () => {
        try {
          const resultado = await opciones.refreshSession()
          if (resultado === 'expirada') expirarSesion()
          return resultado
        } catch {
          return 'sin_conexion'
        } finally {
          refreshEnCurso = null
        }
      })()
    }
    return refreshEnCurso
  }

  async function enviar(path: string, init: RequestInit, conToken: boolean): Promise<Response> {
    const headers = new Headers(init.headers)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    const token = opciones.getToken()
    if (conToken && token) headers.set('Authorization', `Bearer ${token}`)

    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs)
    try {
      const fetchFn = opciones.fetchImpl ?? globalThis.fetch.bind(globalThis)
      return await fetchFn(buildApiUrl(path), { ...init, headers, signal: controlador.signal })
    } catch {
      throw new ApiError(MENSAJE_SIN_CONEXION)
    } finally {
      clearTimeout(temporizador)
    }
  }

  /**
   * Envía la petición con el token y, ante un 401, renueva la sesión y reintenta **una vez**.
   *
   * El token nunca viaja a una URL absoluta: la subida a GCS usa una URL firmada y no debe llevar
   * `Authorization`. Los endpoints de sesión (`/api/login`, `/api/refresh`, `/api/logout`) tampoco
   * llevan token ni disparan un refresh: su 401 es «credenciales inválidas», no «sesión vencida».
   */
  async function request(path: string, init: RequestInit = {}, { cerrarSesionEn403 = true }: OpcionesPeticion = {}) {
    const conToken = !esUrlAbsoluta(path) && !esEndpointDeSesion(path)

    let respuesta = await enviar(path, init, conToken)

    if (respuesta.status === 403 && cerrarSesionEn403 && conToken) {
      expirarSesion()
      throw new ApiError(MENSAJE_PERMISO_REVOCADO, { status: 403 })
    }
    if (respuesta.status !== 401 || !conToken) return respuesta

    const refresh = await renovar()
    if (refresh === 'sin_conexion') throw new ApiError(MENSAJE_SIN_CONEXION)
    if (refresh === 'expirada') throw new ApiError(MENSAJE_SESION_EXPIRADA, { status: 401 })

    respuesta = await enviar(path, init, conToken)
    if (respuesta.status === 401) {
      expirarSesion()
      throw new ApiError(MENSAJE_SESION_EXPIRADA, { status: 401 })
    }
    if (respuesta.status === 403 && cerrarSesionEn403) {
      expirarSesion()
      throw new ApiError(MENSAJE_PERMISO_REVOCADO, { status: 403 })
    }
    return respuesta
  }

  async function leerJson<T>(respuesta: Response, fallbackError: string): Promise<T> {
    if (!respuesta.ok) {
      const respaldo = respuesta.status === 429 ? MENSAJE_DEMASIADOS_INTENTOS : fallbackError
      throw new ApiError(await extraerMensaje(respuesta, respaldo), { status: respuesta.status })
    }
    return (await respuesta.json()) as T
  }

  async function getJson<T>(path: string, { fallbackError = 'No se pudo completar la consulta.', query, headers, ...peticion }: OpcionesJson = {}) {
    const url = query ? `${path}?${new URLSearchParams(query).toString()}` : path
    const respuesta = await request(url, { method: 'GET', headers }, peticion)
    return leerJson<T>(respuesta, fallbackError)
  }

  async function postJson<T>(
    path: string,
    cuerpo?: unknown,
    { fallbackError = 'No se pudo completar la operación.', headers, ...peticion }: OpcionesJson = {},
  ) {
    const cabeceras = new Headers(headers)
    if (cuerpo !== undefined && !cabeceras.has('Content-Type')) cabeceras.set('Content-Type', 'application/json')
    const respuesta = await request(
      path,
      { method: 'POST', headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) },
      peticion,
    )
    return leerJson<T>(respuesta, fallbackError)
  }

  return { request, getJson, postJson }
}

export type ApiClient = ReturnType<typeof createApiClient>
