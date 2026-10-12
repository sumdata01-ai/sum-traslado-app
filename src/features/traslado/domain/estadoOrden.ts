/**
 * Estado de una orden en el cliente.
 *
 * Es **derivado**: se calcula siempre desde el conteo de fotos y no se guarda en ninguna columna.
 * Guardarlo aparte crearía una segunda fuente de verdad que se puede desincronizar del conteo real
 * (ver `traslado_estado.dart`). No es el estado del servidor (`pendiente`, `en_transito`…).
 *
 * El estado `confirmando` de la app **no existe aquí**: ningún llamador lo activa en producción
 * (hallazgo 3 de `patron-traslado-web.md`) y queda fuera de alcance.
 */
export const ESTADOS_ORDEN_LOCAL = [
  'sinIniciar',
  'enCaptura',
  'listaParaEnviar',
  'enviando',
  'confirmada',
  'descartadaPorSupervisor',
] as const
export type EstadoOrdenLocal = (typeof ESTADOS_ORDEN_LOCAL)[number]

/** Desenlaces que el servidor ya devolvió; cuando existen, mandan sobre el conteo. */
export type ResultadoConfirmacion = Extract<EstadoOrdenLocal, 'confirmada' | 'descartadaPorSupervisor'>

export interface EntradaDerivarEstado {
  /** 6 en la salida, 5 en la entrega: se recibe, no se fija aquí. */
  totalZonas: number
  /** Zonas con la foto ya escrita en el dispositivo. */
  zonasConArchivo: number
  /** Zonas cuya foto ya se subió y tiene `storage_key`. */
  zonasConStorageKey: number
  resultadoConfirmacion?: ResultadoConfirmacion
}

function exigirEnteroNoNegativo(nombre: string, valor: number): void {
  if (!Number.isInteger(valor) || valor < 0) throw new RangeError(`${nombre} debe ser un entero no negativo: ${valor}`)
}

export function derivarEstadoOrden(entrada: EntradaDerivarEstado): EstadoOrdenLocal {
  const { totalZonas, zonasConArchivo, zonasConStorageKey, resultadoConfirmacion } = entrada
  if (!Number.isInteger(totalZonas) || totalZonas <= 0) {
    throw new RangeError(`totalZonas debe ser un entero positivo: ${totalZonas}`)
  }
  exigirEnteroNoNegativo('zonasConArchivo', zonasConArchivo)
  exigirEnteroNoNegativo('zonasConStorageKey', zonasConStorageKey)

  if (resultadoConfirmacion) return resultadoConfirmacion

  if (zonasConArchivo >= totalZonas && zonasConStorageKey >= totalZonas) {
    // Todas subidas, pero todavía no se llamó a confirmar-*.
    return 'enviando'
  }
  if (zonasConArchivo >= totalZonas) return 'listaParaEnviar'
  if (zonasConArchivo > 0) return 'enCaptura'
  return 'sinIniciar'
}
