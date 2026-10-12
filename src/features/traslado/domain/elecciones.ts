import type { OpcionCatalogo } from './catalogo'
import type { OrdenCacheada, OrdenRemota } from './orden'

/**
 * Lo que el operario eligió para una orden en el formulario de salida (O-04). Las órdenes de la hoja
 * **no traen placa ni proveedor** (el supervisor no los sabe al planificar): los elige quien tiene el
 * auto delante, a veces sin señal y días antes de que se confirme la salida. Se guarda aparte, con su
 * dueño, y E4-02 lo manda al confirmar.
 */
export interface EleccionLocal {
  idOrden: number
  /** Quién eligió (el id del token). */
  idUsuario: number | null
  placa: OpcionCatalogo | null
  proveedor: OpcionCatalogo | null
  elegidaEn: number
}

/**
 * Pone la elección encima de la orden **solo donde el servidor no trae dato**: el servidor pisa
 * cuando trae valor, no cuando trae vacío (misma regla que `confirmar-salida` y `mezclarCache`).
 */
export function aplicarElecciones(ordenes: readonly OrdenCacheada[], elecciones: readonly EleccionLocal[]): OrdenCacheada[] {
  const porId = new Map(elecciones.map((e) => [e.idOrden, e]))
  return ordenes.map((orden) => {
    const eleccion = porId.get(orden.idOrden)
    if (!eleccion) return orden
    return {
      ...orden,
      placa: orden.placa ?? (eleccion.placa ? { id: eleccion.placa.id, codigo: eleccion.placa.nombre } : null),
      proveedor: orden.proveedor ?? (eleccion.proveedor ? { id: eleccion.proveedor.id, nombre: eleccion.proveedor.nombre } : null),
    }
  })
}

/**
 * Pone al día las elecciones con lo que acaba de devolver `mis-ordenes`:
 * - Lo que el servidor ya trae (placa o proveedor) deja de hacer falta: se quita de la elección.
 * - Sin nada que conservar, la elección se olvida.
 * - Una orden que el servidor ya no devuelve se olvida, **salvo** que siga en `idsAConservar` (una
 *   toma pendiente o perdida: todavía se muestra desde el teléfono).
 */
export function reconciliarElecciones(
  elecciones: readonly EleccionLocal[],
  remotas: readonly OrdenRemota[],
  idsAConservar: ReadonlySet<number>,
): EleccionLocal[] {
  const porId = new Map(remotas.map((o) => [o.idOrden, o]))
  const resultado: EleccionLocal[] = []
  for (const eleccion of elecciones) {
    const remota = porId.get(eleccion.idOrden)
    if (!remota) {
      if (idsAConservar.has(eleccion.idOrden)) resultado.push(eleccion)
      continue
    }
    const restante: EleccionLocal = {
      ...eleccion,
      placa: remota.placa ? null : eleccion.placa,
      proveedor: remota.proveedor ? null : eleccion.proveedor,
    }
    if (restante.placa || restante.proveedor) resultado.push(restante)
  }
  return resultado
}

/** Junta una elección nueva con la anterior: cada campo elegido reemplaza al anterior, el resto se conserva. */
export function combinarEleccion(
  anterior: EleccionLocal | null,
  cambio: { idOrden: number; idUsuario: number | null; placa?: OpcionCatalogo; proveedor?: OpcionCatalogo },
  ahora: number,
): EleccionLocal {
  return {
    idOrden: cambio.idOrden,
    idUsuario: cambio.idUsuario,
    placa: cambio.placa ?? anterior?.placa ?? null,
    proveedor: cambio.proveedor ?? anterior?.proveedor ?? null,
    elegidaEn: ahora,
  }
}

/**
 * ¿Falta elegir? Solo en la **salida** (orden `pendiente`) y solo lo que ni el servidor ni el
 * operario pusieron. En la entrega no se elige nada: quedó resuelto al salir.
 */
export const faltaPlaca = (orden: Pick<OrdenCacheada, 'estado' | 'placa'>): boolean => orden.estado === 'pendiente' && orden.placa === null
export const faltaProveedor = (orden: Pick<OrdenCacheada, 'estado' | 'proveedor'>): boolean => orden.estado === 'pendiente' && orden.proveedor === null

/**
 * Sin placa no se captura **la salida**: la orden llegaría al servidor sin ella y el ciclo de
 * retorno de placas no le aplicaría (la placa nunca pasa a «en uso»). El proveedor no bloquea: es un
 * dato administrativo.
 */
export const puedeCapturarSalida = (orden: Pick<OrdenCacheada, 'estado' | 'placa'>): boolean => orden.estado !== 'pendiente' || orden.placa !== null
