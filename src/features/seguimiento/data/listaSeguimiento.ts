import { ApiError } from '@/core/http/ApiError'
import type { ResultadosVinesLeidos, SeguimientoApi } from '../api/seguimientoApi'
import type { TrasladoSeguimiento } from '../domain'

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
}

const INICIAL: InstantaneaSeguimiento = {
  cargando: true,
  actualizando: false,
  sinConexion: false,
  error: null,
  sinPermiso: null,
  traslados: [],
  descartados: 0,
  actualizadoEn: null,
}

/**
 * La lista de traslados del coordinador. **Solo vive en memoria**: son datos de operación de otras personas y no se
 * guardan en el navegador (sin Dexie). Por eso tampoco hay «lo último guardado» al abrir: la primera carga espera al
 * servidor, y sin red la pantalla lo dice.
 *
 * Un fallo (de red o del servidor) nunca vacía lo que ya se muestra. Los datos son de la persona que inició sesión:
 * si entra otra, o se cierra la sesión, se vacían.
 */
export class ListaSeguimiento {
  readonly #api: SeguimientoApi
  readonly #reloj: () => number

  #instantanea: InstantaneaSeguimiento = INICIAL
  readonly #escuchas = new Set<() => void>()
  #generacion = 0
  #actualizacion: Promise<void> | null = null
  #dueno: number | null | undefined = undefined

  constructor(opciones: { api: SeguimientoApi; reloj?: () => number }) {
    this.#api = opciones.api
    this.#reloj = opciones.reloj ?? Date.now
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
   */
  iniciar(idUsuario: number | null): Promise<void> {
    if (this.#dueno !== undefined && (this.#dueno !== idUsuario || idUsuario === null)) this.vaciar()
    this.#dueno = idUsuario
    return this.actualizar()
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
    this.#instantanea = INICIAL
    for (const escucha of [...this.#escuchas]) escucha()
  }

  async #pedir(): Promise<void> {
    const generacion = this.#generacion
    this.#publicar({ actualizando: true })
    try {
      const { traslados, descartados } = await this.#api.traslados()
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
