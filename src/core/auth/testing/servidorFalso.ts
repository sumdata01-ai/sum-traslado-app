/**
 * Un backend de mentira con la misma mecánica que el real (comprobada contra `:8050` el 2026-10-09):
 *  - un login fallido responde **200** con `success: false`;
 *  - el refresh **rota la cookie** y rechaza con 401 la cookie anterior;
 *  - la respuesta del refresh **no trae el `username`**;
 *  - el logout invalida la cookie;
 *  - el access token es un JWT con `sub` (usuario) y `user_id` (id), como `auth_service.py`.
 * El «navegador» es una cookie compartida entre todas las peticiones, como la de verdad: todas las
 * pestañas que usan este servidor comparten la cookie, y el refresh devuelve al dueño de la cookie.
 */
import { ApiError } from '@/core/http/ApiError'
import type { AlmacenLike } from '../authCookie'
import type { CanalSesion, MensajeSesion } from '../canalSesion'

export const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

const base64Url = (texto: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(texto)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** Un JWT de mentira: cabecera y contenido legibles, y una «firma» que dice qué número de token es. */
export function tokenFalso(contenido: Record<string, unknown>, numero: number): string {
  return `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(contenido))}.firma-${numero}`
}

/** El número de un token emitido por este servidor (la parte de la «firma»). */
export const numeroDeToken = (token: string | null) => (token ? Number(/\.firma-(\d+)$/.exec(token)?.[1]) : null)

/**
 * Un canal entre pestañas en memoria: lo que publica una pestaña lo reciben las demás, nunca ella
 * misma, igual que `BroadcastChannel`. La entrega es asíncrona, como en el navegador.
 */
export function crearBusDePestanas() {
  const pestanas = new Set<{ escuchas: Set<(m: MensajeSesion) => void> }>()
  const publicados: MensajeSesion[] = []
  return {
    publicados,
    canal(): CanalSesion {
      const yo = { escuchas: new Set<(m: MensajeSesion) => void>() }
      pestanas.add(yo)
      return {
        publicar(mensaje) {
          publicados.push(mensaje)
          for (const otra of pestanas) {
            if (otra === yo) continue
            for (const escucha of [...otra.escuchas]) queueMicrotask(() => escucha(mensaje))
          }
        },
        escuchar(escucha) {
          yo.escuchas.add(escucha)
          return () => yo.escuchas.delete(escucha)
        },
      }
    },
  }
}

export class AlmacenMemoria implements AlmacenLike {
  readonly datos = new Map<string, string>()
  lanza = false

  getItem(clave: string): string | null {
    if (this.lanza) throw new DOMException('bloqueado', 'SecurityError')
    return this.datos.get(clave) ?? null
  }
  setItem(clave: string, valor: string): void {
    if (this.lanza) throw new DOMException('bloqueado', 'SecurityError')
    this.datos.set(clave, valor)
  }
  removeItem(clave: string): void {
    if (this.lanza) throw new DOMException('bloqueado', 'SecurityError')
    this.datos.delete(clave)
  }
  /** Todo lo guardado, como un solo texto, para buscar en él. */
  volcado(): string {
    return [...this.datos.entries()].map(([k, v]) => `${k}=${v}`).join('\n')
  }
}

export interface ServidorFalso {
  solicitar: (path: string, init?: RequestInit) => Promise<Response>
  llamadas: { login: number; refresh: number; logout: number }
  /** Sin red: toda petición falla como falla el cliente HTTP real. */
  sinRed: boolean
  /** Fuerza el código de respuesta del refresh (429, 500…). */
  codigoRefresh: number | null
  /** Lo que el servidor dice del usuario; cambiarlo simula que un supervisor le cambió el rol. */
  perfil: { role: string; area: string; apps: string[] }
  /**
   * Las cuentas, por nombre de usuario. Cualquier otro nombre con la clave `buena` también entra:
   * se le da un id nuevo y el nombre `NOMBRE DE <usuario>`.
   */
  usuarios: Map<string, { id: number; nombre: string }>
  /**
   * Milisegundos que tarda en LLEGAR la respuesta del refresh, después de que el servidor ya rotó la
   * cookie. Simula una respuesta que llega tarde, cuando en el navegador ya pasó otra cosa.
   */
  retrasoRespuestaRefresh: number
  /** `false`: el token no trae `sub` (solo `user_id`), para probar qué pasa cuando falta. */
  tokenConUsuario: boolean
  /** La cookie que el navegador mandaría ahora. */
  cookie: () => string | null
  /** Pone una cookie en el navegador (por ejemplo, la que quedó de una visita anterior). */
  ponerCookie: (valor: string | null) => void
  cookieVigente: () => string | null
}

export function crearServidorFalso(): ServidorFalso {
  let version = 0
  let cookieNavegador: string | null = null
  let vigente: string | null = null
  /** De quién es la cookie vigente: el refresh devuelve a esa persona. */
  let duenoVigente: string | null = null

  const cuenta = (username: string) => {
    let datos = servidor.usuarios.get(username)
    if (!datos) {
      datos = { id: 100 + servidor.usuarios.size, nombre: `NOMBRE DE ${username}` }
      servidor.usuarios.set(username, datos)
    }
    return datos
  }
  const emitirToken = (username: string) =>
    tokenFalso({ ...(servidor.tokenConUsuario ? { sub: username } : {}), user_id: cuenta(username).id, role: servidor.perfil.role }, version)

  const servidor: ServidorFalso = {
    llamadas: { login: 0, refresh: 0, logout: 0 },
    sinRed: false,
    codigoRefresh: null,
    perfil: { role: 'operario', area: 'secado', apps: ['traslado'] },
    usuarios: new Map([['usuario.prueba', { id: 7, nombre: 'OPERARIO PRUEBA' }]]),
    retrasoRespuestaRefresh: 0,
    tokenConUsuario: true,
    cookie: () => cookieNavegador,
    ponerCookie: (valor) => {
      cookieNavegador = valor
    },
    cookieVigente: () => vigente,
    solicitar: async (path, init) => {
      if (servidor.sinRed) throw new ApiError('Sin conexión al backend o internet.')
      const perfil = servidor.perfil

      if (path === '/api/login') {
        servidor.llamadas.login++
        const { username, password } = JSON.parse(String(init?.body)) as { username: string; password: string }
        if (password !== 'buena') {
          return json(200, { success: false, message: 'Usuario o contrasena incorrectos', username: null, role: null, allowed_apps: [] })
        }
        const nueva = `cookie-${++version}`
        vigente = nueva
        cookieNavegador = nueva
        duenoVigente = username
        return json(200, {
          success: true,
          message: 'Login exitoso',
          username,
          nombre_completo: cuenta(username).nombre,
          role: perfil.role,
          area: perfil.area,
          allowed_apps: perfil.apps,
          token: emitirToken(username),
        })
      }

      if (path === '/api/refresh') {
        servidor.llamadas.refresh++
        const cookieDeEstaPeticion = cookieNavegador // la que viaja en ESTA petición
        await new Promise((resolver) => setTimeout(resolver, 2)) // el servidor tarda un poco
        if (servidor.codigoRefresh) return json(servidor.codigoRefresh, { detail: 'error forzado' })
        if (!cookieDeEstaPeticion || cookieDeEstaPeticion !== vigente || !duenoVigente) return json(401, { detail: 'Sesion expirada o invalida' })
        const nueva = `cookie-${++version}`
        vigente = nueva
        cookieNavegador = nueva
        const cuerpo = {
          success: true,
          message: 'Sesion renovada',
          nombre_completo: cuenta(duenoVigente).nombre,
          role: perfil.role,
          area: perfil.area,
          allowed_apps: perfil.apps,
          token: emitirToken(duenoVigente),
        }
        if (servidor.retrasoRespuestaRefresh > 0) await new Promise((resolver) => setTimeout(resolver, servidor.retrasoRespuestaRefresh))
        return json(200, cuerpo)
      }

      if (path === '/api/logout') {
        servidor.llamadas.logout++
        vigente = null
        duenoVigente = null
        cookieNavegador = null
        return json(200, { success: true, message: 'Sesion cerrada' })
      }

      return json(404, { detail: 'no existe' })
    },
  }
  return servidor
}
