import { ApiError } from '@/core/http/ApiError'
import type { TableroApi } from '../api/tableroApi'
import { type DatosTablero, esDiaConsultable, hoyEnLima } from '../domain'

export interface InstantaneaTablero {
  /** Todavía no hubo ninguna respuesta (ni error): es la primera carga. */
  readonly cargando: boolean
  /** Hay una petición en curso (la primera, «Actualizar» o un cambio de día o de punto). */
  readonly actualizando: boolean
  /** La última petición falló por falta de red: se sigue mostrando lo último recibido. */
  readonly sinConexion: boolean
  /** Otro fallo (servidor caído, respuesta inesperada, un día que el servidor no acepta). Se sigue mostrando lo último recibido. */
  readonly error: string | null
  /** El servidor respondió 403: este usuario no puede ver el tablero. */
  readonly sinPermiso: { readonly mensaje: string } | null
  /** Hoy en Lima (`AAAA-MM-DD`) la última vez que se pidió: el límite de arriba del selector de día. */
  readonly hoy: string
  /** El día elegido (`AAAA-MM-DD`, de Lima). Puede ir por delante de `datos` mientras llega la respuesta. */
  readonly dia: string
  /** El punto elegido, o `null` para todos. */
  readonly idPunto: number | null
  /** Lo último que llegó (de `datos.dia.dia` y `datos.dia.idPunto`), o `null` si todavía no llegó nada. */
  readonly datos: DatosTablero | null
  /** Filas que el servidor mandó con datos inválidos y no se muestran. */
  readonly descartadas: number
  /** Cuándo llegó lo último (milisegundos), o `null`. */
  readonly actualizadoEn: number | null
}

/**
 * El tablero de llegadas por QR. **Solo vive en memoria**: son datos de personas (nombre, usuario y ubicación de los
 * conductores) y no se guardan en el navegador (sin Dexie).
 *
 * Se pide al abrir y **solo vuelve a pedir** con «Actualizar» o al cambiar el día o el punto (decisión del usuario para la
 * vista del coordinador, y el spec no pide otra cosa: sin renovación automática). Un fallo nunca vacía lo que ya se muestra.
 * Los datos son de la persona que inició sesión: si entra otra, o se cierra la sesión, se vacían.
 */
export class TableroLlegadas {
  readonly #api: TableroApi
  readonly #reloj: () => number

  #instantanea: InstantaneaTablero
  readonly #escuchas = new Set<() => void>()
  #generacion = 0
  #actualizacion: Promise<void> | null = null
  #dueno: number | null | undefined = undefined

  constructor(opciones: { api: TableroApi; reloj?: () => number }) {
    this.#api = opciones.api
    this.#reloj = opciones.reloj ?? Date.now
    this.#instantanea = this.#inicial()
  }

  #inicial(): InstantaneaTablero {
    return {
      cargando: true,
      actualizando: false,
      sinConexion: false,
      error: null,
      sinPermiso: null,
      hoy: hoyEnLima(this.#reloj()),
      dia: hoyEnLima(this.#reloj()),
      idPunto: null,
      datos: null,
      descartadas: 0,
      actualizadoEn: null,
    }
  }

  readonly getSnapshot = (): InstantaneaTablero => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /**
   * Al abrir la pantalla: si lo que hay es de otra persona se vacía, y se pide lo último al servidor. `idUsuario` es el de la
   * sesión (puede ser `null` si el token no lo trae: entonces cualquier dato anterior se descarta por seguridad).
   */
  iniciar(idUsuario: number | null): Promise<void> {
    if (this.#dueno !== undefined && (this.#dueno !== idUsuario || idUsuario === null)) this.vaciar()
    this.#dueno = idUsuario
    return this.actualizar()
  }

  /** Pide las tres lecturas al servidor. Una sola petición a la vez. */
  actualizar(): Promise<void> {
    if (this.#actualizacion) return this.#actualizacion
    return this.#lanzar()
  }

  /** Cambia el día y pide lo de ese día. Un día que no se puede consultar (futuro, de más de 90 días o inválido) se ignora. */
  elegirDia(dia: string): Promise<void> {
    if (dia === this.#instantanea.dia || !esDiaConsultable(dia, hoyEnLima(this.#reloj()))) return this.#actualizacion ?? Promise.resolve()
    this.#publicar({ dia })
    return this.#lanzar()
  }

  /** Cambia el punto (`null` = todos) y pide lo de ese punto. */
  elegirPunto(idPunto: number | null): Promise<void> {
    if (idPunto === this.#instantanea.idPunto) return this.#actualizacion ?? Promise.resolve()
    this.#publicar({ idPunto })
    return this.#lanzar()
  }

  /** La pantalla se desmontó: lo que llegue después se descarta. Lo mostrado no se toca. */
  liberar(): void {
    this.#generacion++
    this.#actualizacion = null
    if (this.#instantanea.actualizando) this.#publicar({ actualizando: false })
  }

  /** Cierre de sesión o cambio de persona: no debe quedar nada de la anterior. */
  vaciar(): void {
    this.#generacion++
    this.#actualizacion = null
    this.#dueno = undefined
    this.#instantanea = this.#inicial()
    for (const escucha of [...this.#escuchas]) escucha()
  }

  /** Empieza una petición nueva; lo que estuviera en vuelo ya no corresponde (otro día, otro punto) y se descarta. */
  #lanzar(): Promise<void> {
    this.#generacion++
    const actualizacion = this.#pedir().finally(() => {
      if (this.#actualizacion === actualizacion) this.#actualizacion = null
    })
    this.#actualizacion = actualizacion
    return actualizacion
  }

  async #pedir(): Promise<void> {
    const generacion = this.#generacion
    const { dia, idPunto } = this.#instantanea
    this.#publicar({ actualizando: true })
    try {
      const [d, i, p] = await Promise.all([this.#api.dia({ dia, idPunto }), this.#api.intentos({ dia, idPunto }), this.#api.puntos({ dia })])
      if (generacion !== this.#generacion) return
      this.#publicar({
        cargando: false,
        actualizando: false,
        sinConexion: false,
        error: null,
        sinPermiso: null,
        datos: { dia: d.dia, intentos: i.intentos, puntos: p.puntos },
        descartadas: d.descartadas + i.descartados + p.descartados,
        hoy: hoyEnLima(this.#reloj()),
        actualizadoEn: this.#reloj(),
      })
    } catch (error) {
      if (generacion !== this.#generacion) return
      if (error instanceof ApiError && error.status === 403) {
        // Sin permiso no se conserva nada: lo que había era de un par que ya no puede verlo.
        this.#publicar({ cargando: false, actualizando: false, sinConexion: false, error: null, sinPermiso: { mensaje: error.message }, datos: null, descartadas: 0 })
      } else if (error instanceof ApiError && error.isNetwork) {
        this.#publicar({ cargando: false, actualizando: false, sinConexion: true, error: null })
      } else {
        this.#publicar({ cargando: false, actualizando: false, sinConexion: false, error: error instanceof ApiError ? error.message : 'No se pudo traer el tablero.' })
      }
    }
  }

  #publicar(cambios: Partial<InstantaneaTablero>): void {
    this.#instantanea = { ...this.#instantanea, ...cambios }
    for (const escucha of [...this.#escuchas]) escucha()
  }
}
