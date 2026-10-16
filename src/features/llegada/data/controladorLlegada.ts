import type { LlegadaApi } from '../api/llegadaApi'
import { EDAD_MAXIMA_FIX_MS, type FixUbicacion, type LlegadaConfirmada, type ResultadoLlegada, TOPE_ESPERA_UBICACION_MS, esFixUtil } from '../domain'
import type { ErrorUbicacion, ServicioUbicacion } from './ubicacion'

/** En qué punto del recorrido de «Marcar llegada» está el conductor. */
export type EtapaLlegada =
  /** Antes de pedir nada: se explica para qué se usan la cámara y la ubicación. Los permisos los pide el navegador al empezar. */
  | 'explicacion'
  /** La cámara está abierta, buscando el QR. La ubicación ya se está buscando en segundo plano. */
  | 'escaneando'
  /** Se leyó el QR y todavía no hay un fix reciente: se espera, con tope. */
  | 'buscandoUbicacion'
  /** La petición está en camino. No se puede volver a tocar nada: un envío por escaneo. */
  | 'enviando'
  /** El servidor dijo «precisión insuficiente»: se sigue escuchando el GPS y se reenvía solo al mejorar, con tope. */
  | 'esperandoPrecision'
  | 'confirmada'
  | 'codigoInvalido'
  | 'fueraDeZona'
  /** No hubo una ubicación utilizable: el servidor la rechazó (422) o no llegó ningún fix a tiempo. */
  | 'ubicacionNoDisponible'
  /** Pasó el tope esperando que la precisión bajara del máximo del punto. */
  | 'precisionNoAlcanzada'
  /** El navegador no da la ubicación a este sitio: hay que permitirla en los ajustes del navegador. */
  | 'ubicacionDenegada'
  | 'sinPermisoParaLlegada'
  | 'sinRed'
  | 'sesionVencida'
  | 'errorInesperado'

export interface InstantaneaLlegada {
  readonly etapa: EtapaLlegada
  readonly confirmada: LlegadaConfirmada | null
  /** El instante en que se confirmó, para decir «Hoy 14:35» o la fecha sin leer el reloj al dibujar. */
  readonly confirmadaEn: number | null
  /** La precisión que acepta el punto, en metros (la dijo el servidor), o `null` si todavía no se sabe. */
  readonly precisionMaxM: number | null
  /** La precisión del último fix recibido mientras se espera una mejor, en metros. */
  readonly precisionActualM: number | null
  /** Cambia cada vez que empieza una espera: la pantalla lo usa para reiniciar la barra de tiempo. */
  readonly esperaId: number
}

export interface OpcionesControladorLlegada {
  api: LlegadaApi
  ubicacion: ServicioUbicacion
  /** Milisegundos desde 1970. Solo se sustituye en las pruebas. */
  ahora?: () => number
  /** Cuánto se espera una ubicación, o una precisión mejor, antes de rendirse. */
  topeEsperaMs?: number
  edadMaximaFixMs?: number
}

const INICIAL: InstantaneaLlegada = { etapa: 'explicacion', confirmada: null, confirmadaEn: null, precisionMaxM: null, precisionActualM: null, esperaId: 0 }

/**
 * El recorrido completo de «Marcar llegada»: ubicación, lectura del QR, envío y respuesta. Es un store externo (`getSnapshot` +
 * `suscribir`) sin React ni navegador: recibe el servidor y el GPS por puerto, así que se prueba entero.
 *
 * Reglas que se cumplen aquí (las mismas que la app móvil):
 * 1. el texto del QR va **tal cual**, sin `trim()` ni cambio de mayúsculas;
 * 2. **un envío por escaneo**: se ignora todo lo que llegue mientras no se esté escaneando, y nunca hay dos peticiones a la vez;
 * 3. solo un fix reciente (`esFixUtil`), nunca la última posición conocida;
 * 5. no se manda ninguna fecha (ver `cuerpoDeLlegada`).
 * La búsqueda de la ubicación empieza al empezar a escanear, para que el GPS ya esté listo al leer el QR.
 */
export class ControladorLlegada {
  readonly #api: LlegadaApi
  readonly #ubicacion: ServicioUbicacion
  readonly #ahora: () => number
  readonly #topeEsperaMs: number
  readonly #edadMaximaFixMs: number

  #instantanea: InstantaneaLlegada = INICIAL
  readonly #oyentes = new Set<() => void>()

  #textoLeido: string | null = null
  #ultimoFix: FixUbicacion | null = null
  #fixEnviado: FixUbicacion | null = null
  #detenerUbicacion: (() => void) | null = null
  #temporizador: ReturnType<typeof setTimeout> | null = null
  #enviando = false
  /** Sube cada vez que se sale de la pantalla: lo que una petición vieja conteste después ya no corresponde. */
  #generacion = 0
  /** El 422 se reintenta UNA vez solo, con una posición nueva; si vuelve a fallar se ofrece «Recalcular posición». Se reinicia con cada QR leído. */
  #reintentoDel422Usado = false

  constructor({ api, ubicacion, ahora = Date.now, topeEsperaMs = TOPE_ESPERA_UBICACION_MS, edadMaximaFixMs = EDAD_MAXIMA_FIX_MS }: OpcionesControladorLlegada) {
    this.#api = api
    this.#ubicacion = ubicacion
    this.#ahora = ahora
    this.#topeEsperaMs = topeEsperaMs
    this.#edadMaximaFixMs = edadMaximaFixMs
  }

  readonly getSnapshot = (): InstantaneaLlegada => this.#instantanea

  readonly suscribir = (oyente: () => void): (() => void) => {
    this.#oyentes.add(oyente)
    return () => this.#oyentes.delete(oyente)
  }

  #cambiar(cambios: Partial<InstantaneaLlegada>): void {
    this.#instantanea = { ...this.#instantanea, ...cambios }
    for (const oyente of [...this.#oyentes]) oyente()
  }

  #ir(etapa: EtapaLlegada): void {
    if (etapa === this.#instantanea.etapa) return
    // Al poder escanear, ya se empieza a buscar la ubicación: el GPS tarda en dar un buen fix y así está listo al leer el QR.
    if (etapa === 'escaneando') this.#arrancarUbicacion()
    this.#cambiar({ etapa })
  }

  // ── Empezar ────────────────────────────────────────────────────────────────

  /** El conductor tocó «Permitir cámara y ubicación»: se abre la cámara y se pide la ubicación (el navegador pregunta en ese momento). */
  empezar(): void {
    if (this.#instantanea.etapa !== 'explicacion') return
    this.#ir('escaneando')
  }

  /** «Reintentar» tras no tener permiso de ubicación (por ejemplo, al volver de los ajustes del navegador). */
  reintentarUbicacion(): void {
    if (this.#instantanea.etapa !== 'ubicacionDenegada') return
    this.#ir('escaneando')
  }

  // ── Ubicación ──────────────────────────────────────────────────────────────

  #arrancarUbicacion(): void {
    if (this.#detenerUbicacion) return
    try {
      this.#detenerUbicacion = this.#ubicacion.iniciar(
        (fix) => this.#alLlegarFix(fix),
        (error) => this.#alFallarUbicacion(error),
      )
    } catch {
      // Sin GPS no hay fix: la espera termina en «no se pudo leer tu ubicación». No se propaga.
    }
  }

  #pararUbicacion(): void {
    this.#detenerUbicacion?.()
    this.#detenerUbicacion = null
  }

  #alFallarUbicacion(error: ErrorUbicacion): void {
    // Las demás fallas (sin señal, tiempo agotado) se resuelven esperando: el tope de la espera las convierte en «no se pudo leer».
    if (error !== 'denegada') return
    this.#pararUbicacion()
    this.#ultimoFix = null
    const { etapa } = this.#instantanea
    if (etapa === 'escaneando' || etapa === 'buscandoUbicacion' || etapa === 'esperandoPrecision') {
      this.#cancelarEspera()
      this.#textoLeido = null
      this.#ir('ubicacionDenegada')
    }
  }

  #fixReciente(): FixUbicacion | null {
    const fix = this.#ultimoFix
    return fix && esFixUtil(fix, { ahora: this.#ahora(), edadMaximaMs: this.#edadMaximaFixMs }) ? fix : null
  }

  /**
   * ¿Este fix sirve para el reenvío tras un «precisión insuficiente»? Tiene que ser reciente, posterior al que ya se mandó y cumplir la
   * precisión del punto; si el servidor no la dijo, basta con que sea mejor que la del fix mandado.
   */
  #mejoraLaPrecision(fix: FixUbicacion): boolean {
    const enviado = this.#fixEnviado
    const { precisionMaxM } = this.#instantanea
    if (enviado && fix.momento <= enviado.momento) return false
    if (!esFixUtil(fix, { ahora: this.#ahora(), edadMaximaMs: this.#edadMaximaFixMs, precisionMaxM })) return false
    if (precisionMaxM === null && enviado) return fix.precisionM < enviado.precisionM
    return true
  }

  #alLlegarFix(fix: FixUbicacion): void {
    this.#ultimoFix = fix
    switch (this.#instantanea.etapa) {
      case 'buscandoUbicacion':
        if (esFixUtil(fix, { ahora: this.#ahora(), edadMaximaMs: this.#edadMaximaFixMs })) {
          this.#cancelarEspera()
          void this.#enviar(fix)
        }
        break
      case 'esperandoPrecision':
        if (this.#mejoraLaPrecision(fix)) {
          this.#cancelarEspera()
          void this.#enviar(fix)
        } else {
          this.#cambiar({ precisionActualM: fix.precisionM })
        }
        break
      default:
        break
    }
  }

  // ── Esperas con tope ───────────────────────────────────────────────────────

  #cancelarEspera(): void {
    if (this.#temporizador !== null) clearTimeout(this.#temporizador)
    this.#temporizador = null
  }

  #esperar(etapa: EtapaLlegada): void {
    this.#cancelarEspera()
    this.#temporizador = setTimeout(() => this.#alAgotarseLaEspera(), this.#topeEsperaMs)
    const esperaId = this.#instantanea.esperaId + 1
    if (etapa === this.#instantanea.etapa) {
      this.#cambiar({ esperaId })
    } else {
      // Mismo orden que la app: la espera nueva se anota antes de cambiar de etapa, para que la barra arranque de cero.
      this.#cambiar({ esperaId })
      this.#ir(etapa)
    }
  }

  #alAgotarseLaEspera(): void {
    this.#temporizador = null
    const { etapa } = this.#instantanea
    if (etapa === 'buscandoUbicacion') this.#ir('ubicacionNoDisponible')
    else if (etapa === 'esperandoPrecision') this.#ir('precisionNoAlcanzada')
  }

  // ── Leer el QR y enviarlo ──────────────────────────────────────────────────

  /**
   * La cámara vio algo. **Solo el primer QR cuenta** (regla 2): al leerlo la etapa deja de ser «escaneando» de inmediato, así que lo
   * que llegue después se ignora, igual que lo que llegue sin estar escaneando. El texto se guarda tal cual (regla 1).
   */
  alDetectar(texto: string): void {
    if (this.#instantanea.etapa !== 'escaneando' || texto === '') return
    this.#textoLeido = texto
    this.#fixEnviado = null
    this.#reintentoDel422Usado = false
    this.#cambiar({ precisionMaxM: null, precisionActualM: null })
    this.#intentarEnviar()
  }

  /** Manda el QR con el fix reciente que haya; si no hay ninguno, espera uno (con tope). */
  #intentarEnviar(): void {
    const fix = this.#fixReciente()
    if (fix) void this.#enviar(fix)
    else this.#esperar('buscandoUbicacion')
  }

  async #enviar(fix: FixUbicacion): Promise<void> {
    const texto = this.#textoLeido
    if (texto === null || this.#enviando) return
    const generacion = this.#generacion
    this.#enviando = true
    this.#fixEnviado = fix
    this.#ir('enviando')
    let resultado: ResultadoLlegada
    try {
      resultado = await this.#api.registrar({ payload: texto, latitud: fix.latitud, longitud: fix.longitud, precisionM: fix.precisionM })
    } catch {
      resultado = { tipo: 'error', status: null }
    } finally {
      if (generacion === this.#generacion) this.#enviando = false
    }
    if (generacion !== this.#generacion) return
    this.#aplicar(resultado, fix)
  }

  #aplicar(resultado: ResultadoLlegada, fix: FixUbicacion): void {
    switch (resultado.tipo) {
      case 'confirmada':
        this.#pararUbicacion()
        this.#cambiar({ confirmada: resultado.llegada, confirmadaEn: this.#ahora() })
        this.#ir('confirmada')
        break
      case 'codigoInvalido':
        this.#ir('codigoInvalido')
        break
      case 'fueraDeZona':
        this.#ir('fueraDeZona')
        break
      case 'precisionInsuficiente':
        this.#cambiar({ precisionMaxM: resultado.precisionMaxM, precisionActualM: fix.precisionM })
        this.#esperarPrecision()
        break
      case 'ubicacionNoLeida':
        if (this.#reintentoDel422Usado) {
          this.#ir('ubicacionNoDisponible')
        } else {
          // Pide una posición nueva y reenvía una vez. Se descarta la que falló para no mandarla otra vez.
          this.#reintentoDel422Usado = true
          this.#ultimoFix = null
          this.#fixEnviado = null
          this.#intentarEnviar()
        }
        break
      case 'sinPermiso':
        this.#ir('sinPermisoParaLlegada')
        break
      case 'sinRed':
        this.#ir('sinRed')
        break
      case 'sesionVencida':
        this.#ir('sesionVencida')
        break
      case 'error':
        this.#ir('errorInesperado')
        break
    }
  }

  /** Espera (con tope) un fix mejor y lo reenvía solo. Si ya hay uno que sirve, lo manda de inmediato. */
  #esperarPrecision(): void {
    this.#esperar('esperandoPrecision')
    const fix = this.#ultimoFix
    if (fix && this.#mejoraLaPrecision(fix)) {
      this.#cancelarEspera()
      void this.#enviar(fix)
    }
  }

  // ── Botones ────────────────────────────────────────────────────────────────

  /** «Recalcular posición» / «Reintentar con mi posición»: descarta el último fix y espera uno **nuevo**, para no volver a mandar la que ya falló. */
  recalcularPosicion(): void {
    const { etapa } = this.#instantanea
    if (etapa !== 'fueraDeZona' && etapa !== 'ubicacionNoDisponible') return
    this.#ultimoFix = null
    this.#fixEnviado = null
    this.#cambiar({ precisionMaxM: null, precisionActualM: null })
    this.#intentarEnviar()
  }

  /**
   * «Reintentar»: tras un fallo de red o del servidor vuelve a mandar el mismo QR (es seguro: la llegada es idempotente); tras no
   * alcanzar la precisión, vuelve a esperar un fix mejor.
   */
  reintentar(): void {
    switch (this.#instantanea.etapa) {
      case 'sinRed':
      case 'errorInesperado':
        this.#intentarEnviar()
        break
      case 'precisionNoAlcanzada':
        this.#esperarPrecision()
        break
      default:
        break
    }
  }

  /** Descarta lo leído y vuelve a abrir la cámara. Solo desde un rechazo o un fallo: en otra etapa no hay nada que descartar. */
  escanearDeNuevo(): void {
    switch (this.#instantanea.etapa) {
      case 'codigoInvalido':
      case 'fueraDeZona':
      case 'ubicacionNoDisponible':
      case 'precisionNoAlcanzada':
      case 'sinRed':
      case 'errorInesperado':
        this.#cancelarEspera()
        this.#textoLeido = null
        this.#fixEnviado = null
        this.#cambiar({ precisionMaxM: null, precisionActualM: null })
        this.#ir('escaneando')
        break
      default:
        break
    }
  }

  /**
   * Suelta el GPS y los temporizadores y vuelve al principio. Se llama al salir de la pantalla. **Se puede volver a usar** después:
   * en desarrollo React monta, desmonta y vuelve a montar cada componente, y el controlador tiene que seguir sirviendo.
   */
  dispose(): void {
    this.#generacion++
    this.#cancelarEspera()
    this.#pararUbicacion()
    this.#enviando = false
    this.#textoLeido = null
    this.#ultimoFix = null
    this.#fixEnviado = null
    this.#reintentoDel422Usado = false
    this.#cambiar({ ...INICIAL })
  }
}
