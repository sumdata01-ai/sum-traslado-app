import type { OrdenCacheada, OrdenRemota } from './orden'

/**
 * Cómo está una toma hecha en este navegador (O-02):
 * - `pendiente`: se tomó sin señal y todavía no llegó al servidor;
 * - `confirmada`: el servidor la registró;
 * - `perdida`: al enviarla, otra persona ya la tenía (409). No se reintenta.
 */
export type EstadoToma = 'pendiente' | 'confirmada' | 'perdida'

/**
 * Una toma del pool hecha en este navegador. Se guarda **aparte de la caché de órdenes y con su
 * dueño** (decisión del 2026-10-10): sobrevive a cerrar la sesión, solo se usa con la sesión de
 * quien la hizo, y lleva una copia de la orden para poder mostrarla aunque el servidor ya no la
 * devuelva (por ejemplo, porque otra persona se la llevó).
 */
export interface TomaLocal {
  idOrden: number
  /** Quién la tomó (el id del token). */
  idUsuario: number | null
  estado: EstadoToma
  /** La orden como se conocía al tomarla, y actualizada cada vez que el servidor la devuelve. */
  orden: OrdenRemota
  tomadaEn: number
  /** Con `perdida`: el mensaje del servidor («La tomó …»). */
  mensaje: string | null
}

/**
 * Pone al día las tomas con lo que acaba de devolver `mis-ordenes` (que trae lo propio y el pool:
 * una orden con conductor en esa lista es **de quien tiene la sesión**).
 *
 * - `pendiente` con conductor en el servidor → `confirmada`: llegó por otro camino.
 * - `confirmada` que el servidor ya no devuelve, que ya no está `pendiente` o que volvió sin dueño
 *   (la liberó el supervisor) → se olvida: ya no es algo que se pueda soltar desde aquí.
 * - `perdida` que el servidor vuelve a dar como propia (la reasignaron a esta persona) → se olvida:
 *   la orden se muestra como cualquier otra propia.
 * - Lo demás se conserva. Una `pendiente` que el servidor no devuelve se conserva: todavía no se
 *   intentó enviar.
 */
export function reconciliarTomas(tomas: readonly TomaLocal[], remotas: readonly OrdenRemota[]): TomaLocal[] {
  const porId = new Map(remotas.map((orden) => [orden.idOrden, orden]))
  const resultado: TomaLocal[] = []
  for (const toma of tomas) {
    const remota = porId.get(toma.idOrden)
    const conDueno = remota !== undefined && remota.conductorAsignado !== null

    if (toma.estado === 'pendiente') {
      resultado.push({ ...toma, orden: remota ?? toma.orden, estado: conDueno ? 'confirmada' : 'pendiente' })
      continue
    }
    if (toma.estado === 'confirmada') {
      if (remota && conDueno && remota.estado === 'pendiente') resultado.push({ ...toma, orden: remota })
      continue
    }
    // perdida
    if (!conDueno) resultado.push(remota ? { ...toma, orden: remota } : toma)
  }
  return resultado
}

/**
 * Las órdenes de la lista con las tomas de este navegador encima: una orden tomada lleva su
 * `tomaSync`, y una toma cuya orden el servidor no devolvió se agrega con la copia guardada (así
 * una toma sin señal, o una perdida, sigue a la vista). El resto queda con `tomaSync: null`.
 */
export function aplicarTomas(ordenes: readonly OrdenCacheada[], tomas: readonly TomaLocal[], ahora: number): OrdenCacheada[] {
  const porId = new Map(tomas.map((toma) => [toma.idOrden, toma]))
  const presentes = new Set<number>()
  const resultado = ordenes.map((orden) => {
    presentes.add(orden.idOrden)
    const toma = porId.get(orden.idOrden)
    return { ...orden, tomaSync: toma ? toma.estado : null }
  })
  for (const toma of tomas) {
    if (!presentes.has(toma.idOrden)) resultado.push({ ...toma.orden, tomaSync: toma.estado, sincronizadaEn: ahora })
  }
  return resultado
}

/** Solo se suelta lo que se tomó del pool en este navegador y sigue `pendiente` (el auto no salió). */
export const puedeSoltarse = (orden: Pick<OrdenCacheada, 'tomaSync' | 'estado'>): boolean =>
  (orden.tomaSync === 'pendiente' || orden.tomaSync === 'confirmada') && orden.estado === 'pendiente'

/** Una toma que nunca llegó al servidor se suelta en el teléfono, sin red: no hay nada que deshacer allá. */
export const soltarEsSoloLocal = (orden: Pick<OrdenCacheada, 'tomaSync'>): boolean => orden.tomaSync === 'pendiente'

/**
 * ¿Es un fallo que permite dejar la toma pendiente para enviarla después? Sí la falta de red y los
 * errores del servidor (5xx): el operario tiene el auto delante y no tiene por qué esperar. No un
 * 4xx: el servidor contestó que no.
 */
export const fallaPermiteTomarSinSenal = (fallo: { status?: number; isNetwork?: boolean }): boolean =>
  Boolean(fallo.isNetwork) || (fallo.status !== undefined && fallo.status >= 500)
