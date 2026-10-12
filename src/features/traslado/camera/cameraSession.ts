import { detectarSoporte } from './capabilities'
import { CapturaError, type FotoCapturada, type ResultadoCaptura, capturarFrame } from './captureFrame'
import {
  PROTECCION_TOQUE_ACCIDENTAL_MS,
  RESTRICCIONES_MINIMAS,
  RESTRICCIONES_PREFERIDAS,
  TIEMPO_PRIMER_FRAME_MS,
} from './config'
import { type EstadoCamara, transicionarCamara } from './estadoCamara'
import { CamaraError, errorDeNavegador, errorReproduccion, errorTiempoAgotado, esErrorDeRestricciones } from './errors'
import { type EntornoNavegador, type Plataforma, detectarPlataforma, entornoActual } from './plataforma'

/** Lo mínimo que la sesión necesita de un `<video>`; `HTMLVideoElement` lo cumple y es fácil de simular. */
export interface VideoLike extends EventTarget {
  srcObject: MediaProvider | null
  muted: boolean
  playsInline: boolean
  autoplay: boolean
  readonly videoWidth: number
  readonly videoHeight: number
  readonly readyState: number
  play(): Promise<void> | void
  pause(): void
}

export interface DocumentoLike extends EventTarget {
  readonly visibilityState: string
}

export interface OpcionesCameraSession {
  /** Por defecto `navigator.mediaDevices.getUserMedia`. */
  abrirCamara?: (restricciones: MediaStreamConstraints) => Promise<MediaStream>
  entorno?: EntornoNavegador
  documento?: DocumentoLike
  tiempoPrimerFrameMs?: number
  /** Por defecto la captura real; las pruebas la sustituyen. */
  capturarFrame?: (video: VideoLike) => Promise<ResultadoCaptura>
  /** Por defecto `URL.createObjectURL` / `URL.revokeObjectURL`. */
  crearUrl?: (blob: Blob) => string
  revocarUrl?: (url: string) => void
  /** Por defecto `Date.now`; las pruebas lo controlan. */
  reloj?: () => number
  proteccionToqueMs?: number
}

/** La foto recién tomada, a la espera de que el operario la use o la repita. */
export interface FotoEnRevision extends FotoCapturada {
  /** La administra la sesión: se crea al entrar a `revisando` y se revoca al salir. */
  readonly urlVistaPrevia: string
}

/** Foto del estado, inmutable: cambia de identidad solo cuando cambia algo (lo exige `useSyncExternalStore`). */
export interface InstantaneaCamara {
  readonly estado: EstadoCamara
  readonly error: CamaraError | null
  /** La sesión necesita un toque del operario para seguir (permiso o reproducción exigen un gesto). */
  readonly requiereGesto: boolean
  /** La foto en revisión; solo existe en `revisando`. */
  readonly foto: FotoEnRevision | null
  /** Por qué falló la última captura; la cámara sigue en `lista`. Se borra al intentar otra. */
  readonly errorCaptura: CapturaError | null
}

const CON_VIDEO_ENCENDIDO: readonly EstadoCamara[] = ['lista', 'capturando', 'revisando']
const ACTIVOS: readonly EstadoCamara[] = ['solicitando', 'iniciando', ...CON_VIDEO_ENCENDIDO]

/**
 * Sesión de cámara: es dueña del `MediaStream` y de todo su ciclo de vida.
 *
 * - **Un solo stream por formulario.** Se abre una vez y se mantiene durante las capturas.
 * - **Se suelta al pasar a segundo plano** y se intenta reabrir al volver. Si el navegador exige un
 *   toque, la sesión queda `suspendida` con `requiereGesto` y espera a {@link reintentar}.
 * - **Sin fugas:** cada apertura lleva una generación; si la sesión se cierra o suspende mientras
 *   se espera al navegador, lo que llegue tarde se descarta y su stream se detiene.
 */
export class CameraSession {
  readonly #abrirCamara: (restricciones: MediaStreamConstraints) => Promise<MediaStream>
  readonly #entorno: EntornoNavegador | undefined
  readonly #documento: DocumentoLike | undefined
  readonly #tiempoPrimerFrameMs: number
  readonly #capturarFrame: (video: VideoLike) => Promise<ResultadoCaptura>
  readonly #crearUrl: (blob: Blob) => string
  readonly #revocarUrl: (url: string) => void
  readonly #reloj: () => number
  readonly #proteccionToqueMs: number
  #revisionDesde = 0

  #estado: EstadoCamara = 'inactiva'
  #instantanea: InstantaneaCamara = { estado: 'inactiva', error: null, requiereGesto: false, foto: null, errorCaptura: null }
  #urlVistaPrevia: string | null = null
  readonly #escuchas = new Set<() => void>()

  #video: VideoLike | null = null
  #stream: MediaStream | null = null
  #plataforma: Plataforma = 'otra'
  #generacion = 0
  #cancelarEspera: (() => void) | null = null
  #limpiezaTracks: Array<() => void> = []

  constructor(opciones: OpcionesCameraSession = {}) {
    this.#abrirCamara = opciones.abrirCamara ?? ((restricciones) => navigator.mediaDevices.getUserMedia(restricciones))
    this.#entorno = opciones.entorno
    this.#documento = opciones.documento ?? (typeof document === 'undefined' ? undefined : document)
    this.#tiempoPrimerFrameMs = opciones.tiempoPrimerFrameMs ?? TIEMPO_PRIMER_FRAME_MS
    this.#capturarFrame = opciones.capturarFrame ?? ((video) => capturarFrame(video))
    this.#crearUrl = opciones.crearUrl ?? ((blob) => URL.createObjectURL(blob))
    this.#revocarUrl = opciones.revocarUrl ?? ((url) => URL.revokeObjectURL(url))
    this.#reloj = opciones.reloj ?? Date.now
    this.#proteccionToqueMs = opciones.proteccionToqueMs ?? PROTECCION_TOQUE_ACCIDENTAL_MS
  }

  // --- Lectura y suscripción (para useSyncExternalStore) ---------------------------------------

  readonly getSnapshot = (): InstantaneaCamara => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /** El `<video>` conectado, para que la captura (T3) lea el frame. */
  get video(): VideoLike | null {
    return this.#video
  }

  conectarVideo(video: VideoLike | null): void {
    this.#video = video
  }

  // --- Ciclo de vida -----------------------------------------------------------------------------

  /** Pide la cámara. Se espera a haber llamado antes a {@link conectarVideo}. */
  async abrir(): Promise<void> {
    if (this.#estado !== 'inactiva') return
    if (!this.#video) throw new Error('Falta conectarVideo() antes de abrir().')

    const entorno = this.#entorno ?? entornoActual()
    this.#plataforma = detectarPlataforma(entorno)

    const soporte = detectarSoporte(entorno)
    if (!soporte.ok) {
      this.#fijar('sinSoporte', { error: soporte.error })
      return
    }

    this.#documento?.addEventListener('visibilitychange', this.#alCambiarVisibilidad)
    await this.#arrancar(false)
  }

  /**
   * Para el botón «Reintentar» o «Tocar para reactivar»: un gesto del operario. Si el stream sigue
   * vivo solo reinicia el video; si no, pide la cámara de nuevo.
   */
  async reintentar(): Promise<void> {
    if (this.#estado !== 'error' && this.#estado !== 'suspendida') return
    if (this.#streamVivo()) {
      await this.#iniciarVideo(++this.#generacion, false)
    } else {
      await this.#arrancar(false)
    }
  }

  /** Suelta la cámara y deja la sesión lista para abrirse de nuevo. */
  cerrar(): void {
    this.#generacion++
    this.#documento?.removeEventListener('visibilitychange', this.#alCambiarVisibilidad)
    this.#detenerStream()
    if (this.#estado !== 'inactiva') this.#fijar('inactiva')
  }

  // --- Captura ---------------------------------------------------------------------------------

  /**
   * Toma una foto. Devuelve `null` si no estaba `lista` (por ejemplo, un segundo toque mientras la
   * primera captura sigue en curso): solo se procesa una.
   *
   * Si la sesión se pausa o se cierra mientras se captura, el resultado se descarta y se devuelve
   * un fallo `INTERRUMPIDA`: no se puede pasar a `revisando` desde una sesión suspendida.
   */
  async capturar(): Promise<ResultadoCaptura | null> {
    const video = this.#video
    if (this.#estado !== 'lista' || !video) return null

    this.#fijar('capturando')
    const generacion = this.#generacion

    let resultado: ResultadoCaptura
    try {
      resultado = await this.#capturarFrame(video)
    } catch (causa) {
      resultado = { ok: false, error: new CapturaError('CAPTURA_FALLIDA', causa) }
    }

    // Se relee el estado a propósito: durante el `await` pudo cambiar (pausa, cierre).
    if (!this.#esta('capturando') || generacion !== this.#generacion) {
      return { ok: false, error: new CapturaError('INTERRUMPIDA') }
    }
    if (!resultado.ok) {
      this.#fijar('lista', { errorCaptura: resultado.error })
      return resultado
    }

    const url = this.#crearUrl(resultado.foto.blob)
    this.#urlVistaPrevia = url
    this.#revisionDesde = this.#reloj()
    this.#fijar('revisando', { foto: { ...resultado.foto, urlVistaPrevia: url } })
    return resultado
  }

  /**
   * ¿Ya pasó el plazo de protección desde que apareció la foto? Los botones «Usar» y «Repetir»
   * ignoran los toques anteriores (ver `PROTECCION_TOQUE_ACCIDENTAL_MS`).
   */
  toquePermitidoEnRevision(): boolean {
    return this.#esta('revisando') && this.#reloj() - this.#revisionDesde >= this.#proteccionToqueMs
  }

  /**
   * «Repetir» del operario: descarta la foto en revisión y vuelve a la cámara. Devuelve `false` si
   * el toque se ignoró: llegó demasiado pronto o ya no hay una foto en revisión.
   */
  repetir(): boolean {
    if (!this.toquePermitidoEnRevision()) return false
    this.#fijar('lista')
    return true
  }

  /**
   * Vuelve a la cámara cuando la foto en revisión ya se resolvió (se guardó). Si mientras tanto la
   * cámara se pausó, no hace nada: no hay revisión que cerrar y no es un error.
   */
  cerrarRevisionSiSigue(): void {
    if (this.#esta('revisando')) this.#fijar('lista')
  }

  /** Vuelve a la cámara sin la protección de toque: para uso interno del flujo, no de un botón. */
  cerrarRevision(): void {
    this.#fijar('lista')
  }

  // --- Internos ---------------------------------------------------------------------------------

  /** Lectura del estado a través de un método: TypeScript no sabe que `#fijar` y los `await` lo cambian. */
  #esta(estado: EstadoCamara): boolean {
    return this.#estado === estado
  }

  #fijar(
    hacia: EstadoCamara,
    extra: { error?: CamaraError; requiereGesto?: boolean; foto?: FotoEnRevision; errorCaptura?: CapturaError } = {},
  ): void {
    const anterior = this.#estado
    this.#estado = transicionarCamara(anterior, hacia)

    // La URL de la vista previa vive mientras la foto está en revisión: al salir de ahí se revoca,
    // sea cual sea el motivo (repetir, pausa o cierre).
    if (anterior === 'revisando' && hacia !== 'revisando' && this.#urlVistaPrevia) {
      this.#revocarUrl(this.#urlVistaPrevia)
      this.#urlVistaPrevia = null
    }

    this.#instantanea = {
      estado: this.#estado,
      error: extra.error ?? null,
      requiereGesto: extra.requiereGesto ?? false,
      foto: extra.foto ?? null,
      errorCaptura: extra.errorCaptura ?? null,
    }
    for (const escucha of [...this.#escuchas]) escucha()
  }

  async #arrancar(reanudacionAutomatica: boolean): Promise<void> {
    this.#detenerStream()
    const generacion = ++this.#generacion
    this.#fijar('solicitando')

    let stream: MediaStream
    try {
      stream = await this.#obtenerStream()
    } catch (causa) {
      this.#fallarStream(generacion, causa, reanudacionAutomatica)
      return
    }

    if (generacion !== this.#generacion) {
      // La sesión se cerró o suspendió mientras esperaba al navegador: no se deja la cámara abierta.
      for (const track of stream.getTracks()) track.stop()
      return
    }

    this.#stream = stream
    this.#vigilar(stream)
    await this.#iniciarVideo(generacion, reanudacionAutomatica)
  }

  async #obtenerStream(): Promise<MediaStream> {
    try {
      return await this.#abrirCamara(RESTRICCIONES_PREFERIDAS)
    } catch (causa) {
      if (esErrorDeRestricciones(causa)) return this.#abrirCamara(RESTRICCIONES_MINIMAS)
      throw causa
    }
  }

  async #iniciarVideo(generacion: number, reanudacionAutomatica: boolean): Promise<void> {
    const video = this.#video
    const stream = this.#stream
    if (!video || !stream) return

    this.#fijar('iniciando')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = stream

    try {
      await video.play()
    } catch {
      this.#fallarVideo(generacion, reanudacionAutomatica)
      return
    }
    if (generacion !== this.#generacion) return

    let hayFrame: boolean
    try {
      hayFrame = await this.#esperarPrimerFrame(video)
    } catch (causa) {
      this.#fallarStream(generacion, causa, reanudacionAutomatica)
      return
    }
    if (!hayFrame || generacion !== this.#generacion) return

    this.#fijar('lista')
  }

  /** `true` cuando hay un frame válido; `false` si se canceló; rechaza si se agota el tiempo. */
  #esperarPrimerFrame(video: VideoLike): Promise<boolean> {
    return new Promise((resolver, rechazar) => {
      const hayFrame = () => video.videoWidth > 0 && video.readyState >= 2 // HAVE_CURRENT_DATA
      if (hayFrame()) {
        resolver(true)
        return
      }

      const eventos = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'resize']
      const limpiar = () => {
        clearTimeout(temporizador)
        for (const evento of eventos) video.removeEventListener(evento, revisar)
        this.#cancelarEspera = null
      }
      const revisar = () => {
        if (!hayFrame()) return
        limpiar()
        resolver(true)
      }
      const temporizador = setTimeout(() => {
        limpiar()
        rechazar(errorTiempoAgotado())
      }, this.#tiempoPrimerFrameMs)

      for (const evento of eventos) video.addEventListener(evento, revisar)
      this.#cancelarEspera = () => {
        limpiar()
        resolver(false)
      }
    })
  }

  #fallarStream(generacion: number, causa: unknown, reanudacionAutomatica: boolean): void {
    if (generacion !== this.#generacion) return
    const error = causa instanceof CamaraError ? causa : errorDeNavegador(causa, this.#plataforma)
    this.#detenerStream()
    if (reanudacionAutomatica && error.codigo === 'PERMISO_DENEGADO') {
      // Al volver de segundo plano un rechazo puede ser solo «falta un toque», no un permiso
      // retirado: se pide el gesto antes de mostrar las instrucciones de permisos.
      this.#fijar('suspendida', { requiereGesto: true })
    } else {
      this.#fijar('error', { error })
    }
  }

  #fallarVideo(generacion: number, reanudacionAutomatica: boolean): void {
    if (generacion !== this.#generacion) return
    // Se conserva el stream: el toque del operario solo tiene que arrancar el video.
    if (reanudacionAutomatica) this.#fijar('suspendida', { requiereGesto: true })
    else this.#fijar('error', { error: errorReproduccion(), requiereGesto: true })
  }

  #streamVivo(): boolean {
    return this.#stream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false
  }

  /** `segundoPlano` suelta la cámara; `mute` (una interrupción) conserva el stream para reanudarlo. */
  #suspender(soltarStream: boolean): void {
    if (!ACTIVOS.includes(this.#estado)) return
    this.#generacion++
    if (soltarStream) this.#detenerStream()
    else this.#cancelarEspera?.()
    this.#fijar('suspendida')
  }

  readonly #alCambiarVisibilidad = (): void => {
    const visibilidad = this.#documento?.visibilityState
    if (visibilidad === 'hidden') {
      this.#suspender(true)
    } else if (visibilidad === 'visible' && this.#estado === 'suspendida') {
      void this.#arrancar(true)
    }
  }

  #vigilar(stream: MediaStream): void {
    for (const track of stream.getVideoTracks()) {
      const alTerminar = () => {
        if (this.#stream !== stream || !CON_VIDEO_ENCENDIDO.includes(this.#estado)) return
        this.#suspender(true)
        // La página sigue visible: no habrá `visibilitychange` que dispare la reapertura.
        if (this.#documento?.visibilityState !== 'hidden') void this.#arrancar(true)
      }
      const alSilenciarse = () => {
        if (this.#stream !== stream || !CON_VIDEO_ENCENDIDO.includes(this.#estado)) return
        this.#suspender(false)
      }
      const alReactivarse = () => {
        if (this.#stream !== stream || this.#estado !== 'suspendida' || track.readyState !== 'live') return
        void this.#iniciarVideo(++this.#generacion, true)
      }

      track.addEventListener('ended', alTerminar)
      track.addEventListener('mute', alSilenciarse)
      track.addEventListener('unmute', alReactivarse)
      this.#limpiezaTracks.push(() => {
        track.removeEventListener('ended', alTerminar)
        track.removeEventListener('mute', alSilenciarse)
        track.removeEventListener('unmute', alReactivarse)
      })
    }
  }

  #detenerStream(): void {
    this.#cancelarEspera?.()
    for (const limpiar of this.#limpiezaTracks.splice(0)) limpiar()

    const stream = this.#stream
    this.#stream = null
    if (stream) for (const track of stream.getTracks()) track.stop()

    if (this.#video) {
      this.#video.pause()
      this.#video.srcObject = null
    }
  }
}
