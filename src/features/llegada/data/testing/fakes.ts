/**
 * Dobles de prueba de la marcación de llegada: un GPS y un servidor de mentira que el test controla. Solo se importan desde
 * pruebas; la aplicación no los usa.
 */
import type { DatosDeLlegada, LlegadaApi } from '../../api/llegadaApi'
import type { FixUbicacion, ResultadoLlegada } from '../../domain'
import type { ErrorUbicacion, ServicioUbicacion } from '../ubicacion'

export const QR_DE_PRUEBA = 'SUM1|1|59733450|zQG61jRaGQCSUy_8-vyeVQ'

/** La hora «ahora» de las pruebas: 15/10/2026 14:35 en Lima. */
export const AHORA_DE_PRUEBA = Date.parse('2026-10-15T19:35:00Z')

export const fixDePrueba = (extra: Partial<FixUbicacion> = {}): FixUbicacion => ({
  latitud: -11.902172,
  longitud: -77.122394,
  precisionM: 10,
  momento: AHORA_DE_PRUEBA,
  ...extra,
})

export const llegadaConfirmada = (extra: Partial<Extract<ResultadoLlegada, { tipo: 'confirmada' }>['llegada']> = {}): ResultadoLlegada => ({
  tipo: 'confirmada',
  yaRegistrada: false,
  llegada: { idLlegada: 11, punto: 'Patio de llegada', fechaLlegada: AHORA_DE_PRUEBA - 60_000, turno: 3, ...extra },
})

/** Un GPS que el test maneja a mano: emite fixes y errores cuando quiere, y cuenta cuántas veces empezó y paró. */
export class UbicacionFalsa implements ServicioUbicacion {
  inicios = 0
  paradas = 0
  #alFix: ((fix: FixUbicacion) => void) | null = null
  #alError: ((error: ErrorUbicacion) => void) | null = null

  get escuchando(): boolean {
    return this.#alFix !== null
  }

  iniciar(alFix: (fix: FixUbicacion) => void, alError: (error: ErrorUbicacion) => void): () => void {
    this.inicios++
    this.#alFix = alFix
    this.#alError = alError
    return () => {
      this.paradas++
      this.#alFix = null
      this.#alError = null
    }
  }

  /** El GPS entrega una lectura. Si nadie escucha, no pasa nada (como un GPS apagado). */
  emitir(fix: FixUbicacion): void {
    this.#alFix?.(fix)
  }

  fallar(error: ErrorUbicacion): void {
    this.#alError?.(error)
  }
}

/** Un servidor que contesta lo que el test le diga, en orden, y guarda lo que le mandaron. Cada respuesta puede demorarse. */
export class LlegadaApiFalsa implements LlegadaApi {
  readonly llamadas: DatosDeLlegada[] = []
  #respuestas: Array<ResultadoLlegada | Promise<ResultadoLlegada> | Error> = []
  /** Cuántas peticiones están sin contestar ahora mismo. */
  enCurso = 0
  maximoEnParalelo = 0

  /** Lo que contestará la próxima llamada. Una promesa permite contestar más tarde; un `Error`, fallar. */
  responder(...respuestas: Array<ResultadoLlegada | Promise<ResultadoLlegada> | Error>): this {
    this.#respuestas.push(...respuestas)
    return this
  }

  async registrar(datos: DatosDeLlegada): Promise<ResultadoLlegada> {
    this.llamadas.push(datos)
    this.enCurso++
    this.maximoEnParalelo = Math.max(this.maximoEnParalelo, this.enCurso)
    try {
      const siguiente = this.#respuestas.shift() ?? llegadaConfirmada()
      if (siguiente instanceof Error) throw siguiente
      return await siguiente
    } finally {
      this.enCurso--
    }
  }
}

/** Una respuesta que el test resuelve cuando quiere. */
export function respuestaPendiente() {
  let resolver!: (resultado: ResultadoLlegada) => void
  const promesa = new Promise<ResultadoLlegada>((resolve) => {
    resolver = resolve
  })
  return { promesa, resolver }
}
