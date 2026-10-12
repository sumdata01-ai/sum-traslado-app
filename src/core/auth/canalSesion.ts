/**
 * Avisos de sesión entre las pestañas del mismo navegador: todas comparten la cookie de refresh,
 * pero cada una guarda su token en memoria y no se entera sola de lo que pasa en las otras.
 */
export type MensajeSesion =
  /** Alguien inició sesión en otra pestaña: la cookie ya es de esta persona. */
  | { tipo: 'entro'; idUsuario: number | null; usuario: string | null }
  /** Alguien cerró sesión a propósito en otra pestaña. */
  | { tipo: 'salio' }

export interface CanalSesion {
  /** Avisa a las DEMÁS pestañas; la que publica no recibe su propio mensaje. */
  publicar(mensaje: MensajeSesion): void
  escuchar(escucha: (mensaje: MensajeSesion) => void): () => void
}

const NOMBRE_CANAL = 'sum-traslado:sesion'
/** Clave del respaldo por `localStorage`: el evento `storage` llega a las demás pestañas, no a la propia. */
export const CLAVE_AVISO_SESION = 'sum-traslado:aviso-sesion'

export function esMensajeSesion(valor: unknown): valor is MensajeSesion {
  if (typeof valor !== 'object' || valor === null) return false
  const { tipo } = valor as { tipo?: unknown }
  return tipo === 'entro' || tipo === 'salio'
}

/** Un canal que no avisa a nadie: cada pestaña funciona sola, como antes de A-03. */
export const canalMudo: CanalSesion = {
  publicar: () => undefined,
  escuchar: () => () => undefined,
}

export class CanalBroadcast implements CanalSesion {
  readonly #canal: BroadcastChannel

  constructor(nombre = NOMBRE_CANAL) {
    this.#canal = new BroadcastChannel(nombre)
  }

  publicar(mensaje: MensajeSesion): void {
    this.#canal.postMessage(mensaje)
  }

  escuchar(escucha: (mensaje: MensajeSesion) => void): () => void {
    const alRecibir = (evento: MessageEvent) => {
      if (esMensajeSesion(evento.data)) escucha(evento.data)
    }
    this.#canal.addEventListener('message', alRecibir)
    return () => this.#canal.removeEventListener('message', alRecibir)
  }

  cerrar(): void {
    this.#canal.close()
  }
}

/** Respaldo para navegadores sin `BroadcastChannel` (Safari anterior a 15.4). */
export class CanalStorage implements CanalSesion {
  readonly #almacen: Storage
  readonly #ventana: Window

  constructor(almacen: Storage, ventana: Window) {
    this.#almacen = almacen
    this.#ventana = ventana
  }

  publicar(mensaje: MensajeSesion): void {
    try {
      // El sello hace que dos avisos iguales seguidos cambien el valor: si no cambia, no hay evento.
      this.#almacen.setItem(CLAVE_AVISO_SESION, JSON.stringify({ ...mensaje, sello: `${Date.now()}-${Math.random()}` }))
    } catch {
      // sin almacenamiento no hay respaldo: cada pestaña sigue sola
    }
  }

  escuchar(escucha: (mensaje: MensajeSesion) => void): () => void {
    const alCambiar = (evento: StorageEvent) => {
      if (evento.key !== CLAVE_AVISO_SESION || !evento.newValue) return
      try {
        const datos: unknown = JSON.parse(evento.newValue)
        if (esMensajeSesion(datos)) escucha(datos)
      } catch {
        // un valor que no es un aviso se ignora
      }
    }
    this.#ventana.addEventListener('storage', alCambiar)
    return () => this.#ventana.removeEventListener('storage', alCambiar)
  }
}

/** `BroadcastChannel` si existe; si no, el evento `storage`; si tampoco, ninguno. Nunca lanza. */
export function canalDelNavegador(): CanalSesion {
  try {
    if (typeof BroadcastChannel !== 'undefined') return new CanalBroadcast()
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') return new CanalStorage(localStorage, window)
  } catch {
    // datos del sitio bloqueados u otra rareza del navegador
  }
  return canalMudo
}
