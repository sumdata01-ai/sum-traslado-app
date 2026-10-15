/**
 * Un traslado tal como lo ve el coordinador. Los nombres siguen el contrato propuesto de
 * `GET /api/seguimiento/traslados` (docs/01-vision-y-alcance/propuesta-vista-cliente.md §7).
 *
 * **No hay nada de GPS** (2026-10-15, a pedido del usuario): ni ubicación, ni si el traslado lleva un dispositivo. Aunque el
 * servidor mande un campo de seguimiento, la web no lo lee.
 */

/** En qué punto está el vehículo, en el lenguaje del coordinador. */
export type EtapaSeguimiento = 'en_planta' | 'en_camino' | 'entregado' | 'anulado'

export interface TrasladoSeguimiento {
  idOrden: number
  vin: string
  marca: string | null
  modelo: string | null
  color: string | null
  destino: string | null
  etapa: EtapaSeguimiento
  /** Instante (ISO con zona) en que el despacho **registró** la salida; no es el de cruzar la puerta de planta. */
  salidaRegistrada: string | null
  entregadoEn: string | null
  /**
   * La hora de entrega no se midió, se calculó (hay entregas cerradas a mano con «salida + 2 h»). Mostrarla
   * como si fuera real sería inventar un dato: solo se muestra la fecha.
   */
  entregaEstimada: boolean
}

/** Las pestañas de la lista. «En planta» y «Anulados» existen como etapa pero no tienen pestaña (decisión del 2026-10-15). */
export type FiltroEtapa = 'todos' | 'en_camino' | 'entregado'

export const FILTROS_ETAPA: ReadonlyArray<{ valor: FiltroEtapa; etiqueta: string }> = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'en_camino', etiqueta: 'En camino' },
  { valor: 'entregado', etiqueta: 'Entregados' },
]
