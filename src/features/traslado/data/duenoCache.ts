import type { AlmacenDeMarca } from './marcaLimpieza'

/**
 * De quién son las órdenes guardadas en el dispositivo (el `idUsuario` de la sesión que las trajo).
 * Si al abrir la lista la sesión es de otra persona, lo guardado no se muestra y se borra (A-03).
 * `null`: no se sabe, o no hay nada guardado.
 */
export interface DuenoCachePort {
  leer(): number | null
  fijar(idUsuario: number | null): void
}

export class DuenoEnMemoria implements DuenoCachePort {
  #id: number | null = null
  leer() {
    return this.#id
  }
  fijar(idUsuario: number | null) {
    this.#id = idUsuario
  }
}

export const CLAVE_DUENO_CACHE = 'sum-traslado:ordenes-de'

/** En `localStorage`, para que sobreviva a una recarga. Si el almacenamiento falla vale en memoria; nunca lanza. */
export class DuenoEnAlmacen implements DuenoCachePort {
  readonly #almacen: AlmacenDeMarca | undefined
  #enMemoria: number | null | undefined = undefined

  constructor(almacen: AlmacenDeMarca | undefined = almacenPorDefecto()) {
    this.#almacen = almacen
  }

  leer(): number | null {
    if (this.#enMemoria !== undefined) return this.#enMemoria
    try {
      const crudo = this.#almacen?.getItem(CLAVE_DUENO_CACHE)
      const id = crudo ? Number(crudo) : NaN
      return Number.isInteger(id) ? id : null
    } catch {
      return null
    }
  }

  fijar(idUsuario: number | null): void {
    this.#enMemoria = idUsuario
    try {
      if (idUsuario === null) this.#almacen?.removeItem(CLAVE_DUENO_CACHE)
      else this.#almacen?.setItem(CLAVE_DUENO_CACHE, String(idUsuario))
    } catch {
      // queda en memoria
    }
  }
}

function almacenPorDefecto(): AlmacenDeMarca | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
