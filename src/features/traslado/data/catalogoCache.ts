import type { Catalogos, OpcionCatalogo } from '../domain'
import type { FilaCatalogo, TrasladoDb } from './trasladoDb'

/** El catálogo de placas y proveedores guardado en el dispositivo, para elegir sin señal (O-04 AC3). */
export interface CatalogoCachePort {
  /** `null` si nunca se descargó: se distingue de un catálogo vacío para poder explicarlo. */
  leer(): Promise<Catalogos | null>
  /** Sustituye todo de una vez: o queda lo nuevo, o queda lo de antes. Nunca deja al operario sin catálogo. */
  reemplazar(catalogos: Catalogos): Promise<void>
}

const quitarDetalles = ({ id, nombre, estado }: FilaCatalogo): OpcionCatalogo => ({ id, nombre, estado })

export class CatalogoCacheDexie implements CatalogoCachePort {
  readonly #db: TrasladoDb

  constructor(db: TrasladoDb) {
    this.#db = db
  }

  async leer(): Promise<Catalogos | null> {
    const filas = await this.#db.catalogos.toArray()
    if (filas.length === 0) return null
    const de = (tipo: FilaCatalogo['tipo']) =>
      filas
        .filter((f) => f.tipo === tipo)
        .sort((a, b) => a.posicion - b.posicion)
        .map(quitarDetalles)
    return { placas: de('placa'), proveedores: de('proveedor') }
  }

  async reemplazar({ placas, proveedores }: Catalogos): Promise<void> {
    const filas: FilaCatalogo[] = [
      ...placas.map((o, posicion) => ({ ...o, tipo: 'placa' as const, clave: `placa:${o.id}`, posicion })),
      ...proveedores.map((o, posicion) => ({ ...o, tipo: 'proveedor' as const, clave: `proveedor:${o.id}`, posicion })),
    ]
    // Una sola transacción: si la escritura falla a mitad, se deshace y el catálogo anterior sigue intacto.
    await this.#db.transaction('rw', this.#db.catalogos, async () => {
      await this.#db.catalogos.clear()
      await this.#db.catalogos.bulkPut(filas)
    })
  }
}

/** En memoria, para las pruebas y para un navegador sin IndexedDB. */
export class CatalogoEnMemoria implements CatalogoCachePort {
  guardado: Catalogos | null = null
  falla: { leer?: boolean; reemplazar?: boolean } = {}
  async leer() {
    if (this.falla.leer) throw new Error('IndexedDB no disponible')
    return this.guardado
  }
  async reemplazar(catalogos: Catalogos) {
    if (this.falla.reemplazar) throw new Error('disco lleno')
    this.guardado = catalogos
  }
}
