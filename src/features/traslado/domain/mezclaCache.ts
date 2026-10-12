import type { OrdenCacheada, OrdenRemota } from './orden'

/**
 * Qué queda en la caché tras traer `mis-ordenes`. Mismas reglas que `TrasladoOrdenService` de la app:
 *
 * - **Se reemplaza por lo que vino del servidor.** Una orden que ya no viene (otro la tomó, la
 *   cancelaron, la reasignaron) sale sola de la caché, sin pantalla especial.
 * - **Excepto una con la toma pendiente.** Si otro operario la tomó primero el servidor deja de
 *   devolverla, y borrarla le quitaría al conductor su orden **con las fotos ya capturadas**: la
 *   evidencia desaparecería sin un solo error. Se resuelve sola cuando la toma llegue al servidor.
 * - **La placa y el proveedor se conservan si el servidor no los trae.** Los elige el operario en el
 *   pañol y viven en el dispositivo hasta que se confirma la salida; mientras tanto el servidor los
 *   devuelve vacíos. Regla: el servidor pisa cuando trae dato, no cuando trae vacío. Cada uno se
 *   mueve entero (id y nombre juntos) para no dejar una placa sin código.
 * - **El conductor NO se conserva.** Que venga vacío significa algo —«sin dueño», se puede tomar— y
 *   conservarlo escondería que el supervisor la liberó.
 * - **`tomaSync` se conserva siempre:** es estado local, el servidor no lo conoce.
 * - El destino, el estado y la fecha son del servidor.
 *
 * `reemplazarTodo: false` solo agrega o actualiza lo recibido y no borra nada (para cuando la
 * fuente es la consulta de un solo VIN y no la lista completa).
 */
export function mezclarCache(
  cache: readonly OrdenCacheada[],
  remotas: readonly OrdenRemota[],
  ahora: number,
  { reemplazarTodo = true }: { reemplazarTodo?: boolean } = {},
): OrdenCacheada[] {
  const enCache = new Map(cache.map((orden) => [orden.idOrden, orden]))
  const vigentes = new Set<number>()

  const actualizadas = remotas.map<OrdenCacheada>((remota) => {
    vigentes.add(remota.idOrden)
    const previa = enCache.get(remota.idOrden)
    return {
      ...remota,
      placa: remota.placa ?? previa?.placa ?? null,
      proveedor: remota.proveedor ?? previa?.proveedor ?? null,
      tomaSync: previa?.tomaSync ?? null,
      sincronizadaEn: ahora,
    }
  })

  const restantes = cache.filter((orden) => {
    if (vigentes.has(orden.idOrden)) return false
    return reemplazarTodo ? orden.tomaSync === 'pendiente' : true
  })

  return [...actualizadas, ...restantes]
}
