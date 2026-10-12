/**
 * Una orden de traslado tal como la entrega el servidor y tal como se guarda en la caché del
 * dispositivo. Los nombres siguen el contrato de `GET /mobile/traslado/mis-ordenes`.
 */
export interface RefPlaca {
  id: number
  codigo: string
}

export interface RefNombre {
  id: number
  nombre: string
}

export interface Conductor {
  id: number
  username: string
  nombreCompleto: string | null
}

export interface OrdenRemota {
  idOrden: number
  vin: string
  /** Estado del servidor: `pendiente`, `en_transito`, `realizado`, `cerrada`, `cancelada`. */
  estado: string
  placa: RefPlaca | null
  proveedor: RefNombre | null
  destino: RefNombre | null
  /** `null` significa **sin dueño**: está en el pool y se puede tomar. */
  conductorAsignado: Conductor | null
  fechaCreacion: string | null
}

/**
 * Cómo está la toma de una orden del pool que el operario agarró en este navegador (ver
 * `EstadoToma` en `tomas.ts`): `pendiente`, `confirmada` o `perdida`.
 */
export type TomaSync = 'pendiente' | 'confirmada' | 'perdida'

/** La orden en la caché: lo del servidor más lo que solo existe en el dispositivo. */
export interface OrdenCacheada extends OrdenRemota {
  /** Estado **local**: el servidor no lo devuelve, así que sobrevive a cada sincronización. */
  tomaSync: TomaSync | null
  sincronizadaEn: number
}

/**
 * ¿Es del operario? Lo es si el servidor le puso conductor (`mis-ordenes` devuelve lo propio o el
 * pool, nunca lo de otro) **o** si la tomó y todavía no se registró: eso hace que una toma sin
 * señal se vea como propia desde el instante en que se aprieta el botón.
 */
export function esMia(orden: Pick<OrdenCacheada, 'conductorAsignado' | 'tomaSync'>): boolean {
  return orden.conductorAsignado !== null || orden.tomaSync !== null
}
