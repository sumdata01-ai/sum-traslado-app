import type { TomaLocal } from '../domain'
import type { FilaToma, TrasladoDb } from './trasladoDb'

/** Las tomas del pool hechas en este navegador, separadas por dueño (O-02). */
export interface TomasPort {
  /** Las tomas de esta persona, de la más antigua a la más nueva. */
  listar(idUsuario: number | null): Promise<TomaLocal[]>
  guardar(toma: TomaLocal): Promise<void>
  quitar(idUsuario: number | null, idOrden: number): Promise<void>
  /** Deja como tomas de esta persona exactamente estas (las demás personas no se tocan). */
  reemplazarDe(idUsuario: number | null, tomas: readonly TomaLocal[]): Promise<void>
}

const dueno = (idUsuario: number | null) => (idUsuario === null ? 'desconocido' : String(idUsuario))
const clave = (idUsuario: number | null, idOrden: number) => `${dueno(idUsuario)}:${idOrden}`

function aFila(toma: TomaLocal): FilaToma {
  return { ...toma, clave: clave(toma.idUsuario, toma.idOrden), dueno: dueno(toma.idUsuario) }
}

function aToma(fila: FilaToma): TomaLocal {
  const toma: Partial<FilaToma> = { ...fila }
  delete toma.clave // detalles del almacenamiento, no de la toma
  delete toma.dueno
  return toma as TomaLocal
}

export class TomasDexie implements TomasPort {
  readonly #db: TrasladoDb

  constructor(db: TrasladoDb) {
    this.#db = db
  }

  async listar(idUsuario: number | null): Promise<TomaLocal[]> {
    const filas = await this.#db.tomas.where('dueno').equals(dueno(idUsuario)).toArray()
    return filas.sort((a, b) => a.tomadaEn - b.tomadaEn).map(aToma)
  }

  async guardar(toma: TomaLocal): Promise<void> {
    await this.#db.tomas.put(aFila(toma))
  }

  async quitar(idUsuario: number | null, idOrden: number): Promise<void> {
    await this.#db.tomas.delete(clave(idUsuario, idOrden))
  }

  async reemplazarDe(idUsuario: number | null, tomas: readonly TomaLocal[]): Promise<void> {
    await this.#db.transaction('rw', this.#db.tomas, async () => {
      await this.#db.tomas.where('dueno').equals(dueno(idUsuario)).delete()
      await this.#db.tomas.bulkPut(tomas.map(aFila))
    })
  }
}

/** En memoria, para las pruebas y para un navegador sin IndexedDB. */
export class TomasEnMemoria implements TomasPort {
  readonly filas = new Map<string, TomaLocal>()
  falla = false

  async listar(idUsuario: number | null) {
    if (this.falla) throw new Error('sin acceso a las tomas')
    return [...this.filas.values()].filter((t) => t.idUsuario === idUsuario).sort((a, b) => a.tomadaEn - b.tomadaEn)
  }
  async guardar(toma: TomaLocal) {
    if (this.falla) throw new Error('sin acceso a las tomas')
    this.filas.set(clave(toma.idUsuario, toma.idOrden), toma)
  }
  async quitar(idUsuario: number | null, idOrden: number) {
    this.filas.delete(clave(idUsuario, idOrden))
  }
  async reemplazarDe(idUsuario: number | null, tomas: readonly TomaLocal[]) {
    for (const [k, t] of this.filas) if (t.idUsuario === idUsuario) this.filas.delete(k)
    for (const t of tomas) this.filas.set(clave(t.idUsuario, t.idOrden), t)
  }
}
