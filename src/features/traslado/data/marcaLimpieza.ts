/**
 * Recuerda que hay que borrar las órdenes guardadas de la cuenta anterior y todavía no se pudo.
 * Mientras esté puesta, lo guardado no se muestra: puede ser de otra persona.
 */
export interface MarcaLimpiezaPort {
  activa(): boolean
  poner(): void
  quitar(): void
}

export class MarcaEnMemoria implements MarcaLimpiezaPort {
  #activa = false
  activa() {
    return this.#activa
  }
  poner() {
    this.#activa = true
  }
  quitar() {
    this.#activa = false
  }
}

export interface AlmacenDeMarca {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
  removeItem(clave: string): void
}

export const CLAVE_LIMPIEZA_PENDIENTE = 'sum-traslado:limpieza-ordenes-pendiente'

/**
 * La marca en `localStorage`, para que sobreviva a una recarga. También se recuerda en memoria: si
 * el almacenamiento falla (modo privado, datos del sitio bloqueados) al menos vale en esta página,
 * y nunca lanza.
 */
export class MarcaEnAlmacen implements MarcaLimpiezaPort {
  readonly #almacen: AlmacenDeMarca | undefined
  readonly #clave: string
  #enMemoria = false

  constructor(almacen: AlmacenDeMarca | undefined = almacenPorDefecto(), clave = CLAVE_LIMPIEZA_PENDIENTE) {
    this.#almacen = almacen
    this.#clave = clave
  }

  activa() {
    if (this.#enMemoria) return true
    try {
      return this.#almacen?.getItem(this.#clave) === '1'
    } catch {
      return false
    }
  }

  poner() {
    this.#enMemoria = true
    try {
      this.#almacen?.setItem(this.#clave, '1')
    } catch {
      // queda en memoria
    }
  }

  quitar() {
    this.#enMemoria = false
    try {
      this.#almacen?.removeItem(this.#clave)
    } catch {
      // si no se pudo quitar, a lo sumo se reintenta un borrado que ya no hace falta
    }
  }
}

function almacenPorDefecto(): AlmacenDeMarca | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined // acceder a localStorage puede lanzar con los datos del sitio bloqueados
  }
}
