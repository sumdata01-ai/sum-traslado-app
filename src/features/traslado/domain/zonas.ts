/**
 * Zonas y momentos de Traslado.
 *
 * Mismos valores que `orden_traslado_foto.zona` y `orden_traslado_ejecucion.momento` del backend
 * (sum-app: `local_traslado_foto.dart`). El orden de cada lista es el orden en que se muestran
 * en el formulario, no el orden de captura.
 */

export const MOMENTOS = ['salida', 'entrega'] as const
export type Momento = (typeof MOMENTOS)[number]

/** Las 6 zonas de la salida. */
export const ZONAS_SALIDA = [
  'FRONTAL',
  'LATERAL_IZQUIERDO',
  'LATERAL_DERECHO',
  'POSTERIOR',
  'PLACA_ESTADO',
  'PLACA_INSTALADA',
] as const

/**
 * Las 5 zonas de la entrega: las 4 exteriores más `VIN`. Las dos de placa no van: documentan el
 * activo al colgarlo y no tienen equivalente al entregar.
 */
export const ZONAS_ENTREGA = ['FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR', 'VIN'] as const

export type ZonaSalida = (typeof ZONAS_SALIDA)[number]
export type ZonaEntrega = (typeof ZONAS_ENTREGA)[number]
export type Zona = ZonaSalida | ZonaEntrega

export const ETIQUETA_ZONA: Readonly<Record<Zona, string>> = {
  VIN: 'Número de VIN',
  FRONTAL: 'Frontal',
  LATERAL_IZQUIERDO: 'Lateral izquierdo',
  LATERAL_DERECHO: 'Lateral derecho',
  POSTERIOR: 'Posterior',
  PLACA_ESTADO: 'Placa — estado físico',
  PLACA_INSTALADA: 'Placa — instalada en el vehículo',
}

/** Las zonas que corresponden a cada momento, en el orden del formulario. */
export function zonasDe(momento: Momento): readonly Zona[] {
  return momento === 'entrega' ? ZONAS_ENTREGA : ZONAS_SALIDA
}

/** Cuántas fotos exactas pide cada momento: 6 en la salida, 5 en la entrega. */
export function totalZonas(momento: Momento): number {
  return zonasDe(momento).length
}

/**
 * Qué tramo está abierto según el estado de la orden en el servidor: `pendiente` es la salida y
 * `en_transito` es la entrega. Cualquier otro estado (cancelada, realizado, cerrada…) no tiene
 * tramo abierto y devuelve `null`.
 */
export function momentoDeEstadoServidor(estadoServidor: string): Momento | null {
  if (estadoServidor === 'pendiente') return 'salida'
  if (estadoServidor === 'en_transito') return 'entrega'
  return null
}
