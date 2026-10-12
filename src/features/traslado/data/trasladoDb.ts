import Dexie, { type Table } from 'dexie'
import type { EleccionLocal, EstadoFoto, Momento, OpcionCatalogo, OrdenCacheada, TomaLocal, Zona } from '../domain'

/**
 * Una foto **aceptada**: guardada, verificada y a la espera de subirse. Es lo único que cuenta
 * para el formulario. Hay como mucho una por `(orden, momento, zona)`: lo garantiza el índice único.
 */
export interface FilaFoto {
  /** Identificador único de la foto; nunca se deriva de la zona (el incidente del 2026-08-04 nació de eso). */
  clientId: string
  ordenId: number
  momento: Momento
  zona: Zona
  blob: Blob
  ancho: number
  alto: number
  /** Instante medido de la captura (ms desde 1970). */
  creadaEn: number
  estado: EstadoFoto
  /** La rellena la subida a GCS (E4-01). */
  storageKey: string | null
  errorMessage: string | null
  actualizadoEn: number
}

/**
 * Una foto **en tránsito** hacia `fotos`: se inserta como `writing` antes de escribir el Blob y solo
 * pasa a `fotos` cuando se comprobó. No tiene índice único por zona, así que puede convivir con la
 * foto anterior de la misma zona hasta que la nueva esté verificada.
 *
 * `failed_local` conserva el motivo para poder pedir que se retome esa zona (T4b); en ese caso el
 * Blob ya no se guarda.
 */
export type FilaEnEscritura = Omit<FilaFoto, 'blob' | 'estado' | 'storageKey'> & {
  blob: Blob | null
  estado: 'writing' | 'failed_local'
}

/**
 * Una orden en la caché, con su posición en la respuesta del servidor: IndexedDB devuelve las filas
 * por clave primaria, y sin esto la lista perdería el orden en que el servidor la entregó.
 */
export type FilaOrden = OrdenCacheada & { posicion: number }

/**
 * Una toma hecha en este navegador (O-02), con su dueño. La clave junta dueño y orden: si dos
 * personas toman la misma orden en este navegador, cada una tiene su fila. `dueno` es el id de
 * usuario como texto (`'desconocido'` si no se sabe): IndexedDB no indexa valores nulos.
 */
export type FilaToma = TomaLocal & { clave: string; dueno: string }

/** Lo que el operario eligió para una orden (O-04), con su dueño: misma forma de clave que las tomas. */
export type FilaEleccion = EleccionLocal & { clave: string; dueno: string }

/**
 * Una opción del catálogo de placas o proveedores (O-04). El catálogo no es de nadie: no se vacía al
 * cerrar sesión, así que después de volver a entrar el selector sigue funcionando sin señal.
 */
export type FilaCatalogo = OpcionCatalogo & { clave: string; tipo: 'placa' | 'proveedor'; posicion: number }

export class TrasladoDb extends Dexie {
  fotos!: Table<FilaFoto, string>
  enEscritura!: Table<FilaEnEscritura, string>
  ordenes!: Table<FilaOrden, number>
  tomas!: Table<FilaToma, string>
  catalogos!: Table<FilaCatalogo, string>
  elecciones!: Table<FilaEleccion, string>

  constructor(nombre = 'sum-traslado') {
    super(nombre)
    this.version(1).stores({
      fotos: 'clientId, &[ordenId+momento+zona], [ordenId+momento], estado',
      enEscritura: 'clientId, [ordenId+momento+zona], [ordenId+momento]',
    })
    // v2: la caché de órdenes (O-01). Solo se añade una tabla; las fotos no se tocan.
    this.version(2).stores({ ordenes: 'idOrden' })
    // v3: las tomas del pool hechas en este navegador (O-02). Solo se añade una tabla.
    this.version(3).stores({ tomas: 'clave, dueno' })
    // v4: el catálogo de placas y proveedores para el selector (O-04). Solo se añade una tabla.
    this.version(4).stores({ catalogos: 'clave, tipo' })
    // v5: lo que el operario eligió (placa y proveedor) por orden, con su dueño (O-04).
    this.version(5).stores({ elecciones: 'clave, dueno' })
  }
}
