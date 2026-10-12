/**
 * Máquina de estados de la sesión de cámara. Ver ARQUITECTURA-FRONT.md §5.1.
 *
 * Respecto del diagrama original hay cuatro transiciones más, para que un evento que llega en mal
 * momento no deje la sesión sin salida: pasar a segundo plano mientras se pide o inicia la cámara
 * o mientras se captura (`solicitando`, `iniciando`, `capturando` → `suspendida`), y reintentar el
 * video sin pedir otro stream (`suspendida`, `error` → `iniciando`).
 */
export const ESTADOS_CAMARA = [
  'inactiva',
  'sinSoporte',
  'solicitando',
  'iniciando',
  'lista',
  'capturando',
  'revisando',
  'suspendida',
  'error',
] as const
export type EstadoCamara = (typeof ESTADOS_CAMARA)[number]

const TRANSICIONES: Readonly<Record<EstadoCamara, readonly EstadoCamara[]>> = {
  inactiva: ['solicitando', 'sinSoporte'],
  sinSoporte: ['inactiva'],
  solicitando: ['iniciando', 'error', 'suspendida', 'inactiva'],
  iniciando: ['lista', 'error', 'suspendida', 'inactiva'],
  lista: ['capturando', 'suspendida', 'inactiva'],
  capturando: ['revisando', 'lista', 'suspendida', 'inactiva'],
  revisando: ['lista', 'suspendida', 'inactiva'],
  suspendida: ['solicitando', 'iniciando', 'inactiva'],
  error: ['solicitando', 'iniciando', 'inactiva'],
}

/** Error de programación: se pidió una transición que no está en la tabla. */
export class TransicionCamaraInvalidaError extends Error {
  readonly desde: EstadoCamara
  readonly hacia: EstadoCamara

  constructor(desde: EstadoCamara, hacia: EstadoCamara) {
    super(`Cámara: ${desde} → ${hacia} no está permitida.`)
    this.name = 'TransicionCamaraInvalidaError'
    this.desde = desde
    this.hacia = hacia
  }
}

export function esTransicionCamaraPermitida(desde: EstadoCamara, hacia: EstadoCamara): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

export function transicionarCamara(desde: EstadoCamara, hacia: EstadoCamara): EstadoCamara {
  if (!esTransicionCamaraPermitida(desde, hacia)) throw new TransicionCamaraInvalidaError(desde, hacia)
  return hacia
}
