import { ApiError } from '@/core/http/ApiError'
import type { TrasladoApi } from '../api/trasladoApi'
import type { OpcionCatalogo } from '../domain'
import type { CatalogoCachePort } from './catalogoCache'

export interface InstantaneaCatalogo {
  /** Todavía no se leyó lo guardado: es la primera carga. */
  readonly cargando: boolean
  /** Hay una petición al servidor en curso. */
  readonly actualizando: boolean
  /** La última actualización falló por falta de red: se usa lo guardado. */
  readonly sinConexion: boolean
  /** Otro fallo (servidor caído, sin permiso, respuesta inesperada). Se sigue usando lo guardado. */
  readonly error: string | null
  readonly placas: readonly OpcionCatalogo[]
  readonly proveedores: readonly OpcionCatalogo[]
  /**
   * Nunca se descargó el catálogo en este dispositivo. Con esto el selector explica por qué está
   * vacío («conéctate una vez») en vez de mostrar una lista muda; un catálogo descargado pero
   * vacío es otra cosa.
   */
  readonly nuncaDescargado: boolean
}

const INICIAL: InstantaneaCatalogo = {
  cargando: true,
  actualizando: false,
  sinConexion: false,
  error: null,
  placas: [],
  proveedores: [],
  nuncaDescargado: true,
}

/**
 * Las placas y proveedores del selector de la salida (O-04). Lo guardado en el dispositivo se usa
 * primero y enseguida se pide lo último al servidor: **el operario elige en el pañol**, donde puede
 * no haber señal, y sin lo guardado el selector quedaría vacío justo cuando se usa.
 *
 * Un fallo de red o del servidor nunca vacía lo que se está mostrando. El catálogo no es de una
 * persona: no se borra al cerrar sesión.
 */
export class CatalogoTraslado {
  readonly #api: TrasladoApi
  readonly #cache: CatalogoCachePort

  #instantanea: InstantaneaCatalogo = INICIAL
  readonly #escuchas = new Set<() => void>()
  #generacion = 0
  #actualizacion: Promise<void> | null = null

  constructor(opciones: { api: TrasladoApi; cache: CatalogoCachePort }) {
    this.#api = opciones.api
    this.#cache = opciones.cache
  }

  readonly getSnapshot = (): InstantaneaCatalogo => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /** Muestra lo guardado y enseguida pide lo último al servidor. */
  async iniciar(): Promise<void> {
    const generacion = ++this.#generacion
    const guardado = await this.#cache.leer().catch(() => null) // sin disco: se sigue sin catálogo guardado
    if (generacion !== this.#generacion) return
    // Lo que ya se estaba mostrando (de una visita anterior a la pantalla) no se pisa con «vacío».
    if (guardado) this.#publicar({ cargando: false, placas: guardado.placas, proveedores: guardado.proveedores, nuncaDescargado: false })
    else this.#publicar({ cargando: false })
    await this.actualizar()
  }

  /** Pide el catálogo al servidor. Una sola petición a la vez. */
  actualizar(): Promise<void> {
    if (this.#actualizacion) return this.#actualizacion
    const actualizacion = this.#pedir().finally(() => {
      if (this.#actualizacion === actualizacion) this.#actualizacion = null
    })
    this.#actualizacion = actualizacion
    return actualizacion
  }

  /** La pantalla se desmontó: lo que llegue después se descarta. Lo guardado y lo mostrado no se tocan. */
  liberar(): void {
    this.#generacion++
    this.#actualizacion = null
  }

  async #pedir(): Promise<void> {
    const generacion = this.#generacion
    this.#publicar({ actualizando: true })
    try {
      const { placas, proveedores } = await this.#api.catalogos()
      if (generacion !== this.#generacion) return
      // Sin disco se usa igual lo que llegó, solo que no queda guardado.
      await this.#cache.reemplazar({ placas, proveedores }).catch(() => undefined)
      if (generacion !== this.#generacion) return
      this.#publicar({ actualizando: false, sinConexion: false, error: null, placas, proveedores, nuncaDescargado: false })
    } catch (error) {
      if (generacion !== this.#generacion) return
      if (error instanceof ApiError && error.isNetwork) this.#publicar({ actualizando: false, sinConexion: true, error: null })
      else this.#publicar({ actualizando: false, sinConexion: false, error: error instanceof ApiError ? error.message : 'No se pudieron traer las placas y proveedores.' })
    }
  }

  #publicar(cambios: Partial<InstantaneaCatalogo>): void {
    this.#instantanea = { ...this.#instantanea, ...cambios }
    for (const escucha of [...this.#escuchas]) escucha()
  }
}
