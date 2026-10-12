import { ApiError } from '@/core/http/ApiError'
import type { StorageApi } from '../api/storageApi'
import { TIPO_FOTO } from '../api/storageApi'
import { MENSAJES_SUBIDA, SubidaError, subirBlobAGcs } from '../api/subidaGcs'
import type { FotoStorePort } from './fotoStorePort'

/**
 * Cuántas veces se pide una URL firmada nueva cuando GCS responde 403 (la URL venció o no es válida):
 * la primera + 2 renovaciones. Después se deja de insistir y se muestra el error.
 */
export const RENOVACIONES_DE_URL = 2

export type ResultadoSubida =
  /** Ya está en el almacenamiento. */
  | { tipo: 'subida'; storageKey: string }
  /** Falló; la foto queda `failed_upload` con el motivo. `reintentable` dice si «Reintentar» puede servir. */
  | { tipo: 'fallida'; mensaje: string; reintentable: boolean }
  /** La foto ya no está (se repitió la zona o se borró) o ya la resolvió otra pestaña: no hay nada que hacer. */
  | { tipo: 'ausente' }

export interface InstantaneaSubidas {
  /** Las fotos (por `clientId`) que se están subiendo ahora mismo. */
  readonly enCurso: ReadonlySet<string>
}

export interface OpcionesSubidaFotos {
  store: FotoStorePort
  storage: StorageApi
  /** Solo se sustituye en las pruebas. Por defecto {@link subirBlobAGcs}. */
  subir?: typeof subirBlobAGcs
}

const MENSAJE_FOTO_AUSENTE = 'La foto ya no está en este teléfono. Vuelve a tomarla.'
const MENSAJE_SIN_CONEXION = 'Sin conexión: no se pudo subir la foto.'

/**
 * Sube las fotos a GCS **una por una y en cuanto se toman** (E4-01). No hay cola ni reintentos
 * automáticos: si falla, la foto queda `failed_upload` y el operario pulsa «Reintentar».
 *
 * - **Cada intento lee el archivo del almacén** (no de una copia en memoria): si ya no está, falla sin
 *   reintentar.
 * - **El token de sesión solo va al backend** (para pedir la URL), nunca a GCS.
 * - **Una subida por foto a la vez:** pedir `subir` dos veces para la misma foto comparte la primera.
 * - Es lo único que escribe `uploaded` / `failed_upload`; el resultado se aplica solo si la foto sigue
 *   existiendo (ver `FotoStorePort.marcarSubida`).
 */
export class SubidaFotos {
  readonly #store: FotoStorePort
  readonly #storage: StorageApi
  readonly #subir: typeof subirBlobAGcs

  #instantanea: InstantaneaSubidas = { enCurso: new Set() }
  readonly #escuchas = new Set<() => void>()
  readonly #activas = new Map<string, Promise<ResultadoSubida>>()

  constructor(opciones: OpcionesSubidaFotos) {
    this.#store = opciones.store
    this.#storage = opciones.storage
    this.#subir = opciones.subir ?? subirBlobAGcs
  }

  readonly getSnapshot = (): InstantaneaSubidas => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /** Sube una foto `pending`. Si ya se está subiendo, devuelve esa misma subida. */
  subir(clientId: string): Promise<ResultadoSubida> {
    const activa = this.#activas.get(clientId)
    if (activa) return activa
    this.#cambiarEnCurso(clientId, true)
    const nueva = this.#subirUna(clientId).finally(() => {
      this.#activas.delete(clientId)
      this.#cambiarEnCurso(clientId, false)
    })
    this.#activas.set(clientId, nueva)
    return nueva
  }

  /** «Reintentar»: devuelve la foto fallida a `pending` y vuelve a subirla. `ausente` si ya no estaba fallida. */
  async reintentar(clientId: string): Promise<ResultadoSubida> {
    if (this.#activas.has(clientId)) return this.subir(clientId)
    let lista: boolean
    try {
      lista = await this.#store.prepararReintento(clientId)
    } catch {
      return { tipo: 'fallida', mensaje: 'No se pudo preparar el reintento.', reintentable: true }
    }
    return lista ? this.subir(clientId) : { tipo: 'ausente' }
  }

  // --- Internos ------------------------------------------------------------------------------

  async #subirUna(clientId: string): Promise<ResultadoSubida> {
    try {
      // AC7: el archivo se lee del almacén en cada intento.
      const blob = await this.#store.leerBlob(clientId)
      if (!blob) return this.#fallar(clientId, MENSAJE_FOTO_AUSENTE, false)

      let ultimoFallo: { mensaje: string; reintentable: boolean } = { mensaje: MENSAJES_SUBIDA.red, reintentable: true }
      for (let intento = 0; intento <= RENOVACIONES_DE_URL; intento++) {
        const permiso = await this.#pedirPermiso()
        if ('fallo' in permiso) return this.#fallar(clientId, permiso.fallo.mensaje, permiso.fallo.reintentable)

        try {
          await this.#subir(permiso.urlDeSubida, blob, TIPO_FOTO)
        } catch (error) {
          if (!(error instanceof SubidaError)) return this.#fallar(clientId, MENSAJES_SUBIDA.red, true)
          ultimoFallo = { mensaje: error.message, reintentable: error.reintentable }
          if (error.tipo === 'vencida' && intento < RENOVACIONES_DE_URL) continue // pedir una URL nueva
          return this.#fallar(clientId, ultimoFallo.mensaje, ultimoFallo.reintentable)
        }

        // Subida hecha. Si la foto ya no existe, o ya la marcó otra pestaña, el archivo quedó en el bucket
        // sin referencia (no hay forma de borrarlo): no es un error del operario.
        const marcada = await this.#store.marcarSubida(clientId, permiso.storageKey)
        return marcada ? { tipo: 'subida', storageKey: permiso.storageKey } : { tipo: 'ausente' }
      }
      return this.#fallar(clientId, ultimoFallo.mensaje, ultimoFallo.reintentable)
    } catch {
      // Un fallo del propio almacén local (IndexedDB): se avisa, sin dejar la foto en un estado a medias.
      return this.#fallar(clientId, 'No se pudo leer la foto de este teléfono.', true)
    }
  }

  async #pedirPermiso(): Promise<{ urlDeSubida: string; storageKey: string } | { fallo: { mensaje: string; reintentable: boolean } }> {
    try {
      const { urlDeSubida, storageKey } = await this.#storage.pedirUrlDeSubida()
      return { urlDeSubida, storageKey }
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) return { fallo: { mensaje: MENSAJE_SIN_CONEXION, reintentable: true } }
      const mensaje = error instanceof ApiError ? error.message : 'No se pudo preparar la subida de la foto.'
      // Un 4xx del backend (salvo 429) no se arregla reintentando; un 5xx o el límite de peticiones, sí.
      const status = error instanceof ApiError ? error.status : undefined
      const reintentable = status === undefined || status >= 500 || status === 429
      return { fallo: { mensaje, reintentable } }
    }
  }

  async #fallar(clientId: string, mensaje: string, reintentable: boolean): Promise<ResultadoSubida> {
    // Si la foto ya no existe no hay dónde anotar el fallo, y no importa: nadie la está mirando.
    await this.#store.marcarFalloSubida(clientId, mensaje).catch(() => undefined)
    return { tipo: 'fallida', mensaje, reintentable }
  }

  #cambiarEnCurso(clientId: string, subiendo: boolean): void {
    const siguiente = new Set(this.#instantanea.enCurso)
    if (subiendo) siguiente.add(clientId)
    else siguiente.delete(clientId)
    this.#instantanea = { enCurso: siguiente }
    for (const escucha of [...this.#escuchas]) escucha()
  }
}
