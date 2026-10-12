export type CodigoAlmacen = 'ESPACIO_INSUFICIENTE' | 'ESCRITURA_FALLIDA' | 'VERIFICACION_FALLIDA' | 'FOTO_VACIA'

const MENSAJES: Record<CodigoAlmacen, string> = {
  ESPACIO_INSUFICIENTE: 'Espacio insuficiente en el dispositivo. Libera espacio y vuelve a intentar.',
  ESCRITURA_FALLIDA: 'No se pudo guardar la foto en el dispositivo. Vuelve a intentar o repítela.',
  VERIFICACION_FALLIDA: 'La foto no se guardó completa. Vuelve a intentar o repítela.',
  FOTO_VACIA: 'La foto llegó vacía. Vuelve a tomarla.',
}

/**
 * No se pudo guardar una foto. `mensajeParaElOperario` es el texto que se le muestra; la interfaz lo
 * reconoce por ese nombre sin conocer esta clase.
 */
export class AlmacenError extends Error {
  readonly codigo: CodigoAlmacen
  readonly mensajeParaElOperario: string

  constructor(codigo: CodigoAlmacen, causa?: unknown) {
    super(MENSAJES[codigo], { cause: causa })
    this.name = 'AlmacenError'
    this.codigo = codigo
    this.mensajeParaElOperario = MENSAJES[codigo]
  }
}

/** Dexie envuelve los errores de IndexedDB: la cuota puede venir directa o en `inner`. */
export function esErrorDeCuota(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('name' in error && error.name === 'QuotaExceededError') return true
  return 'inner' in error && esErrorDeCuota(error.inner)
}
