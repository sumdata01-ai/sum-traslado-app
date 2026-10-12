/**
 * Por qué falló una subida a GCS. Cada tipo dice algo distinto y cambia lo que se le ofrece al operario:
 * - `vencida` (403): la URL firmada venció o no es válida; se pide una nueva, no es culpa de la red.
 * - `rechazada` (otro 4xx): el almacenamiento no acepta el archivo; reintentar no lo arregla.
 * - `servidor` (5xx): el almacenamiento falló; sí puede arreglarse reintentando.
 * - `red` (el navegador ni siquiera completó la petición): sin conexión, o el bucket no deja subir
 *   desde este origen (CORS). El navegador **no distingue** las dos cosas, así que el mensaje tampoco.
 */
export type TipoFalloSubida = 'vencida' | 'rechazada' | 'servidor' | 'red'

export class SubidaError extends Error {
  readonly tipo: TipoFalloSubida
  readonly status: number | null
  /** Reintentar con el mismo archivo puede salir bien. */
  readonly reintentable: boolean

  constructor(tipo: TipoFalloSubida, mensaje: string, status: number | null = null) {
    super(mensaje)
    this.name = 'SubidaError'
    this.tipo = tipo
    this.status = status
    this.reintentable = tipo !== 'rechazada'
  }
}

export const MENSAJES_SUBIDA: Record<TipoFalloSubida, string> = {
  vencida: 'El permiso para subir la foto venció.',
  rechazada: 'El almacenamiento rechazó la foto.',
  servidor: 'El almacenamiento tuvo un problema. Reintenta en un momento.',
  red: 'No se pudo subir la foto: revisa tu conexión o los permisos del almacenamiento.',
}

export interface OpcionesSubida {
  /** Por defecto `fetch`. */
  fetchImpl?: typeof fetch
  /** Tiempo máximo de una subida, en ms. Por defecto {@link TIEMPO_MAXIMO_SUBIDA_MS}. */
  tiempoMaximoMs?: number
}

/** Una foto de ~1 MB con mala señal puede tardar; más que esto casi seguro que no va a terminar. */
export const TIEMPO_MAXIMO_SUBIDA_MS = 60_000

/**
 * Sube un archivo a la URL firmada con `PUT`.
 *
 * - Lleva el **mismo `Content-Type`** con el que se firmó la URL: con otro, GCS rechaza la firma.
 * - **Sin `Authorization` ni cookies:** la URL ya trae el permiso, y mandar el token de sesión a un
 *   dominio ajeno sería una fuga (además de que el bucket no lo espera).
 *
 * Resuelve si GCS contestó 2xx; si no, rechaza con un {@link SubidaError}.
 */
export async function subirBlobAGcs(urlDeSubida: string, blob: Blob, tipo: string, opciones: OpcionesSubida = {}): Promise<void> {
  const fetchImpl = opciones.fetchImpl ?? fetch
  const limite = opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_SUBIDA_MS

  let respuesta: Response
  try {
    respuesta = await fetchImpl(urlDeSubida, {
      method: 'PUT',
      headers: { 'Content-Type': tipo },
      body: blob,
      credentials: 'omit',
      signal: AbortSignal.timeout(limite),
    })
  } catch {
    // `TypeError` por red caída o por CORS, o el tiempo agotado: desde el navegador no se distinguen.
    throw new SubidaError('red', MENSAJES_SUBIDA.red)
  }

  if (respuesta.ok) return
  if (respuesta.status === 403) throw new SubidaError('vencida', MENSAJES_SUBIDA.vencida, 403)
  if (respuesta.status >= 500) throw new SubidaError('servidor', MENSAJES_SUBIDA.servidor, respuesta.status)
  throw new SubidaError('rechazada', MENSAJES_SUBIDA.rechazada, respuesta.status)
}
