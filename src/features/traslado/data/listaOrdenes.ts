import { ApiError } from '@/core/http/ApiError'
import type { TrasladoApi } from '../api/trasladoApi'
import {
  type AvanceTraslado,
  type EstadoOrdenLocal,
  type Momento,
  type OrdenCacheada,
  type OpcionCatalogo,
  type OrdenRemota,
  type TomaLocal,
  type TonoOrden,
  aplicarElecciones,
  aplicarTomas,
  calcularAvance,
  derivarEstadoOrden,
  esMia,
  combinarEleccion,
  etiquetaDeOrden,
  faltaPlaca,
  faltaProveedor,
  fallaPermiteTomarSinSenal,
  mezclarCache,
  momentoDeEstadoServidor,
  puedeCapturarSalida,
  puedeSoltarse,
  reconciliarElecciones,
  reconciliarTomas,
  soltarEsSoloLocal,
  tonoDeOrden,
  totalZonas,
} from '../domain'
import type { ConteoFotosPort } from './conteoFotos'
import { type DuenoCachePort, DuenoEnMemoria } from './duenoCache'
import { EleccionesEnMemoria, type EleccionesPort } from './eleccionesStore'
import { MarcaEnMemoria, type MarcaLimpiezaPort } from './marcaLimpieza'
import type { OrdenesCachePort } from './ordenesCache'
import { TomasEnMemoria, type TomasPort } from './tomasStore'

/** Una orden lista para pintar: lo que dice el servidor más cómo va el trabajo en este dispositivo. */
export interface VistaOrden {
  orden: OrdenCacheada
  estadoLocal: EstadoOrdenLocal | null
  fotosTomadas: number
  etiqueta: string
  tono: TonoOrden
  /** Algo que el operario tiene que saber de su toma (por ejemplo, que todavía no se registró). */
  aviso: string | null
  /** Se ofrece «Soltar»: la tomó del pool en este navegador y el auto no salió (O-02). */
  puedeSoltarse: boolean
  /**
   * La placa se elige aquí (O-04): el servidor no la trae. Sigue siendo `true` después de elegirla,
   * para que el operario pueda cambiar de opinión mientras la salida no se confirme.
   */
  placaEditable: boolean
  /** Ídem para el proveedor. */
  proveedorEditable: boolean
  /** Falta elegir la placa (O-04): sin ella no se captura la salida. */
  faltaPlaca: boolean
  /** Falta elegir el proveedor (O-04): no bloquea, es un dato administrativo. */
  faltaProveedor: boolean
  /** Se puede capturar la foto de la salida: ya hay placa (la del servidor o la elegida). */
  puedeCapturar: boolean
  /** Qué fotos toca tomar según el estado del servidor (`pendiente` → salida, `en_transito` → entrega); `null` si ninguna. */
  momento: Momento | null
}

/** Lo que devuelven «Comenzar despacho» y «Soltar»: si salió bien y qué decirle al operario. */
export interface ResultadoAccion {
  ok: boolean
  mensaje: string
  /** Se hizo, pero solo en el teléfono: falta que llegue al servidor (una toma sin señal). */
  pendiente?: boolean
}

const AVISO_TOMA_PENDIENTE = 'Tomada sin señal: se registra cuando haya conexión.'

export interface InstantaneaLista {
  /** Todavía no se leyó la caché: es la primera carga. */
  readonly cargando: boolean
  /** Hay una petición al servidor en curso. */
  readonly actualizando: boolean
  /** La última actualización falló por falta de red: se muestra lo guardado. */
  readonly sinConexion: boolean
  /** Otro fallo (servidor caído, respuesta inesperada). Se sigue mostrando lo guardado. */
  readonly error: string | null
  /** El backend respondió 403: el rol del usuario no puede usar Traslado. */
  readonly sinPermiso: { mensaje: string } | null
  readonly mias: readonly VistaOrden[]
  readonly pool: readonly VistaOrden[]
  readonly avance: AvanceTraslado
  /** Órdenes que el servidor mandó con datos inválidos y no se muestran. */
  readonly descartadas: number
}

export interface OpcionesListaOrdenes {
  api: TrasladoApi
  cache: OrdenesCachePort
  fotos: ConteoFotosPort
  /** Por defecto `Date.now`. */
  ahora?: () => number
  /** Recuerda un borrado de la caché que falló. Por defecto vive solo en memoria. */
  marca?: MarcaLimpiezaPort
  /** De quién es lo guardado (A-03). Por defecto vive solo en memoria. */
  dueno?: DuenoCachePort
  /** Las tomas del pool hechas en este navegador, con su dueño (O-02). Por defecto en memoria. */
  tomas?: TomasPort
  /** La placa y el proveedor que el operario eligió por orden, con su dueño (O-04). Por defecto en memoria. */
  elecciones?: EleccionesPort
}

const VACIA: InstantaneaLista = {
  cargando: true,
  actualizando: false,
  sinConexion: false,
  error: null,
  sinPermiso: null,
  mias: [],
  pool: [],
  avance: { enviados: 0, porEnviar: 0, sinEmpezar: 0 },
  descartadas: 0,
}

/**
 * Las órdenes de la home: lo que hay en la caché del dispositivo, refrescado desde el servidor.
 *
 * - **Se muestra primero lo guardado** y después se pide al servidor, así la pantalla no queda en
 *   blanco con mala señal.
 * - **Sin red no se pierde nada:** un fallo de red deja la caché a la vista y avisa.
 * - **Se mezcla, no se reemplaza a ciegas** (ver `mezclarCache`).
 * - Un 403 se distingue de los demás fallos: es «sin permiso», no «sin conexión».
 * - **Al cerrar la sesión se borra lo guardado**, y si el borrado falla queda una marca: mientras
 *   esté puesta, lo guardado no se muestra (puede ser de otra cuenta) y se reintenta borrarlo.
 * - **Lo guardado tiene dueño (A-03):** se recuerda de quién es, y si la lista se abre con la sesión
 *   de otra persona se trata como una limpieza pendiente.
 * - **Tomar y soltar (O-02).** Las tomas hechas aquí se guardan aparte, con su dueño, y se ponen
 *   encima de la lista. Una toma sin señal queda pendiente y se envía en la siguiente actualización
 *   con conexión; si el servidor responde que otra persona ya la tenía (409), no se reintenta.
 */
export class ListaOrdenes {
  readonly #api: TrasladoApi
  readonly #cache: OrdenesCachePort
  readonly #fotos: ConteoFotosPort
  readonly #ahora: () => number
  readonly #marca: MarcaLimpiezaPort
  readonly #dueno: DuenoCachePort
  readonly #tomas: TomasPort
  readonly #elecciones: EleccionesPort
  /** Una acción a la vez por orden: un doble toque en «Comenzar despacho» es una sola toma. */
  readonly #accionesEnCurso = new Map<number, Promise<ResultadoAccion>>()

  #instantanea: InstantaneaLista = VACIA
  readonly #escuchas = new Set<() => void>()
  #generacion = 0
  #actualizacion: Promise<void> | null = null
  /** Quién tiene la sesión con la que se abrió la lista; es el dueño de lo que se guarde. */
  #usuario: number | null = null
  /**
   * Las órdenes de la última vista **tal como vienen del servidor y de las tomas, sin lo que el operario
   * eligió**. Es el respaldo de `recalcular` cuando no se puede leer la caché. Usar las órdenes ya
   * mostradas (con la placa elegida puesta) haría pasar la elección por un dato del servidor: la placa
   * dejaría de ser editable y el operario no podría cambiar de opinión.
   */
  #ultimaBase: OrdenCacheada[] = []

  constructor(opciones: OpcionesListaOrdenes) {
    this.#api = opciones.api
    this.#cache = opciones.cache
    this.#fotos = opciones.fotos
    this.#ahora = opciones.ahora ?? Date.now
    this.#marca = opciones.marca ?? new MarcaEnMemoria()
    this.#dueno = opciones.dueno ?? new DuenoEnMemoria()
    this.#tomas = opciones.tomas ?? new TomasEnMemoria()
    this.#elecciones = opciones.elecciones ?? new EleccionesEnMemoria()
  }

  readonly getSnapshot = (): InstantaneaLista => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /**
   * Muestra lo guardado y enseguida pide lo último al servidor. `idUsuario` es quien tiene la sesión
   * (A-03): si lo guardado es de otra persona, o no se sabe de quién es, no se muestra y se borra.
   */
  async iniciar(idUsuario: number | null = null): Promise<void> {
    const generacion = ++this.#generacion
    if (idUsuario !== this.#usuario) {
      this.#usuario = idUsuario
      this.#instantanea = VACIA // nada de lo que se veía era de esta persona
      this.#ultimaBase = []
    }
    if (this.#dueno.leer() !== idUsuario) this.#marca.poner()
    this.#publicar({ cargando: true })

    const guardadas = await this.#leerGuardadas()
    if (generacion !== this.#generacion) return
    this.#publicar({ cargando: false, ...(await this.#vistas(guardadas)) })

    await this.actualizar()
  }

  /** Pide al servidor las órdenes. Una sola petición a la vez: si ya hay una en curso, se espera a esa. */
  actualizar(): Promise<void> {
    if (this.#actualizacion) return this.#actualizacion
    const actualizacion = this.#pedir().finally(() => {
      if (this.#actualizacion === actualizacion) this.#actualizacion = null
    })
    this.#actualizacion = actualizacion
    return actualizacion
  }

  /** Vuelve a calcular las etiquetas con las fotos que haya ahora (por ejemplo, al volver del formulario). */
  async recalcular(): Promise<void> {
    const generacion = this.#generacion
    // Con una limpieza pendiente lo guardado no es fiable; tampoco si no se puede leer. En los
    // dos casos se recalcula sobre lo que ya está en pantalla, que vino del servidor.
    const guardadas = this.#marca.activa() ? null : await this.#cache.leer().catch(() => null)
    if (generacion !== this.#generacion) return
    this.#publicar(await this.#vistas(guardadas ?? this.#ultimaBase))
  }

  /**
   * Se cierra la sesión: las órdenes de esta persona no deben verse desde otra cuenta. No toca las
   * fotos. La marca se pone ANTES de borrar: si el borrado falla, o la página se cierra a mitad,
   * queda constancia y lo guardado no se vuelve a mostrar hasta que se borre.
   */
  async vaciar(): Promise<void> {
    this.#generacion++
    this.#actualizacion = null
    this.#marca.poner()
    this.#dueno.fijar(null)
    this.#instantanea = VACIA
    this.#ultimaBase = []
    this.#notificar()
    await this.#borrarCache()
  }

  /**
   * «Comenzar despacho» sobre una orden del pool. `hallada` es una orden que se encontró buscando por VIN
   * y **no está en la lista del teléfono** (por ejemplo, del pool de otro día): se toma igual, usando esa
   * copia. Con conexión queda a nombre del operario; si
   * otra persona se adelantó (409) se dice quién y la lista se refresca. **Sin señal se toma igual**:
   * queda pendiente, guardada en el teléfono, y se envía en la siguiente actualización con conexión.
   */
  tomar(idOrden: number, hallada?: OrdenRemota): Promise<ResultadoAccion> {
    return this.#unaAccionALaVez(idOrden, () => this.#tomar(idOrden, hallada))
  }

  /**
   * Devuelve al pool una orden tomada en este navegador. Si la toma nunca llegó al servidor se
   * cancela en el teléfono, sin red; si no, hace falta conexión (el pool de los demás tiene que
   * enterarse). Las fotos de la orden se borran: quien llama ya pidió confirmación si había.
   */
  soltar(idOrden: number): Promise<ResultadoAccion> {
    return this.#unaAccionALaVez(idOrden, () => this.#soltar(idOrden))
  }

  /**
   * El operario eligió la placa y/o el proveedor de una orden (O-04). Se guarda en el teléfono, con
   * su dueño, y vale aunque no haya señal y aunque pasen días hasta confirmar la salida. Elegir solo
   * uno conserva lo ya elegido del otro.
   */
  async elegir(idOrden: number, cambio: { placa?: OpcionCatalogo; proveedor?: OpcionCatalogo }): Promise<ResultadoAccion> {
    const vista = [...this.#instantanea.mias, ...this.#instantanea.pool].find((v) => v.orden.idOrden === idOrden)
    if (!vista) return { ok: false, mensaje: 'Esa orden ya no está en la lista.' }
    if (vista.orden.estado !== 'pendiente') return { ok: false, mensaje: 'La placa y el proveedor se eligen al salir, no en la entrega.' }
    try {
      const previas = await this.#elecciones.listar(this.#usuario)
      const anterior = previas.find((e) => e.idOrden === idOrden) ?? null
      await this.#elecciones.guardar(combinarEleccion(anterior, { idOrden, idUsuario: this.#usuario, ...cambio }, this.#ahora()))
    } catch {
      return { ok: false, mensaje: 'No se pudo guardar la elección en este teléfono. Intenta de nuevo.' }
    }
    await this.recalcular()
    return { ok: true, mensaje: 'Guardado en este teléfono.' }
  }

  /**
   * Se confirmó (o se descartó) la salida o la entrega de una orden (E4-02): lo que el teléfono guardaba
   * para ella ya cumplió su función. **Si la salida se confirmó, la orden sigue** (ahora en tránsito):
   * solo se borran la toma pendiente, lo elegido y las fotos de la salida. En cualquier otro caso (la
   * entrega confirmada, o un descarte) la orden termina para el operario y se borra todo lo suyo. Después
   * se pide la lista al servidor para que la orden pase a su sitio.
   */
  async alConfirmar(idOrden: number, momento: Momento, resultado: 'confirmada' | 'descartada'): Promise<void> {
    await this.#tomas.quitar(this.#usuario, idOrden).catch(() => undefined)
    await this.#elecciones.quitar(this.#usuario, idOrden).catch(() => undefined)
    const sigue = resultado === 'confirmada' && momento === 'salida'
    await (sigue ? this.#fotos.borrarDeMomento(idOrden, 'salida') : this.#fotos.borrarDeOrden(idOrden)).catch(() => undefined)
    await this.actualizar()
  }

  /** La pantalla se desmontó: lo que llegue después se descarta. La caché y lo mostrado no se tocan. */
  liberar(): void {
    this.#generacion++
    this.#actualizacion = null
  }

  // --- Internos ------------------------------------------------------------------------------

  #unaAccionALaVez(idOrden: number, accion: () => Promise<ResultadoAccion>): Promise<ResultadoAccion> {
    const enCurso = this.#accionesEnCurso.get(idOrden)
    if (enCurso) return enCurso
    const nueva = accion().finally(() => this.#accionesEnCurso.delete(idOrden))
    this.#accionesEnCurso.set(idOrden, nueva)
    return nueva
  }

  async #tomar(idOrden: number, hallada?: OrdenRemota): Promise<ResultadoAccion> {
    const delPool = this.#instantanea.pool.find((v) => v.orden.idOrden === idOrden)?.orden
    // Una orden hallada con dueño no es del pool: no se toma (el servidor tampoco lo permitiría).
    const origen = delPool ?? (hallada && hallada.conductorAsignado === null ? hallada : null)
    if (!origen) return { ok: false, mensaje: 'Esa orden ya no está disponible.' }
    const toma = (estado: TomaLocal['estado']): TomaLocal => ({
      idOrden,
      idUsuario: this.#usuario,
      estado,
      orden: comoRemota(origen),
      tomadaEn: this.#ahora(),
      mensaje: null,
    })

    try {
      await this.#api.tomarOrden(idOrden)
    } catch (error) {
      if (!(error instanceof ApiError)) return { ok: false, mensaje: 'No se pudo tomar la orden.' }
      if (error.status === 409) {
        await this.actualizar() // ya no está en el pool: que desaparezca
        return { ok: false, mensaje: error.message }
      }
      if (error.status === 403) {
        this.#publicar({ sinPermiso: { mensaje: error.message } })
        return { ok: false, mensaje: error.message }
      }
      if (!fallaPermiteTomarSinSenal(error)) return { ok: false, mensaje: error.message }
      try {
        await this.#tomas.guardar(toma('pendiente'))
      } catch {
        return { ok: false, mensaje: 'Sin señal, y no se pudo guardar la toma en este teléfono. Intenta de nuevo.' }
      }
      await this.recalcular()
      return { ok: true, mensaje: AVISO_TOMA_PENDIENTE, pendiente: true }
    }

    // Ya es suya en el servidor. Si el teléfono no logra guardarlo, igual se verá como propia al
    // actualizar (el servidor le pone conductor); solo que no se ofrecerá soltarla desde aquí.
    await this.#tomas.guardar(toma('confirmada')).catch(() => undefined)
    await this.recalcular()
    await this.actualizar()
    return { ok: true, mensaje: 'La orden es tuya.' }
  }

  async #soltar(idOrden: number): Promise<ResultadoAccion> {
    const vista = this.#instantanea.mias.find((v) => v.orden.idOrden === idOrden)
    if (!vista?.puedeSoltarse) return { ok: false, mensaje: 'Esta orden no se puede devolver desde aquí.' }

    if (soltarEsSoloLocal(vista.orden)) {
      await this.#tomas.quitar(this.#usuario, idOrden)
      await this.#elecciones.quitar(this.#usuario, idOrden).catch(() => undefined)
      await this.#fotos.borrarDeOrden(idOrden).catch(() => undefined)
      await this.recalcular()
      return { ok: true, mensaje: 'Toma cancelada: la orden vuelve a estar disponible.' }
    }

    try {
      await this.#api.soltarOrden(idOrden)
    } catch (error) {
      if (!(error instanceof ApiError)) return { ok: false, mensaje: 'No se pudo devolver la orden al pool.' }
      // Sin red no se suelta: los demás no se enterarían y la orden quedaría trabada igual.
      if (error.isNetwork) return { ok: false, mensaje: 'Sin conexión: no se pudo devolver al pool.' }
      if (error.status === 409) {
        await this.actualizar()
        return { ok: false, mensaje: error.message }
      }
      if (error.status === 403) this.#publicar({ sinPermiso: { mensaje: error.message } })
      return { ok: false, mensaje: error.message }
    }

    await this.#tomas.quitar(this.#usuario, idOrden).catch(() => undefined)
    await this.#elecciones.quitar(this.#usuario, idOrden).catch(() => undefined)
    await this.#fotos.borrarDeOrden(idOrden).catch(() => undefined)
    await this.actualizar()
    return { ok: true, mensaje: 'Devuelta al pool.' }
  }

  /**
   * Envía las tomas que quedaron pendientes por falta de señal, una por una y en el orden en que se
   * hicieron. Un 409 (otra persona la tenía) o una orden que ya no existe la marca como perdida y
   * no se reintenta más. Sin red, un 5xx, un 403 o el límite de peticiones cortan el envío: se
   * reintenta en la próxima actualización.
   */
  async #enviarTomasPendientes(generacion: number): Promise<void> {
    const tomas = await this.#tomas.listar(this.#usuario).catch(() => [] as TomaLocal[])
    for (const toma of tomas) {
      if (toma.estado !== 'pendiente') continue
      // Si la sesión cambió, el token ya es de otra persona: tomaría la orden a su nombre.
      if (generacion !== this.#generacion) return
      try {
        await this.#api.tomarOrden(toma.idOrden)
        await this.#tomas.guardar({ ...toma, estado: 'confirmada' }).catch(() => undefined)
      } catch (error) {
        const status = error instanceof ApiError ? error.status : undefined
        const definitivo = status !== undefined && status >= 400 && status < 500 && status !== 403 && status !== 429
        if (!definitivo) return
        await this.#tomas.guardar({ ...toma, estado: 'perdida', mensaje: (error as ApiError).message }).catch(() => undefined)
      }
    }
  }

  async #pedir(): Promise<void> {
    const generacion = this.#generacion
    this.#publicar({ actualizando: true })

    try {
      await this.#enviarTomasPendientes(generacion)
      if (generacion !== this.#generacion) return
      const { ordenes, descartadas } = await this.#api.misOrdenes()
      if (generacion !== this.#generacion) return

      const tomas = await this.#tomas.listar(this.#usuario).catch(() => null)
      const tomasAlDia = tomas ? reconciliarTomas(tomas, ordenes) : null
      if (tomasAlDia) await this.#tomas.reemplazarDe(this.#usuario, tomasAlDia).catch(() => undefined)
      const elecciones = await this.#elecciones.listar(this.#usuario).catch(() => null)
      if (elecciones) {
        const aConservar = new Set((tomasAlDia ?? tomas ?? []).map((t) => t.idOrden))
        await this.#elecciones.reemplazarDe(this.#usuario, reconciliarElecciones(elecciones, ordenes, aConservar)).catch(() => undefined)
      }
      if (generacion !== this.#generacion) return

      const previas = await this.#leerGuardadas()
      // Otra vez: mientras se leía pudo cerrarse la sesión. Sin esta comprobación, `reemplazar`
      // volvía a escribir las órdenes de esta cuenta encima del borrado.
      if (generacion !== this.#generacion) return
      const mezcladas = mezclarCache(previas, ordenes, this.#ahora())
      // La caché pone sus escrituras en fila (ver `OrdenesCacheDexie`): un borrado pedido
      // después de este punto corre después y gana.
      const guardada = await this.#cache.reemplazar(mezcladas).then(
        () => true,
        () => false, // sin disco se muestra igual, solo que no queda guardado
      )
      if (generacion !== this.#generacion) return
      // `reemplazar` borra todo lo anterior, también lo de otra cuenta: la limpieza ya está hecha.
      if (guardada) {
        this.#marca.quitar()
        this.#dueno.fijar(this.#usuario)
      }

      this.#publicar({
        actualizando: false,
        sinConexion: false,
        error: null,
        sinPermiso: null,
        descartadas,
        ...(await this.#vistas(mezcladas)),
      })
    } catch (error) {
      if (generacion !== this.#generacion) return
      const cambios = this.#cambiosPorFallo(error)
      this.#publicar({ actualizando: false, ...cambios })
    }
  }

  /**
   * Lo guardado en el dispositivo. Si hay una limpieza pendiente se reintenta primero y, si sigue
   * sin poderse, no se usa nada: puede ser de otra cuenta. Sin disco se sigue sin caché.
   */
  async #leerGuardadas(): Promise<OrdenCacheada[]> {
    if (this.#marca.activa() && !(await this.#borrarCache())) return []
    return this.#cache.leer().catch(() => [])
  }

  /** `true` si quedó borrada. Un fallo no se oculta: deja la marca puesta. */
  async #borrarCache(): Promise<boolean> {
    try {
      await this.#cache.vaciar()
      this.#marca.quitar()
      return true
    } catch {
      return false
    }
  }

  #cambiosPorFallo(error: unknown): Partial<InstantaneaLista> {
    if (error instanceof ApiError) {
      if (error.status === 403) return { sinPermiso: { mensaje: error.message }, sinConexion: false, error: null }
      if (error.isNetwork) return { sinConexion: true, error: null, sinPermiso: null }
      return { error: error.message, sinConexion: false, sinPermiso: null }
    }
    return { error: 'No se pudieron traer tus traslados.', sinConexion: false, sinPermiso: null }
  }

  async #vistas(guardadas: readonly OrdenCacheada[]): Promise<Pick<InstantaneaLista, 'mias' | 'pool' | 'avance'>> {
    const conteos = await this.#fotos.contar().catch(() => new Map())
    const tomas = await this.#tomas.listar(this.#usuario).catch(() => [] as TomaLocal[])
    const mensajes = new Map(tomas.map((t) => [t.idOrden, t.mensaje]))
    const elecciones = await this.#elecciones.listar(this.#usuario).catch(() => [])
    const delServidor = aplicarTomas(guardadas, tomas, this.#ahora())
    const ordenes = aplicarElecciones(delServidor, elecciones)
    const baseDe = new Map(delServidor.map((o) => [o.idOrden, o]))
    this.#ultimaBase = delServidor
    const vistas = ordenes.map<VistaOrden>((orden) => {
      const momento = momentoDeEstadoServidor(orden.estado)
      const conteo = momento ? conteos.get(orden.idOrden)?.[momento] : undefined
      const fotosTomadas = conteo?.archivo ?? 0
      // Para el resto de estados (realizado, cerrada, cancelada) ya no queda trabajo del conductor que derivar.
      const estadoLocal = momento
        ? derivarEstadoOrden({ totalZonas: totalZonas(momento), zonasConArchivo: fotosTomadas, zonasConStorageKey: conteo?.subidas ?? 0 })
        : null
      // Una toma perdida (409) lo dice en la etiqueta, en rojo: la orden es de otra persona.
      const perdida = orden.tomaSync === 'perdida'
      return {
        orden,
        estadoLocal,
        fotosTomadas,
        etiqueta: perdida
          ? (mensajes.get(orden.idOrden) ?? 'La tomó otra persona')
          : etiquetaDeOrden({ estadoServidor: orden.estado, estadoLocal, fotosTomadas }),
        tono: perdida ? 'danger' : tonoDeOrden({ estadoServidor: orden.estado, estadoLocal }),
        aviso: orden.tomaSync === 'pendiente' ? AVISO_TOMA_PENDIENTE : null,
        puedeSoltarse: puedeSoltarse(orden),
        placaEditable: faltaPlaca(baseDe.get(orden.idOrden) ?? orden),
        proveedorEditable: faltaProveedor(baseDe.get(orden.idOrden) ?? orden),
        faltaPlaca: faltaPlaca(orden),
        faltaProveedor: faltaProveedor(orden),
        puedeCapturar: puedeCapturarSalida(orden),
        momento,
      }
    })

    const mias = vistas.filter((v) => esMia(v.orden))
    // El avance responde «¿cuánto me falta?»: solo cuenta lo propio. Sumar el pool le diría al
    // conductor que tiene pendiente todo lo que el resto todavía no agarró. Una toma perdida ya
    // no es trabajo suyo.
    const avance = calcularAvance(
      mias.filter((v) => v.orden.tomaSync !== 'perdida').map((v) => ({ estadoServidor: v.orden.estado, estadoLocal: v.estadoLocal })),
    )
    return { mias, pool: vistas.filter((v) => !esMia(v.orden)), avance }
  }

  #publicar(cambios: Partial<InstantaneaLista>): void {
    this.#instantanea = { ...this.#instantanea, ...cambios }
    this.#notificar()
  }

  #notificar(): void {
    for (const escucha of [...this.#escuchas]) escucha()
  }
}

/** La orden sin lo que solo existe en este dispositivo: lo que se guarda como copia en una toma. */
function comoRemota(orden: OrdenRemota | OrdenCacheada): OrdenRemota {
  const copia: Partial<OrdenCacheada> = { ...orden }
  delete copia.tomaSync
  delete copia.sincronizadaEn
  return copia as OrdenRemota
}
