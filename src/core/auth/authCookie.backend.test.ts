// @vitest-environment node
/**
 * Pruebas contra el BACKEND REAL, en la base de DESARROLLO (decisión del 2026-10-09).
 *
 * Qué prueban: que la mecánica de sesión funciona con el servidor de verdad (login, refresh que rota
 * la cookie, logout, y el cliente HTTP renovando un token vencido). Qué NO prueban: que el
 * **navegador** acepte la cookie (`SameSite=None` sin `Secure`); eso lo mira `e2e/login.spec.ts`.
 *
 * Se omiten solas si faltan `TRASLADO_USUARIO` / `TRASLADO_CLAVE` (en `.env.local`) o si el backend no
 * responde. Hacen 2 logins por corrida, y el backend admite 10 por minuto.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { createApiClient } from '@/core/http/apiClient'
import { AuthCookie } from './authCookie'
import { AlmacenMemoria } from './testing/servidorFalso'

const BASE = process.env.TRASLADO_BACKEND_URL ?? 'http://localhost:8050'
const USUARIO = process.env.TRASLADO_USUARIO
const CLAVE = process.env.TRASLADO_CLAVE
const NOMBRE_COOKIE = 'sum_refresh_token'

/** Un «navegador» mínimo: guarda la cookie de refresh y solo la manda a rutas bajo /api, como la del backend. */
function crearNavegador() {
  let cookie: string | null = null
  const solicitar = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const cabeceras = new Headers(init.headers)
    if (cookie && path.startsWith('/api')) cabeceras.set('Cookie', `${NOMBRE_COOKIE}=${cookie}`)
    let respuesta: Response
    try {
      respuesta = await fetch(BASE + path, { ...init, headers: cabeceras, signal: AbortSignal.timeout(12_000) })
    } catch {
      throw new ApiError('Sin conexión al backend o internet.')
    }
    for (const encabezado of respuesta.headers.getSetCookie()) {
      const [par, ...atributos] = encabezado.split(';')
      const [nombre, valor] = (par ?? '').split('=')
      if (nombre?.trim() !== NOMBRE_COOKIE) continue
      const caduca = atributos.some((a) => /^\s*max-age=0\s*$/i.test(a)) || !valor
      cookie = caduca ? null : valor ?? null
    }
    return respuesta
  }
  return { solicitar, cookie: () => cookie }
}

const unaSolaVez = <T,>(tarea: () => Promise<T>) => tarea()

// Estado compartido entre las pruebas: son un recorrido de una sola sesión real, en orden.
const navegador = crearNavegador()
const almacen = new AlmacenMemoria()
const auth = new AuthCookie({ solicitar: navegador.solicitar, almacen, candado: unaSolaVez })
let disponible = false
let motivoDeOmision = ''

beforeAll(async () => {
  if (!USUARIO || !CLAVE) {
    motivoDeOmision = 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local'
    return
  }
  try {
    const respuesta = await fetch(`${BASE}/openapi.json`, { signal: AbortSignal.timeout(3_000) })
    disponible = respuesta.ok
    if (!disponible) motivoDeOmision = `el backend respondió ${respuesta.status}`
  } catch {
    motivoDeOmision = `no hay un backend en ${BASE}`
  }
})

/** Una prueba que se omite sola (con el motivo) si no hay backend o credenciales. */
const contraElBackend = (nombre: string, tarea: () => Promise<void>) =>
  it(nombre, async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    await tarea()
  })

describe.sequential('sesión contra el backend real (base de desarrollo)', () => {
  contraElBackend('una contraseña incorrecta se rechaza con el mensaje del servidor y sin cookie', async () => {
    const intruso = new AuthCookie({ solicitar: crearNavegador().solicitar, almacen: new AlmacenMemoria(), candado: unaSolaVez })

    const resultado = await intruso.login(USUARIO!, 'esta-clave-no-es-la-correcta')

    expect(resultado).toMatchObject({ ok: false, motivo: 'credenciales' })
    expect(resultado.ok === false && resultado.mensaje.length).toBeGreaterThan(5)
    expect(intruso.getToken()).toBeNull()
  })

  contraElBackend('AC1: el usuario de prueba inicia sesión: es operario y tiene «traslado»', async () => {
    const resultado = await auth.login(USUARIO!, CLAVE!)
    if (!resultado.ok && resultado.motivo === 'limite') throw new Error('Se alcanzó el límite de logins por minuto: espera un minuto y repite.')

    expect(resultado).toEqual({ ok: true })
    const { estado, sesion } = auth.getSnapshot()
    expect(estado).toBe('activa')
    expect(sesion?.role).toBe('operario')
    expect(sesion?.allowedApps).toContain('traslado')
    expect(auth.getToken()?.length).toBeGreaterThan(20)
    expect(navegador.cookie()).toBeTruthy() // el servidor puso la cookie de refresh
    // Nada sensible en el navegador: ni el token ni la cookie.
    expect(almacen.volcado()).not.toContain(auth.getToken()!)
    expect(almacen.volcado()).not.toContain(navegador.cookie()!)
  })

  contraElBackend('el token sirve de verdad: el cliente HTTP lee las órdenes, y sin token el backend responde 401', async () => {
    const cliente = createApiClient({
      getToken: () => auth.getToken(),
      refreshSession: () => auth.refrescarSesion(),
      limpiarSesion: () => auth.limpiarSesion(),
      fetchImpl: (url, init) => fetch(BASE + String(url), init),
    })

    const { ordenes } = await cliente.getJson<{ ordenes: unknown[] }>('/mobile/traslado/mis-ordenes')
    expect(Array.isArray(ordenes)).toBe(true)

    const sinToken = await fetch(`${BASE}/mobile/traslado/mis-ordenes`)
    expect(sinToken.status).toBe(401)
  })

  contraElBackend('AC4: «recargar» (otra instancia, la misma cookie) restaura la sesión sin pedir credenciales', async () => {
    const recargada = new AuthCookie({ solicitar: navegador.solicitar, almacen, candado: unaSolaVez })
    expect(recargada.getSnapshot().estado).toBe('restaurando')

    await recargada.restaurar()

    expect(recargada.getSnapshot().estado).toBe('activa')
    expect(recargada.getSnapshot().sesion?.usuario).toBe(USUARIO) // el refresh no lo trae: sale de los metadatos
    expect(recargada.getToken()?.length).toBeGreaterThan(20)
  })

  contraElBackend('el refresh rota la cookie y el servidor rechaza la anterior', async () => {
    const antes = navegador.cookie()
    expect(await auth.refrescarSesion()).toBe('ok')
    const despues = navegador.cookie()

    expect(despues).toBeTruthy()
    expect(despues).not.toBe(antes)
    const reutilizada = await fetch(`${BASE}/api/refresh`, { method: 'POST', headers: { Cookie: `${NOMBRE_COOKIE}=${antes}` } })
    expect(reutilizada.status).toBe(401)
  })

  contraElBackend('varios refrescos a la vez comparten una sola llamada: con el servidor real ninguno pierde la sesión', async () => {
    const resultados = await Promise.all([auth.refrescarSesion(), auth.refrescarSesion(), auth.refrescarSesion()])

    expect(resultados).toEqual(['ok', 'ok', 'ok'])
    expect(auth.getSnapshot().estado).toBe('activa')
  })

  contraElBackend('dos pestañas refrescando a la vez con un candado compartido siguen las dos con sesión', async () => {
    let cola: Promise<unknown> = Promise.resolve()
    const candadoCompartido = <T,>(tarea: () => Promise<T>): Promise<T> => {
      const resultado = cola.then(tarea)
      cola = resultado.catch(() => undefined)
      return resultado
    }
    const pestanaA = new AuthCookie({ solicitar: navegador.solicitar, almacen: new AlmacenMemoria(), candado: candadoCompartido })
    const pestanaB = new AuthCookie({ solicitar: navegador.solicitar, almacen: new AlmacenMemoria(), candado: candadoCompartido })

    expect(await Promise.all([pestanaA.refrescarSesion(), pestanaB.refrescarSesion()])).toEqual(['ok', 'ok'])
  })

  contraElBackend('un token vencido o inválido se renueva solo: 401 → refresh real → reintento con el token nuevo', async () => {
    let tokenViciado = true
    let refrescos = 0
    const cliente = createApiClient({
      getToken: () => (tokenViciado ? 'token-que-el-servidor-no-reconoce' : auth.getToken()),
      refreshSession: async () => {
        refrescos++
        tokenViciado = false
        return auth.refrescarSesion()
      },
      limpiarSesion: () => auth.limpiarSesion(),
      fetchImpl: (url, init) => fetch(BASE + String(url), init),
    })

    const { ordenes } = await cliente.getJson<{ ordenes: unknown[] }>('/mobile/traslado/mis-ordenes')

    expect(refrescos).toBe(1)
    expect(Array.isArray(ordenes)).toBe(true)
    expect(auth.getSnapshot().estado).toBe('activa')
  })

  contraElBackend('AC5: cerrar sesión invalida la cookie en el servidor y limpia el navegador', async () => {
    const cookieAntes = navegador.cookie()

    await auth.logout()

    expect(auth.getSnapshot().estado).toBe('sinSesion')
    expect(auth.getToken()).toBeNull()
    expect(almacen.datos.size).toBe(0)
    expect(navegador.cookie()).toBeNull() // el servidor mandó borrar la cookie
    const trasLogout = await fetch(`${BASE}/api/refresh`, { method: 'POST', headers: { Cookie: `${NOMBRE_COOKIE}=${cookieAntes}` } })
    expect(trasLogout.status).toBe(401)

    const otraCarga = new AuthCookie({ solicitar: navegador.solicitar, almacen, candado: unaSolaVez })
    await otraCarga.restaurar()
    expect(otraCarga.getSnapshot().estado).toBe('sinSesion')
  })
})
