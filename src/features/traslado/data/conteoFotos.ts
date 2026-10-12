import Dexie from 'dexie'
import type { Momento } from '../domain'
import type { TrasladoDb } from './trasladoDb'

export interface ConteoDeUnTramo {
  /** Zonas con la foto ya guardada en el dispositivo. */
  archivo: number
  /** Zonas cuya foto ya se subió y tiene `storage_key`. */
  subidas: number
}

export type ConteoDeFotos = Record<Momento, ConteoDeUnTramo>

/** Las fotos guardadas, vistas por orden: cuántas tiene cada una y, al soltarla, borrarlas. */
export interface ConteoFotosPort {
  /** Cuántas fotos tiene cada orden, por tramo: de ahí sale su estado local y su etiqueta. */
  contar(): Promise<Map<number, ConteoDeFotos>>
  /**
   * Borra todas las fotos de una orden, de los dos tramos, también las que quedaron a medio
   * escribir. Se usa al soltar una orden, después de que el operario lo confirmó (O-02 AC6).
   */
  borrarDeOrden(ordenId: number): Promise<void>
  /** Borra las fotos de un solo tramo de una orden (la salida, una vez confirmada). */
  borrarDeMomento(ordenId: number, momento: Momento): Promise<void>
}

export class ConteoFotosDexie implements ConteoFotosPort {
  readonly #db: TrasladoDb

  constructor(db: TrasladoDb) {
    this.#db = db
  }

  async contar(): Promise<Map<number, ConteoDeFotos>> {
    const conteos = new Map<number, ConteoDeFotos>()
    await this.#db.fotos.each((foto) => {
      let conteo = conteos.get(foto.ordenId)
      if (!conteo) {
        conteo = { salida: { archivo: 0, subidas: 0 }, entrega: { archivo: 0, subidas: 0 } }
        conteos.set(foto.ordenId, conteo)
      }
      conteo[foto.momento].archivo++
      if (foto.storageKey !== null) conteo[foto.momento].subidas++
    })
    return conteos
  }

  async borrarDeMomento(ordenId: number, momento: Momento): Promise<void> {
    await this.#db.transaction('rw', this.#db.fotos, this.#db.enEscritura, async () => {
      await this.#db.fotos.where('[ordenId+momento]').equals([ordenId, momento]).delete()
      await this.#db.enEscritura.where('[ordenId+momento]').equals([ordenId, momento]).delete()
    })
  }

  async borrarDeOrden(ordenId: number): Promise<void> {
    const deLaOrden = [[ordenId, Dexie.minKey], [ordenId, Dexie.maxKey]] as const
    await this.#db.transaction('rw', this.#db.fotos, this.#db.enEscritura, async () => {
      await this.#db.fotos.where('[ordenId+momento]').between(...deLaOrden).delete()
      await this.#db.enEscritura.where('[ordenId+momento]').between(...deLaOrden).delete()
    })
  }
}
