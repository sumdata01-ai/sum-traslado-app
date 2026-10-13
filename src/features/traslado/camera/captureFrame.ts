import { CALIDAD_JPEG, LADO_LARGO_MAXIMO_PX, TIEMPO_CAPTURA_MS } from './config'

/**
 * Captura de un frame del video como JPEG verificado. Ver docs/02-arquitectura/arquitectura-front.md §5.3 y las fallas
 * C7 y C9 a C11.
 *
 * Regla de oro: **una foto se acepta solo si se comprobó**. Nada de lo que falle aquí lanza una
 * excepción hacia arriba: todo vuelve como un resultado con el mensaje para el operario, y el
 * lienzo siempre se libera (en el móvil, un lienzo grande sin soltar es lo que agota la memoria).
 */

/** Lo que se lee del `<video>`; `HTMLVideoElement` lo cumple. */
export interface FrameFuente {
  readonly videoWidth: number
  readonly videoHeight: number
}

export interface ContextoLike {
  drawImage(fuente: unknown, dx: number, dy: number, dw: number, dh: number): void
}

export interface LienzoLike {
  width: number
  height: number
  getContext(tipo: '2d'): ContextoLike | null
  toBlob(callback: (blob: Blob | null) => void, tipo?: string, calidad?: number): void
}

export interface OpcionesCaptura {
  crearLienzo?: () => LienzoLike
  ladoLargoMaximo?: number
  calidad?: number
  tiempoMaximoMs?: number
  /** Para fijar el instante de la captura; por defecto `Date.now`. */
  reloj?: () => number
}

export interface FotoCapturada {
  blob: Blob
  ancho: number
  alto: number
  /** Instante **medido** de la captura (ms desde 1970): de aquí sale la fecha que se envía, no del reloj del envío. */
  creadaEn: number
}

export type CodigoCaptura =
  | 'VIDEO_NO_LISTO'
  | 'BLOB_VACIO'
  | 'FORMATO_INCORRECTO'
  | 'MEMORIA_AGOTADA'
  | 'CAPTURA_FALLIDA'
  | 'INTERRUMPIDA'
  | 'ARCHIVO_INVALIDO'

const MENSAJES: Record<CodigoCaptura, string> = {
  VIDEO_NO_LISTO: 'La cámara todavía no está lista. Espera un momento y vuelve a intentar.',
  BLOB_VACIO: 'La foto llegó vacía. Vuelve a tomarla.',
  FORMATO_INCORRECTO: 'La foto no salió en el formato esperado. Vuelve a tomarla.',
  MEMORIA_AGOTADA: 'No hay memoria suficiente para tomar la foto. Cierra otras pestañas o aplicaciones y vuelve a intentar.',
  CAPTURA_FALLIDA: 'No se pudo tomar la foto. Vuelve a intentar.',
  INTERRUMPIDA: 'La foto se interrumpió porque la cámara se pausó. Vuelve a tomarla.',
  ARCHIVO_INVALIDO: 'No se pudo usar ese archivo. Elige una foto (JPEG, PNG o HEIC) de la galería.',
}

/** Todos los fallos de captura se pueden reintentar tomando la foto otra vez. */
export class CapturaError extends Error {
  readonly codigo: CodigoCaptura

  constructor(codigo: CodigoCaptura, causa?: unknown) {
    super(MENSAJES[codigo], { cause: causa })
    this.name = 'CapturaError'
    this.codigo = codigo
  }
}

export type ResultadoCaptura = { ok: true; foto: FotoCapturada } | { ok: false; error: CapturaError }

const fallo = (codigo: CodigoCaptura, causa?: unknown): ResultadoCaptura => ({ ok: false, error: new CapturaError(codigo, causa) })

/** Reduce para que el lado largo no pase de `ladoLargoMaximo`; nunca amplía. */
export function calcularDimensiones(ancho: number, alto: number, ladoLargoMaximo: number): { ancho: number; alto: number } {
  const escala = Math.min(1, ladoLargoMaximo / Math.max(ancho, alto))
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) }
}

function pareceFaltaDeMemoria(causa: unknown): boolean {
  if (typeof causa !== 'object' || causa === null) return false
  const nombre = 'name' in causa ? String(causa.name) : ''
  const mensaje = 'message' in causa ? String(causa.message) : ''
  return nombre === 'RangeError' || nombre === 'QuotaExceededError' || /memory|memoria|alloc/i.test(mensaje)
}

function aBlob(lienzo: LienzoLike, calidad: number, tiempoMaximoMs: number): Promise<Blob | null> {
  return new Promise((resolver, rechazar) => {
    // Si el navegador nunca llama de vuelta, la captura no puede quedar colgada para siempre.
    const temporizador = setTimeout(() => rechazar(new Error('toBlob no respondió a tiempo')), tiempoMaximoMs)
    try {
      lienzo.toBlob(
        (blob) => {
          clearTimeout(temporizador)
          resolver(blob)
        },
        'image/jpeg',
        calidad,
      )
    } catch (causa) {
      clearTimeout(temporizador)
      rechazar(causa)
    }
  })
}

export async function capturarFrame(video: FrameFuente, opciones: OpcionesCaptura = {}): Promise<ResultadoCaptura> {
  if (!(video.videoWidth > 0 && video.videoHeight > 0)) return fallo('VIDEO_NO_LISTO')
  return codificarJpeg(video, video.videoWidth, video.videoHeight, opciones)
}

/**
 * Dibuja `fuente` (un frame de video o una imagen ya decodificada) en un lienzo del tamaño final y la
 * entrega como JPEG **verificado**. Es lo que comparten la cámara y la galería: una foto, venga de donde
 * venga, se acepta solo si se comprobó. El lienzo siempre se libera.
 */
export async function codificarJpeg(fuente: unknown, anchoOrigen: number, altoOrigen: number, opciones: OpcionesCaptura = {}): Promise<ResultadoCaptura> {
  const { ancho, alto } = calcularDimensiones(anchoOrigen, altoOrigen, opciones.ladoLargoMaximo ?? LADO_LARGO_MAXIMO_PX)
  const lienzo = (opciones.crearLienzo ?? (() => document.createElement('canvas') as unknown as LienzoLike))()

  try {
    lienzo.width = ancho
    lienzo.height = alto
    const contexto = lienzo.getContext('2d')
    // Un lienzo sin contexto casi siempre es falta de memoria (límite de área en iOS). Es una inferencia.
    if (!contexto) return fallo('MEMORIA_AGOTADA')

    contexto.drawImage(fuente, 0, 0, ancho, alto)
    const blob = await aBlob(lienzo, opciones.calidad ?? CALIDAD_JPEG, opciones.tiempoMaximoMs ?? TIEMPO_CAPTURA_MS)

    if (!blob || blob.size === 0) return fallo('BLOB_VACIO')
    // `toBlob` cae a PNG si no soporta el tipo pedido, así que el tipo del resultado se comprueba.
    if (blob.type !== 'image/jpeg') return fallo('FORMATO_INCORRECTO')

    return { ok: true, foto: { blob, ancho, alto, creadaEn: (opciones.reloj ?? Date.now)() } }
  } catch (causa) {
    return fallo(pareceFaltaDeMemoria(causa) ? 'MEMORIA_AGOTADA' : 'CAPTURA_FALLIDA', causa)
  } finally {
    lienzo.width = 0
    lienzo.height = 0
  }
}
