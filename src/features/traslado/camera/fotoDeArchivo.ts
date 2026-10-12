import { CapturaError, type OpcionesCaptura, type ResultadoCaptura, codificarJpeg } from './captureFrame'

/**
 * Una foto elegida de la galería (T12). Pasa por el mismo camino que la de la cámara: se decodifica, se
 * reduce al lado largo máximo y se **vuelve a codificar como JPEG verificado**. Eso, además de unificar el
 * formato (en el iPhone la galería puede entregar HEIC), corrige la orientación (EXIF) y deja la foto sin
 * metadatos, incluida la ubicación.
 *
 * Nada de lo que falle aquí lanza hacia arriba: todo vuelve como resultado con un mensaje para el operario.
 */

/** Una imagen ya decodificada, lista para dibujarse en un lienzo. */
export interface ImagenDecodificada {
  fuente: unknown
  ancho: number
  alto: number
  /** Suelta la memoria de la imagen; siempre se llama. */
  liberar(): void
}

export interface OpcionesArchivo extends OpcionesCaptura {
  /** Solo se sustituye en las pruebas. Por defecto, el decodificador del navegador. */
  decodificar?: (archivo: Blob) => Promise<ImagenDecodificada>
}

/** El navegador aplica la orientación EXIF al decodificar: la foto sale derecha, no de lado. */
export async function decodificarEnNavegador(archivo: Blob): Promise<ImagenDecodificada> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
      return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, liberar: () => bitmap.close() }
    } catch {
      // Un navegador sin esa opción: se prueba con <img>, que también respeta la orientación.
    }
  }
  const url = URL.createObjectURL(archivo)
  const imagen = new Image()
  imagen.src = url
  try {
    await imagen.decode()
  } catch (causa) {
    URL.revokeObjectURL(url)
    throw causa
  }
  return {
    fuente: imagen,
    ancho: imagen.naturalWidth,
    alto: imagen.naturalHeight,
    liberar: () => {
      URL.revokeObjectURL(url)
      imagen.src = ''
    },
  }
}

function pareceFaltaDeMemoria(causa: unknown): boolean {
  if (typeof causa !== 'object' || causa === null) return false
  const nombre = 'name' in causa ? String(causa.name) : ''
  const mensaje = 'message' in causa ? String(causa.message) : ''
  return nombre === 'RangeError' || nombre === 'QuotaExceededError' || /memory|memoria|alloc/i.test(mensaje)
}

/**
 * La fecha de la foto es la **medida** en que se hizo: la de modificación del archivo, que en una foto de
 * la galería es cuando se tomó. Si el archivo no la trae, o dice un instante futuro (reloj mal puesto), se
 * usa la de ahora.
 */
function instanteDe(archivo: Blob, ahora: number): number {
  const modificado = 'lastModified' in archivo ? Number(archivo.lastModified) : Number.NaN
  return Number.isFinite(modificado) && modificado > 0 && modificado <= ahora ? modificado : ahora
}

export async function fotoDesdeArchivo(archivo: Blob, opciones: OpcionesArchivo = {}): Promise<ResultadoCaptura> {
  // El tipo puede venir vacío en algunos navegadores: entonces se intenta decodificar igual.
  if (archivo.type !== '' && !archivo.type.startsWith('image/')) return { ok: false, error: new CapturaError('ARCHIVO_INVALIDO') }
  if (archivo.size === 0) return { ok: false, error: new CapturaError('BLOB_VACIO') }

  let imagen: ImagenDecodificada
  try {
    imagen = await (opciones.decodificar ?? decodificarEnNavegador)(archivo)
  } catch (causa) {
    return { ok: false, error: new CapturaError(pareceFaltaDeMemoria(causa) ? 'MEMORIA_AGOTADA' : 'ARCHIVO_INVALIDO', causa) }
  }

  try {
    if (!(imagen.ancho > 0 && imagen.alto > 0)) return { ok: false, error: new CapturaError('ARCHIVO_INVALIDO') }
    const ahora = (opciones.reloj ?? Date.now)()
    const instante = instanteDe(archivo, ahora)
    return await codificarJpeg(imagen.fuente, imagen.ancho, imagen.alto, { ...opciones, reloj: () => instante })
  } finally {
    imagen.liberar()
  }
}
