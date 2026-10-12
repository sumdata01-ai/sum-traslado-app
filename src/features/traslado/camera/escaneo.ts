/**
 * Lectura de códigos QR y de barras desde el video (O-05). Es el mismo criterio que la app móvil
 * («QR o código de barras del VIN»): lo que se lee es texto, y qué hacer con él lo decide quien llama.
 *
 * La librería de lectura (`@zxing/browser`) pesa bastante y solo hace falta al abrir el escáner: se carga
 * entonces y no con el resto de la página.
 */

/** Lee un código de la imagen del lienzo. `null` si no hay ninguno legible (lo normal en casi todos los cuadros). */
export interface DecodificadorCodigos {
  decodificar(lienzo: HTMLCanvasElement): string | null
}

/** Los errores de «no encontré nada» de la librería no son fallos: el cuadro simplemente no tiene un código. */
const SIN_CODIGO = new Set(['NotFoundException', 'ChecksumException', 'FormatException'])

export async function crearDecodificadorZxing(): Promise<DecodificadorCodigos> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const pistas = new Map<number, unknown>([
    // Los que traen un VIN: QR en las etiquetas nuevas; Code 128/39 y Data Matrix en las de fábrica.
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.DATA_MATRIX]],
    [DecodeHintType.TRY_HARDER, true],
  ])
  const lector = new BrowserMultiFormatReader(pistas as Map<number, unknown> as ConstructorParameters<typeof BrowserMultiFormatReader>[0])
  return {
    decodificar(lienzo) {
      try {
        return lector.decodeFromCanvas(lienzo).getText()
      } catch (causa) {
        if (typeof causa === 'object' && causa !== null && 'name' in causa && SIN_CODIGO.has(String(causa.name))) return null
        throw causa
      }
    },
  }
}

/** Lo que el escáner necesita de un `<video>`; `HTMLVideoElement` lo cumple. */
export interface VideoDeEscaneo {
  readonly videoWidth: number
  readonly videoHeight: number
}

export interface OpcionesEscaner {
  video: VideoDeEscaneo
  decodificador: DecodificadorCodigos
  /** Se llama **una vez**, con el texto del primer código leído; el escáner se detiene solo. */
  alLeer: (texto: string) => void
  /** El decodificador falló de verdad (no es «no hay código»): el escáner se detiene. */
  alFallar?: (causa: unknown) => void
  /** Cada cuánto se revisa un cuadro. Un valor alto cuida la batería; uno bajo lee más rápido. */
  intervaloMs?: number
  /** Lado largo máximo del cuadro que se analiza: más pequeño es más rápido, pero un código lejano se pierde. */
  ladoLargoMaximoPx?: number
  /** Solo se sustituye en las pruebas. */
  crearLienzo?: () => HTMLCanvasElement
}

export const INTERVALO_ESCANEO_MS = 150
export const LADO_LARGO_ESCANEO_PX = 1024

/**
 * Revisa el video cuadro a cuadro hasta leer un código. **Un solo paso a la vez** (el siguiente se programa
 * cuando termina el anterior): si decodificar tarda más que el intervalo, los cuadros no se acumulan.
 */
export class EscanerCodigos {
  readonly #opciones: OpcionesEscaner
  #lienzo: HTMLCanvasElement | null = null
  #temporizador: ReturnType<typeof setTimeout> | null = null
  #activo = false

  constructor(opciones: OpcionesEscaner) {
    this.#opciones = opciones
  }

  iniciar(): void {
    if (this.#activo) return
    this.#activo = true
    this.#programar(0)
  }

  /** Para el escaneo y suelta el lienzo. Se puede llamar varias veces. */
  detener(): void {
    this.#activo = false
    if (this.#temporizador !== null) clearTimeout(this.#temporizador)
    this.#temporizador = null
    if (this.#lienzo) {
      this.#lienzo.width = 0
      this.#lienzo.height = 0
      this.#lienzo = null
    }
  }

  get activo(): boolean {
    return this.#activo
  }

  #programar(espera: number): void {
    this.#temporizador = setTimeout(() => this.#paso(), espera)
  }

  #paso(): void {
    this.#temporizador = null
    if (!this.#activo) return
    const { video, alLeer, alFallar } = this.#opciones

    try {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const texto = this.#leerCuadro()
        if (texto !== null && texto.trim() !== '') {
          this.detener()
          alLeer(texto)
          return
        }
      }
    } catch (causa) {
      this.detener()
      alFallar?.(causa)
      return
    }
    this.#programar(this.#opciones.intervaloMs ?? INTERVALO_ESCANEO_MS)
  }

  #leerCuadro(): string | null {
    const { video, decodificador } = this.#opciones
    const lado = this.#opciones.ladoLargoMaximoPx ?? LADO_LARGO_ESCANEO_PX
    const escala = Math.min(1, lado / Math.max(video.videoWidth, video.videoHeight))
    const ancho = Math.max(1, Math.round(video.videoWidth * escala))
    const alto = Math.max(1, Math.round(video.videoHeight * escala))

    const lienzo = (this.#lienzo ??= (this.#opciones.crearLienzo ?? (() => document.createElement('canvas')))())
    lienzo.width = ancho
    lienzo.height = alto
    // `willReadFrequently`: se lee el cuadro de vuelta cada vez, y así el navegador lo guarda en memoria normal.
    const contexto = lienzo.getContext('2d', { willReadFrequently: true })
    if (!contexto) throw new Error('No se pudo preparar el lienzo para leer el código.')
    contexto.drawImage(video as unknown as CanvasImageSource, 0, 0, ancho, alto)
    return decodificador.decodificar(lienzo)
  }
}
