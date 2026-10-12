import type { OrdenCacheada } from '../domain'
import type { FilaOrden, TrasladoDb } from './trasladoDb'

/** Las órdenes que se muestran aunque no haya red. */
export interface OrdenesCachePort {
  leer(): Promise<OrdenCacheada[]>
  /** Sustituye todo el contenido de una vez: o queda lo nuevo, o queda lo de antes. */
  reemplazar(ordenes: readonly OrdenCacheada[]): Promise<void>
  vaciar(): Promise<void>
}

export class OrdenesCacheDexie implements OrdenesCachePort {
  readonly #db: TrasladoDb
  /**
   * Las escrituras van en fila, en el orden en que se piden. Dexie no lo garantiza por sí solo:
   * medido el 2026-10-09, un `clear()` pedido justo después de un `reemplazar` corría ANTES, y el
   * reemplazo volvía a dejar las órdenes que un cierre de sesión acababa de borrar.
   */
  #cola: Promise<unknown> = Promise.resolve()

  constructor(db: TrasladoDb) {
    this.#db = db
  }

  #enFila(escritura: () => Promise<void>): Promise<void> {
    const resultado = this.#cola.then(escritura)
    this.#cola = resultado.catch(() => undefined) // un fallo no traba las siguientes
    return resultado
  }

  async leer(): Promise<OrdenCacheada[]> {
    const filas = await this.#db.ordenes.toArray()
    return filas
      .sort((a, b) => a.posicion - b.posicion)
      .map((fila) => {
        const orden: Partial<FilaOrden> = { ...fila }
        delete orden.posicion // es un detalle del almacenamiento, no de la orden
        return orden as OrdenCacheada
      })
  }

  reemplazar(ordenes: readonly OrdenCacheada[]): Promise<void> {
    const filas: FilaOrden[] = ordenes.map((orden, posicion) => ({ ...orden, posicion }))
    // Una sola transacción: si la escritura falla a mitad, se deshace y la caché anterior sigue intacta.
    return this.#enFila(() =>
      this.#db.transaction('rw', this.#db.ordenes, async () => {
        await this.#db.ordenes.clear()
        await this.#db.ordenes.bulkPut(filas)
      }),
    )
  }

  vaciar(): Promise<void> {
    return this.#enFila(() => this.#db.ordenes.clear())
  }
}
