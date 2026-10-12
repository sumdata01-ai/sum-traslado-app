import type { EleccionLocal } from '../domain'
import type { FilaEleccion, TrasladoDb } from './trasladoDb'

/** Lo que el operario eligió (placa y proveedor) por orden, separado por dueño (O-04). */
export interface EleccionesPort {
  listar(idUsuario: number | null): Promise<EleccionLocal[]>
  guardar(eleccion: EleccionLocal): Promise<void>
  quitar(idUsuario: number | null, idOrden: number): Promise<void>
  /** Deja como elecciones de esta persona exactamente estas (las demás personas no se tocan). */
  reemplazarDe(idUsuario: number | null, elecciones: readonly EleccionLocal[]): Promise<void>
}

const dueno = (idUsuario: number | null) => (idUsuario === null ? 'desconocido' : String(idUsuario))
const clave = (idUsuario: number | null, idOrden: number) => `${dueno(idUsuario)}:${idOrden}`

const aFila = (e: EleccionLocal): FilaEleccion => ({ ...e, clave: clave(e.idUsuario, e.idOrden), dueno: dueno(e.idUsuario) })

function aEleccion(fila: FilaEleccion): EleccionLocal {
  const eleccion: Partial<FilaEleccion> = { ...fila }
  delete eleccion.clave // detalles del almacenamiento, no de la elección
  delete eleccion.dueno
  return eleccion as EleccionLocal
}

export class EleccionesDexie implements EleccionesPort {
  readonly #db: TrasladoDb

  constructor(db: TrasladoDb) {
    this.#db = db
  }

  async listar(idUsuario: number | null): Promise<EleccionLocal[]> {
    const filas = await this.#db.elecciones.where('dueno').equals(dueno(idUsuario)).toArray()
    return filas.sort((a, b) => a.elegidaEn - b.elegidaEn).map(aEleccion)
  }

  async guardar(eleccion: EleccionLocal): Promise<void> {
    await this.#db.elecciones.put(aFila(eleccion))
  }

  async quitar(idUsuario: number | null, idOrden: number): Promise<void> {
    await this.#db.elecciones.delete(clave(idUsuario, idOrden))
  }

  async reemplazarDe(idUsuario: number | null, elecciones: readonly EleccionLocal[]): Promise<void> {
    await this.#db.transaction('rw', this.#db.elecciones, async () => {
      await this.#db.elecciones.where('dueno').equals(dueno(idUsuario)).delete()
      await this.#db.elecciones.bulkPut(elecciones.map(aFila))
    })
  }
}

/** En memoria, para las pruebas y para un navegador sin IndexedDB. */
export class EleccionesEnMemoria implements EleccionesPort {
  readonly filas = new Map<string, EleccionLocal>()
  falla = false

  async listar(idUsuario: number | null) {
    if (this.falla) throw new Error('sin acceso a las elecciones')
    return [...this.filas.values()].filter((e) => e.idUsuario === idUsuario).sort((a, b) => a.elegidaEn - b.elegidaEn)
  }
  async guardar(eleccion: EleccionLocal) {
    if (this.falla) throw new Error('sin acceso a las elecciones')
    this.filas.set(clave(eleccion.idUsuario, eleccion.idOrden), eleccion)
  }
  async quitar(idUsuario: number | null, idOrden: number) {
    this.filas.delete(clave(idUsuario, idOrden))
  }
  async reemplazarDe(idUsuario: number | null, elecciones: readonly EleccionLocal[]) {
    for (const [k, e] of this.filas) if (e.idUsuario === idUsuario) this.filas.delete(k)
    for (const e of elecciones) this.filas.set(clave(e.idUsuario, e.idOrden), e)
  }
}
