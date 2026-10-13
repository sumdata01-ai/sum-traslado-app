/**
 * Estado de una foto individual (una de las 6 de la salida o una de las 5 de la entrega).
 *
 * `failed_local` y `failed_upload` están separados a propósito: el primero no se arregla
 * reintentando la subida (hace falta retomar la foto), el segundo sí (problema de red, el drenador
 * lo resuelve solo). Mezclarlos en un genérico «failed» le impediría a la interfaz saber si ofrecer
 * «reintentar» o «retomar la foto».
 *
 * Valores iguales a `local_traslado_foto.sync_estado` de la app. Ver `docs/01-vision-y-alcance/patron-traslado-web.md` §2.1.
 */
export const ESTADOS_FOTO = ['writing', 'pending', 'uploaded', 'failed_local', 'failed_upload'] as const
export type EstadoFoto = (typeof ESTADOS_FOTO)[number]

/**
 * Transiciones válidas: estado actual → estados siguientes permitidos.
 *
 * `failed_local` no transiciona: retomar la zona crea una fila NUEVA (`writing`), no cambia la
 * misma. `uploaded` es terminal: la fila se borra al confirmar el momento.
 */
const TRANSICIONES: Readonly<Record<EstadoFoto, readonly EstadoFoto[]>> = {
  writing: ['pending', 'failed_local'],
  pending: ['uploaded', 'failed_upload'],
  failed_upload: ['pending'],
  uploaded: [],
  failed_local: [],
}

/** Error de programación: se pidió una transición que no está en la tabla. */
export class TransicionInvalidaError extends Error {
  readonly desde: EstadoFoto
  readonly hacia: EstadoFoto

  constructor(desde: EstadoFoto, hacia: EstadoFoto) {
    super(`Foto: ${desde} → ${hacia} no está permitida.`)
    this.name = 'TransicionInvalidaError'
    this.desde = desde
    this.hacia = hacia
  }
}

export function esTransicionPermitida(desde: EstadoFoto, hacia: EstadoFoto): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/**
 * Valida y devuelve el estado siguiente. Lanza {@link TransicionInvalidaError} si no está
 * permitido: nunca se debe escribir un estado fuera de la tabla, ni siquiera «por las dudas».
 */
export function transicionarFoto(desde: EstadoFoto, hacia: EstadoFoto): EstadoFoto {
  if (!esTransicionPermitida(desde, hacia)) throw new TransicionInvalidaError(desde, hacia)
  return hacia
}

export function esEstadoFoto(valor: string): valor is EstadoFoto {
  return (ESTADOS_FOTO as readonly string[]).includes(valor)
}

/** Para leer filas guardadas: un valor desconocido es un dato corrupto, no se adivina. */
export function parsearEstadoFoto(valor: string): EstadoFoto {
  if (!esEstadoFoto(valor)) throw new RangeError(`Estado de foto desconocido: ${valor}`)
  return valor
}
