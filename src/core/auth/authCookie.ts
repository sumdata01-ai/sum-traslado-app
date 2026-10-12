import { ApiError } from '@/core/http/ApiError'
import type { ResultadoRefresh } from '@/core/http/apiClient'
import type { AuthPort, InstantaneaSesion, ResultadoLogin, Sesion } from './AuthPort'
import { type CanalSesion, type MensajeSesion, canalMudo } from './canalSesion'
import { identidadDelToken } from './identidadToken'

/** Los únicos datos que se guardan en el navegador: quién es y qué puede hacer. Nunca un token. */
const CLAVE_SESION = 'sum-traslado:sesion'
/** El logout no llegó al servidor: la cookie HttpOnly sigue viva y no se debe restaurar sola. */
const CLAVE_LOGOUT_PENDIENTE = 'sum-traslado:logout-pendiente'
const NOMBRE_CANDADO = 'sum-traslado:refresh'

const MENSAJE_LIMITE = 'Demasiados intentos. Intenta en unos momentos.'
const MENSAJE_SERVIDOR = 'No se pudo iniciar sesión. Intenta de nuevo.'
const MENSAJE_CAMPOS = 'Escribe tu usuario y contraseña.'
const MENSAJE_SIN_RED = 'Sin conexión con el servidor.'

export interface AlmacenLike {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
  removeItem(clave: string): void
}

export interface OpcionesAuthCookie {
  /** Hace la petición al API (el cliente HTTP, que pone el tiempo límite y traduce la red caída). */
  solicitar: (path: string, init?: RequestInit) => Promise<Response>
  /** Por defecto `localStorage`. Si no está disponible (modo privado) la sesión vive solo en memoria. */
  almacen?: AlmacenLike
  /**
   * Serializa los refrescos entre pestañas. Por defecto usa Web Locks si existen. Hace falta porque
   * el refresh **rota la cookie**: dos pestañas refrescando a la vez con la misma cookie harían que
   * el servidor rechace la segunda y cierre su sesión.
   */
  candado?: <T>(tarea: () => Promise<T>) => Promise<T>
  /**
   * Avisos entre las pestañas del navegador (A-03). La aplicación pasa `canalDelNavegador()`
   * (`BroadcastChannel`, con el evento `storage` de respaldo) en `composicion.ts`. Por defecto
   * ninguno, cada pestaña sola: así una instancia de prueba no habla con las de otras pruebas por un
   * canal real del entorno.
   */
  canal?: CanalSesion
}

interface CuerpoSesion {
  success?: unknown
  message?: unknown
  username?: unknown
  nombre_completo?: unknown
  role?: unknown
  area?: unknown
  allowed_apps?: unknown
  token?: unknown
}

const esTexto = (valor: unknown): valor is string => typeof valor === 'string' && valor.length > 0

async function leerCuerpo(respuesta: Response): Promise<CuerpoSesion & { detail?: unknown }> {
  try {
    const cuerpo: unknown = await respuesta.json()
    return typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  } catch {
    return {}
  }
}

/**
 * La sesión que describe una respuesta de login o de refresh. El usuario y su id salen del token;
 * `usuarioDeRespaldo` solo se usa si ni la respuesta ni el token lo traen.
 */
function aSesion(cuerpo: CuerpoSesion, token: string, usuarioDeRespaldo: string | null): Sesion | null {
  if (!esTexto(cuerpo.role)) return null
  const identidad = identidadDelToken(token)
  return {
    idUsuario: identidad.idUsuario,
    usuario: esTexto(cuerpo.username) ? cuerpo.username : (identidad.usuario ?? usuarioDeRespaldo),
    nombre: esTexto(cuerpo.nombre_completo) ? cuerpo.nombre_completo : null,
    role: cuerpo.role,
    area: esTexto(cuerpo.area) ? cuerpo.area : null,
    allowedApps: Array.isArray(cuerpo.allowed_apps) ? cuerpo.allowed_apps.filter(esTexto) : [],
  }
}

function candadoDelNavegador<T>(tarea: () => Promise<T>): Promise<T> {
  const candados = typeof navigator === 'undefined' ? undefined : navigator.locks
  return candados ? candados.request(NOMBRE_CANDADO, tarea) : tarea()
}

function almacenPorDefecto(): AlmacenLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined // acceder a localStorage puede lanzar con los datos del sitio bloqueados
  }
}

/**
 * Autenticación con cookie de refresh (decisión D1 = opción A, `/api/login`, `/api/refresh`,
 * `/api/logout`).
 *
 * - **El access token vive solo en memoria.** En el navegador solo se guardan metadatos no
 *   sensibles (quién es, rol, área, apps permitidas).
 * - **Un solo refresco a la vez**, y serializado entre pestañas: el refresh rota la cookie y el
 *   servidor rechaza reutilizar la anterior.
 * - **Sin red no se cierra la sesión:** un refresco que falla por red, por límite de peticiones o
 *   por un error del servidor deja la sesión como está. Solo un 401 la termina.
 * - **Un logout que no llegó al servidor se recuerda** y se reintenta al abrir, para no volver a
 *   entrar solo con una cookie que el JavaScript no puede borrar.
 * - **Una sola sesión en todas las pestañas (A-03).** La cookie es una por navegador, pero el token
 *   vive en la memoria de cada pestaña. Un login o un logout se anuncia a las demás: con un login,
 *   la otra pestaña tira su token y pasa sola al nuevo usuario; con un logout, va al login. Una
 *   sesión que expira (401) no se anuncia: cada pestaña lo descubre al usarla.
 */
export class AuthCookie implements AuthPort {
  readonly #solicitar: (path: string, init?: RequestInit) => Promise<Response>
  readonly #almacen: AlmacenLike | undefined
  readonly #candado: <T>(tarea: () => Promise<T>) => Promise<T>
  readonly #canal: CanalSesion
  readonly #dejarDeEscuchar: () => void

  #token: string | null = null
  #instantanea: InstantaneaSesion = { estado: 'restaurando', sesion: null }
  readonly #escuchas = new Set<() => void>()

  #loginEnCurso: Promise<ResultadoLogin> | null = null
  #restauracion: Promise<void> | null = null
  #refresco: Promise<ResultadoRefresh> | null = null
  /**
   * Cambia cada vez que la sesión de esta pestaña cambia de dueño (login, logout, aviso de otra
   * pestaña). Un refresh que empezó en una época anterior trae un token que ya no corresponde y se
   * descarta, en vez de pisar la sesión nueva.
   */
  #epoca = 0

  constructor(opciones: OpcionesAuthCookie) {
    this.#solicitar = opciones.solicitar
    this.#almacen = opciones.almacen ?? almacenPorDefecto()
    this.#candado = opciones.candado ?? candadoDelNavegador
    this.#canal = opciones.canal ?? canalMudo
    this.#dejarDeEscuchar = this.#canal.escuchar((mensaje) => this.#alRecibir(mensaje))
  }

  /** Deja de escuchar a las demás pestañas (al descartar esta instancia, por ejemplo en las pruebas). */
  cerrar(): void {
    this.#dejarDeEscuchar()
  }

  readonly getSnapshot = (): InstantaneaSesion => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  getToken(): string | null {
    return this.#token
  }

  // --- Login ---------------------------------------------------------------------------------

  login(usuario: string, clave: string): Promise<ResultadoLogin> {
    // Una segunda pulsación mientras la primera sigue en curso no manda otra petición: el login
    // tiene un límite de 10 por minuto.
    if (this.#loginEnCurso) return this.#loginEnCurso
    const nombre = usuario.trim()
    if (!nombre || !clave) return Promise.resolve({ ok: false, motivo: 'credenciales', mensaje: MENSAJE_CAMPOS })

    const intento = this.#hacerLogin(nombre, clave).finally(() => {
      this.#loginEnCurso = null
    })
    this.#loginEnCurso = intento
    return intento
  }

  async #hacerLogin(usuario: string, clave: string): Promise<ResultadoLogin> {
    let respuesta: Response
    try {
      respuesta = await this.#solicitar('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usuario, password: clave }),
        credentials: 'include',
      })
    } catch (error) {
      return { ok: false, motivo: 'red', mensaje: error instanceof ApiError ? error.message : MENSAJE_SIN_RED }
    }

    if (respuesta.status === 429) return { ok: false, motivo: 'limite', mensaje: MENSAJE_LIMITE }
    const cuerpo = await leerCuerpo(respuesta)
    if (!respuesta.ok) {
      return { ok: false, motivo: 'servidor', mensaje: esTexto(cuerpo.detail) ? cuerpo.detail : MENSAJE_SERVIDOR }
    }

    // Un login fallido responde 200 con `success: false` (y el mismo mensaje para una contraseña mala
    // que para un usuario inexistente).
    if (cuerpo.success !== true) {
      return { ok: false, motivo: 'credenciales', mensaje: esTexto(cuerpo.message) ? cuerpo.message : 'Usuario o contraseña incorrectos.' }
    }
    if (!esTexto(cuerpo.token)) return { ok: false, motivo: 'servidor', mensaje: MENSAJE_SERVIDOR }
    const sesion = aSesion(cuerpo, cuerpo.token, usuario)
    if (!sesion) return { ok: false, motivo: 'servidor', mensaje: MENSAJE_SERVIDOR }

    this.#nuevaEpoca() // un refresh que estuviera en curso traería la sesión de antes
    this.#token = cuerpo.token
    this.#guardarMetadatos(sesion)
    this.#borrarLogoutPendiente()
    this.#fijar('activa', sesion)
    this.#canal.publicar({ tipo: 'entro', idUsuario: sesion.idUsuario, usuario: sesion.usuario })
    return { ok: true }
  }

  // --- Restaurar al abrir -----------------------------------------------------------------------

  restaurar(): Promise<void> {
    // El modo estricto de React monta dos veces: dos restauraciones simultáneas serían dos refrescos
    // con la misma cookie, y el segundo cerraría la sesión.
    if (this.#restauracion) return this.#restauracion
    const restauracion = this.#hacerRestaurar().finally(() => {
      this.#restauracion = null
    })
    this.#restauracion = restauracion
    return restauracion
  }

  async #hacerRestaurar(): Promise<void> {
    const metadatos = this.#leerMetadatos()
    this.#fijar('restaurando', null)

    if (this.#hayLogoutPendiente()) {
      await this.#cerrarEnElServidor()
      this.limpiarSesion()
      return
    }

    const epoca = this.#epoca
    const resultado = await this.refrescarSesion()
    // Otra pestaña entró o salió mientras tanto: el aviso ya decidió el estado de esta.
    if (epoca !== this.#epoca || resultado === 'ok') return
    if (resultado === 'expirada') {
      this.limpiarSesion()
      return
    }
    // Sin red: si se sabe quién es, se le deja ver que hay un problema de conexión en vez de un login.
    if (metadatos) this.#fijar('sinConexion', metadatos)
    else this.#fijar('sinSesion', null)
  }

  // --- Refresh ---------------------------------------------------------------------------------

  refrescarSesion(): Promise<ResultadoRefresh> {
    if (this.#refresco) return this.#refresco
    const epoca = this.#epoca
    const refresco = this.#candado(() => this.#llamarRefresh(epoca)).finally(() => {
      if (this.#refresco === refresco) this.#refresco = null
    })
    this.#refresco = refresco
    return refresco
  }

  async #llamarRefresh(epoca: number): Promise<ResultadoRefresh> {
    let respuesta: Response
    try {
      respuesta = await this.#solicitar('/api/refresh', { method: 'POST', credentials: 'include' })
    } catch {
      return 'sin_conexion'
    }

    // La sesión de esta pestaña cambió mientras se esperaba (otra pestaña entró o salió, o aquí se
    // inició o cerró sesión): esta respuesta ya no le corresponde. No se aplica ni da la sesión por
    // terminada; quien la pidió la ve como una falta de red y su resultado se descarta.
    if (epoca !== this.#epoca) return 'sin_conexion'

    if (respuesta.status === 401) return 'expirada'
    // 429, 5xx y demás: un problema del servidor o del límite de peticiones no termina la sesión.
    if (!respuesta.ok) return 'sin_conexion'

    const cuerpo = await leerCuerpo(respuesta)
    if (epoca !== this.#epoca) return 'sin_conexion'
    if (cuerpo.success !== true || !esTexto(cuerpo.token)) return 'expirada'

    // La respuesta del refresh no trae el `username`; el token sí. El de la sesión anterior solo se
    // hereda si el token tampoco lo trae y es la misma persona (o no se sabe quién es).
    const conocida = this.#instantanea.sesion ?? this.#leerMetadatos()
    const identidad = identidadDelToken(cuerpo.token)
    const mismaPersona = identidad.idUsuario === null || identidad.idUsuario === conocida?.idUsuario
    const sesion = aSesion(cuerpo, cuerpo.token, mismaPersona ? (conocida?.usuario ?? null) : null)
    if (!sesion) return 'sin_conexion'

    // Si el token es de otra persona (la cookie cambió de dueño en otra pestaña sin que llegara el
    // aviso), la sesión se reemplaza entera: quien escuche ve un `idUsuario` distinto y descarta lo
    // de la anterior.
    this.#token = cuerpo.token
    this.#guardarMetadatos(sesion) // el rol o las apps pueden haber cambiado desde el último refresh
    this.#fijar('activa', sesion)
    return 'ok'
  }

  // --- Logout y limpieza -------------------------------------------------------------------------

  async logout(): Promise<void> {
    await this.#cerrarEnElServidor()
    this.limpiarSesion()
    // Las demás pestañas también salen, aunque el logout no haya llegado al servidor: la marca de
    // logout pendiente está en el almacenamiento compartido y ninguna se restaurará sola.
    this.#canal.publicar({ tipo: 'salio' })
  }

  limpiarSesion(): void {
    this.#nuevaEpoca()
    this.#token = null
    this.#borrarMetadatos()
    this.#fijar('sinSesion', null)
  }

  // --- Avisos de otras pestañas ------------------------------------------------------------------

  #alRecibir(mensaje: MensajeSesion): void {
    if (mensaje.tipo === 'salio') {
      // La otra pestaña ya borró los metadatos compartidos y avisó al servidor: aquí basta con soltar
      // el token, sin volver a llamar al servidor.
      this.#nuevaEpoca()
      this.#token = null
      this.#fijar('sinSesion', null)
      return
    }

    const { estado, sesion } = this.#instantanea
    const mismaPersona = estado === 'activa' && mensaje.idUsuario !== null && sesion?.idUsuario === mensaje.idUsuario
    if (mismaPersona) return // el token de esta pestaña sigue siendo de quien entró

    // Entró otra persona (o esta pestaña estaba sin sesión): se suelta el token y se toma la sesión
    // nueva con la cookie, que ya es suya. Mientras tanto se muestra «Comprobando tu sesión…», nunca
    // lo que había de la anterior.
    this.#nuevaEpoca()
    this.#token = null
    this.#fijar('restaurando', null)
    void this.#adoptarSesionDeOtraPestana()
  }

  async #adoptarSesionDeOtraPestana(): Promise<void> {
    const epoca = this.#epoca
    const resultado = await this.refrescarSesion()
    if (epoca !== this.#epoca || resultado === 'ok') return
    if (resultado === 'expirada') {
      this.limpiarSesion()
      return
    }
    // Sin red: se sabe quién entró (la otra pestaña lo guardó) pero no se pudo obtener su token.
    const metadatos = this.#leerMetadatos()
    if (metadatos) this.#fijar('sinConexion', metadatos)
    else this.#fijar('sinSesion', null)
  }

  #nuevaEpoca(): void {
    this.#epoca++
    this.#refresco = null // el siguiente refresh es uno nuevo; el que estaba en curso se descarta solo
  }

  /** Avisa al servidor. Si no llega, deja constancia: la cookie HttpOnly no se puede borrar desde aquí. */
  async #cerrarEnElServidor(): Promise<void> {
    // Que el servidor conteste (aunque sea con un 4xx) basta: la cookie ya no sirve. Un 5xx o la red caída, no.
    const llego = await this.#solicitar('/api/logout', { method: 'POST', credentials: 'include' }).then(
      (respuesta) => respuesta.status < 500,
      () => false,
    )
    if (llego) this.#borrarLogoutPendiente()
    else this.#escribir(CLAVE_LOGOUT_PENDIENTE, '1')
  }

  // --- Estado y almacenamiento -------------------------------------------------------------------

  #fijar(estado: InstantaneaSesion['estado'], sesion: Sesion | null): void {
    const actual = this.#instantanea
    if (actual.estado === estado && actual.sesion === null && sesion === null) return
    this.#instantanea = { estado, sesion }
    for (const escucha of [...this.#escuchas]) escucha()
  }

  #escribir(clave: string, valor: string): void {
    try {
      this.#almacen?.setItem(clave, valor)
    } catch {
      // Sin almacenamiento la sesión vive solo en memoria: no es un error.
    }
  }

  #quitar(clave: string): void {
    try {
      this.#almacen?.removeItem(clave)
    } catch {
      // ídem
    }
  }

  #guardarMetadatos(sesion: Sesion): void {
    this.#escribir(CLAVE_SESION, JSON.stringify(sesion))
  }

  #borrarMetadatos(): void {
    this.#quitar(CLAVE_SESION)
  }

  #hayLogoutPendiente(): boolean {
    try {
      return this.#almacen?.getItem(CLAVE_LOGOUT_PENDIENTE) === '1'
    } catch {
      return false
    }
  }

  #borrarLogoutPendiente(): void {
    this.#quitar(CLAVE_LOGOUT_PENDIENTE)
  }

  #leerMetadatos(): Sesion | null {
    try {
      const crudo = this.#almacen?.getItem(CLAVE_SESION)
      if (!crudo) return null
      const datos: unknown = JSON.parse(crudo)
      if (typeof datos !== 'object' || datos === null) throw new Error('metadatos inválidos')
      const { idUsuario, usuario, nombre, role, area, allowedApps } = datos as Record<string, unknown>
      if (!esTexto(role) || !Array.isArray(allowedApps)) throw new Error('metadatos inválidos')
      return {
        idUsuario: typeof idUsuario === 'number' && Number.isInteger(idUsuario) ? idUsuario : null,
        usuario: esTexto(usuario) ? usuario : null,
        nombre: esTexto(nombre) ? nombre : null,
        role,
        area: esTexto(area) ? area : null,
        allowedApps: allowedApps.filter(esTexto),
      }
    } catch {
      this.#borrarMetadatos() // datos corruptos: se descartan
      return null
    }
  }
}
