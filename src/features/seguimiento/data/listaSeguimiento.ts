import { ApiError } from '@/core/http/ApiError'
import type { ResultadosVinesLeidos, SeguimientoApi } from '../api/seguimientoApi'
import { type RangoFechas, type TrasladoSeguimiento, diaDeLima, errorDeRango, rangoDePreset } from '../domain'

export interface InstantaneaSeguimiento {
  /** Todavía no hubo ninguna respuesta (ni error): es la primera carga. */
  readonly cargando: boolean
  /** Hay una petición en curso. */
  readonly actualizando: boolean
  /** La última actualización falló por falta de red: se sigue mostrando lo último recibido. */
  readonly sinConexion: boolean
  /** Otro fallo (servidor caído, respuesta inesperada). Se sigue mostrando lo último recibido. */
  readonly error: string | null
  /** El servidor respondió 403: este usuario no puede ver el seguimiento. */
  readonly sinPermiso: { readonly mensaje: string } | null
  readonly traslados: readonly TrasladoSeguimiento[]
  /** Traslados que el servidor mandó con datos inválidos y no se muestran. */
  readonly descartados: number
  /** Cuándo llegó la última lista (milisegundos), o `null` si todavía no llegó ninguna. */
  readonly actualizadoEn: number | null
  /** Los días (de Lima) que se están mostrando. Al abrir es «hoy»; cambia con `aplicarRango`. */
  readonly rango: RangoFechas
}

/** El estado de antes de recibir nada, con el rango de «hoy» (el día de Lima dado). */
const inicial = (hoy: string): InstantaneaSeguimiento => ({
  cargando: true,
  actualizando: false,
  sinConexion: false,
  error: null,
  sinPermiso: null,
  traslados: [],
  descartados: 0,
  actualizadoEn: null,
  rango: rangoDePreset('hoy', hoy),
})

const mismoRango = (a: RangoFechas, b: RangoFechas): boolean => a.desde === b.desde && a.hasta === b.hasta

/**
 * La lista de traslados del coordinador. **Solo vive en memoria**: son datos de operación de otras personas y no se
 * guardan en el navegador (sin Dexie). Por eso tampoco hay «lo último guardado» al abrir: la primera carga espera al
 * servidor, y sin red la pantalla lo dice.
 *
 * Un fallo (de red o del servidor) nunca vacía lo que ya se muestra. Los datos son de la persona que inició sesión:
 * si entra otra, o se cierra la sesión, se vacían.
 *
 * **El filtro por fecha** (2026-10-16): al abrir se pide «hoy» (el día de Lima) y `aplicarRango` pide otro rango al servidor.
 * Al cambiar de rango se vacía lo mostrado y se descarta lo que llegue del rango anterior: mostrar los traslados de un día
 * bajo el rótulo de otro sería peor que esperar. «Actualizar» pide de nuevo **el mismo rango**.
 */
export class ListaSeguimiento {
  readonly #api: SeguimientoApi
  readonly #reloj: () => number

  #instantanea: InstantaneaSeguimiento
  readonly #escuchas = new Set<() => void>()
  #generacion = 0
  #actualizacion: Promise<void> | null = null
  #dueno: number | null | undefined = undefined

  constructor(opciones: { api: SeguimientoApi; reloj?: () => number }) {
    this.#api = opciones.api
    this.#reloj = opciones.reloj ?? Date.now
    this.#instantanea = inicial(this.#hoy())
  }

  #hoy(): string {
    return diaDeLima(this.#reloj())
  }

  readonly getSnapshot = (): InstantaneaSeguimiento => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /**
   * Al abrir la pantalla: si lo que hay es de otra persona se vacía, y se pide lo último al servidor. `idUsuario` es el
   * de la sesión (puede ser `null` si el token no lo trae: entonces cualquier dato anterior se descarta por seguridad).
   * Al abrir siempre se vuelve a «hoy»: si lo que quedó era de otro día, se cambia de rango (y se vacía) antes de pedir.
   */
  iniciar(idUsuario: number | null): Promise<void> {
    if (this.#dueno !== undefined && (this.#dueno !== idUsuario || idUsuario === null)) this.vaciar()
    this.#dueno = idUsuario
    const hoy = rangoDePreset('hoy', this.#hoy())
    if (!mismoRango(this.#instantanea.rango, hoy)) this.#fijarRango(hoy)
    return this.actualizar()
  }

  /**
   * El botón «Aplicar» del filtro por fecha: pide ese rango al servidor. Un rango que el servidor rechazaría (futuro, al
   * revés, de más de 90 días) no se pide: devuelve el motivo para decirlo. Con el mismo rango que ya se muestra solo
   * actualiza, sin vaciar nada.
   */
  aplicarRango(rango: RangoFechas): Promise<string | null> {
    const error = errorDeRango(rango.desde, rango.hasta, this.#hoy())
    if (error) return Promise.resolve(error)
    if (!mismoRango(this.#instantanea.rango, rango)) this.#fijarRango(rango)
    return this.actualizar().then(() => null)
  }

  /** Pide la lista al servidor. Una sola petición a la vez. */
  actualizar(): Promise<void> {
    if (this.#actualizacion) return this.#actualizacion
    const actualizacion = this.#pedir().finally(() => {
      if (this.#actualizacion === actualizacion) this.#actualizacion = null
    })
    this.#actualizacion = actualizacion
    return actualizacion
  }

  /**
   * La consulta masiva de VIN. No guarda nada aquí (el resultado vive en la pantalla que lo pidió) y no toca la lista:
   * un fallo —incluido un 403— lo recibe quien consulta, que lo muestra como aviso sin sacar al usuario de la vista.
   */
  consultarVines(vines: readonly string[]): Promise<ResultadosVinesLeidos> {
    return this.#api.consultarVines(vines)
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
    this.#instantanea = inicial(this.#hoy())
    for (const escucha of [...this.#escuchas]) escucha()
  }

  /**
   * Cambia el rango mostrado: vacía la lista, vuelve a «cargando» y deja sin efecto cualquier petición del rango anterior
   * (subir la generación hace que lo que conteste después se descarte).
   */
  #fijarRango(rango: RangoFechas): void {
    this.#generacion++
    this.#actualizacion = null
    this.#publicar({
      rango,
      cargando: true,
      actualizando: false,
      sinConexion: false,
      error: null,
      sinPermiso: null,
      traslados: [],
      descartados: 0,
      actualizadoEn: null,
    })
  }

  async #pedir(): Promise<void> {
    const generacion = this.#generacion
    const { rango } = this.#instantanea
    this.#publicar({ actualizando: true })
    try {
      const { traslados, descartados } = await this.#api.traslados(rango)
      if (generacion !== this.#generacion) return
      this.#publicar({
        cargando: false,
        actualizando: false,
        sinConexion: false,
        error: null,
        sinPermiso: null,
        traslados,
        descartados,
        actualizadoEn: this.#reloj(),
      })
    } catch (error) {
      if (generacion !== this.#generacion) return
      if (error instanceof ApiError && error.status === 403) {
        // Sin permiso no se conserva nada: lo que había era de un rol que ya no puede verlo.
        this.#publicar({ cargando: false, actualizando: false, sinConexion: false, error: null, sinPermiso: { mensaje: error.message }, traslados: [], descartados: 0 })
      } else if (error instanceof ApiError && error.isNetwork) {
        this.#publicar({ cargando: false, actualizando: false, sinConexion: true, error: null })
      } else {
        this.#publicar({
          cargando: false,
          actualizando: false,
          sinConexion: false,
          error: error instanceof ApiError ? error.message : 'No se pudieron traer los traslados.',
        })
      }
    }
  }

  #publicar(cambios: Partial<InstantaneaSeguimiento>): void {
    this.#instantanea = { ...this.#instantanea, ...cambios }
    for (const escucha of [...this.#escuchas]) escucha()
  }
}
