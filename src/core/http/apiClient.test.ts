// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './ApiError'
import { type ResultadoRefresh, SESION_EXPIRADA_EVENT, createApiClient } from './apiClient'

const json = (status: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const authDe = (init?: RequestInit) => new Headers(init?.headers).get('Authorization')

/** Un servidor que acepta solo el token «nuevo» y responde 401 con cualquier otro. */
const servidorQueExigeTokenNuevo = () =>
  vi.fn<typeof fetch>(async (_url, init) => (authDe(init) === 'Bearer nuevo' ? json(200, { ok: true }) : json(401)))

const siempre = (status: number, cuerpo?: unknown) => vi.fn<typeof fetch>(async () => json(status, cuerpo))

function montar(opciones: {
  fetchImpl: typeof fetch
  token?: string | null
  refresh?: () => Promise<ResultadoRefresh>
  timeoutMs?: number
}) {
  let token: string | null = opciones.token === undefined ? 'viejo' : opciones.token
  const eventos = new EventTarget()
  let sesionesExpiradas = 0
  eventos.addEventListener(SESION_EXPIRADA_EVENT, () => sesionesExpiradas++)

  const limpiarSesion = vi.fn(() => {
    token = null
  })
  const refreshSession = vi.fn(
    opciones.refresh ??
      (async () => {
        token = 'nuevo'
        return 'ok' as const
      }),
  )
  const client = createApiClient({
    getToken: () => token,
    refreshSession,
    limpiarSesion,
    fetchImpl: opciones.fetchImpl,
    eventTarget: eventos,
    timeoutMs: opciones.timeoutMs,
  })
  return { client, refreshSession, limpiarSesion, eventosEmitidos: () => sesionesExpiradas }
}

afterEach(() => vi.useRealTimers())

describe('401: renovar y reintentar (AC1)', () => {
  it('renueva la sesión una vez y reintenta una vez con el token nuevo', async () => {
    const fetchImpl = servidorQueExigeTokenNuevo()
    const { client, refreshSession } = montar({ fetchImpl })

    const respuesta = await client.request('/mobile/traslado/mis-ordenes')

    expect(respuesta.status).toBe(200)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls.map(([, init]) => authDe(init))).toEqual(['Bearer viejo', 'Bearer nuevo'])
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/mis-ordenes') // ruta relativa
  })
})

describe('refresh compartido (AC2)', () => {
  it('cinco llamadas que reciben 401 a la vez comparten un solo refresh', async () => {
    const fetchImpl = servidorQueExigeTokenNuevo()
    let token: string | null = 'viejo'
    const refreshSession = vi.fn(async (): Promise<ResultadoRefresh> => {
      await new Promise((r) => setTimeout(r, 5)) // da tiempo a que las cinco lleguen
      token = 'nuevo'
      return 'ok'
    })
    const client = createApiClient({ getToken: () => token, refreshSession, limpiarSesion: vi.fn(), fetchImpl })

    const resultados = await Promise.all(Array.from({ length: 5 }, () => client.getJson<{ ok: boolean }>('/mobile/x')))

    expect(resultados).toEqual(Array.from({ length: 5 }, () => ({ ok: true })))
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(10) // 5 intentos fallidos + 5 reintentos
  })
})

describe('sesión vencida (AC3)', () => {
  it('si el refresh dice «expirada», limpia y emite el evento una sola vez aunque fallen cinco llamadas', async () => {
    const fetchImpl = siempre(401)
    const { client, limpiarSesion, eventosEmitidos } = montar({
      fetchImpl,
      refresh: async () => {
        await new Promise((r) => setTimeout(r, 5))
        return 'expirada'
      },
    })

    const resultados = await Promise.allSettled(Array.from({ length: 5 }, () => client.request('/mobile/x')))

    for (const r of resultados) {
      expect(r.status).toBe('rejected')
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ApiError)
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 401 })
    }
    expect(limpiarSesion).toHaveBeenCalledTimes(1)
    expect(eventosEmitidos()).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(5) // sin reintento: no había sesión que renovar
  })

  it('si el reintento vuelve a dar 401, expira la sesión y no entra en bucle', async () => {
    const fetchImpl = siempre(401)
    const { client, refreshSession, limpiarSesion, eventosEmitidos } = montar({ fetchImpl })

    await expect(client.request('/mobile/x')).rejects.toMatchObject({ status: 401 })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(limpiarSesion).toHaveBeenCalledTimes(1)
    expect(eventosEmitidos()).toBe(1)
  })

  it('sin red al renovar NO cierra la sesión: el operario conserva su trabajo', async () => {
    const { client, limpiarSesion, eventosEmitidos } = montar({
      fetchImpl: siempre(401),
      refresh: async () => 'sin_conexion',
    })

    const error = await client.request('/mobile/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isNetwork).toBe(true)
    expect(limpiarSesion).not.toHaveBeenCalled()
    expect(eventosEmitidos()).toBe(0)
  })

  it('si la renovación lanza una excepción, se trata como falta de red y no cierra la sesión', async () => {
    const { client, limpiarSesion } = montar({
      fetchImpl: siempre(401),
      refresh: async () => {
        throw new Error('boom')
      },
    })

    await expect(client.request('/mobile/x')).rejects.toMatchObject({ status: undefined })
    expect(limpiarSesion).not.toHaveBeenCalled()
  })
})

describe('403 (AC4)', () => {
  it('por defecto cierra la sesión: es «permiso revocado»', async () => {
    const { client, limpiarSesion, eventosEmitidos, refreshSession } = montar({ fetchImpl: siempre(403) })

    const error = await client.request('/mobile/x').catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 403, message: 'Tu permiso ha sido revocado. Contacta al supervisor.' })
    expect(limpiarSesion).toHaveBeenCalledTimes(1)
    expect(eventosEmitidos()).toBe(1)
    expect(refreshSession).not.toHaveBeenCalled() // un 403 no se arregla renovando el token
  })

  it('con cerrarSesionEn403: false devuelve la respuesta tal cual y no cierra la sesión', async () => {
    const { client, limpiarSesion, eventosEmitidos } = montar({ fetchImpl: siempre(403, { detail: 'otra cosa' }) })

    const respuesta = await client.request('/mobile/x', {}, { cerrarSesionEn403: false })

    expect(respuesta.status).toBe(403)
    expect(limpiarSesion).not.toHaveBeenCalled()
    expect(eventosEmitidos()).toBe(0)
  })
})

describe('tiempo de espera y red caída (AC5)', () => {
  it('si el servidor no responde en 12 s, lanza «Sin conexión» reintentable', async () => {
    vi.useFakeTimers()
    const colgado = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_ok, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(new DOMException('Tiempo agotado', 'AbortError')))
        }),
    )
    const { client } = montar({ fetchImpl: colgado })

    let terminado = false
    const resultado = client
      .request('/mobile/x')
      .catch((e: unknown) => e)
      .finally(() => {
        terminado = true
      })

    await vi.advanceTimersByTimeAsync(11_999)
    expect(terminado).toBe(false) // todavía esperando
    await vi.advanceTimersByTimeAsync(1)
    const error = await resultado

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: undefined, message: 'Sin conexión al backend o internet.' })
    expect((error as ApiError).isRetryable).toBe(true)
  })

  it('una red caída (TypeError de fetch) se convierte en el mismo error', async () => {
    const caida = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { client } = montar({ fetchImpl: caida })

    const error = await client.request('/mobile/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isNetwork).toBe(true)
  })
})

describe('el token solo viaja a donde corresponde (AC6)', () => {
  it('una URL absoluta (la firmada de GCS) no lleva Authorization ni dispara refresh', async () => {
    const fetchImpl = siempre(401)
    const { client, refreshSession } = montar({ fetchImpl })

    const respuesta = await client.request('https://storage.googleapis.com/bucket/foto.jpg?X-Goog-Signature=abc', {
      method: 'PUT',
    })

    expect(respuesta.status).toBe(401) // se devuelve tal cual
    expect(authDe(fetchImpl.mock.calls[0]?.[1])).toBeNull()
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('los endpoints de sesión no llevan token y su 401 no dispara refresh', async () => {
    const fetchImpl = siempre(401, { detail: 'Credenciales inválidas' })
    const { client, refreshSession, limpiarSesion } = montar({ fetchImpl })

    const respuesta = await client.request('/api/login', { method: 'POST' })

    expect(respuesta.status).toBe(401)
    expect(authDe(fetchImpl.mock.calls[0]?.[1])).toBeNull()
    expect(refreshSession).not.toHaveBeenCalled()
    expect(limpiarSesion).not.toHaveBeenCalled()
  })

  it('una ruta del API lleva el token y, sin sesión, no lleva cabecera', async () => {
    const conSesion = siempre(200, {})
    await montar({ fetchImpl: conSesion }).client.request('/mobile/x')
    expect(authDe(conSesion.mock.calls[0]?.[1])).toBe('Bearer viejo')

    const sinSesion = siempre(200, {})
    await montar({ fetchImpl: sinSesion, token: null }).client.request('/mobile/x')
    expect(authDe(sinSesion.mock.calls[0]?.[1])).toBeNull()
  })
})

describe('lectura de JSON y mensajes de error', () => {
  it('un error de negocio usa el mensaje del servidor y conserva el código', async () => {
    const { client } = montar({ fetchImpl: siempre(409, { detail: 'La tomó Ana Pérez' }) })

    const error = await client.postJson('/mobile/traslado/812/tomar').catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 409, message: 'La tomó Ana Pérez' })
    expect((error as ApiError).isConflict).toBe(true)
    expect((error as ApiError).isRetryable).toBe(false)
  })

  it('un 422 de FastAPI (lista de errores) se resume en una frase', async () => {
    const detail = [{ loc: ['query', 'q'], msg: 'String should have at least 4 characters', type: 'string_too_short' }]
    const { client } = montar({ fetchImpl: siempre(422, { detail }) })

    await expect(client.getJson('/mobile/traslado/buscar')).rejects.toMatchObject({
      status: 422,
      message: 'String should have at least 4 characters',
    })
  })

  it('un 429 usa el mensaje de demasiados intentos', async () => {
    const { client } = montar({ fetchImpl: siempre(429) })
    await expect(client.getJson('/mobile/x')).rejects.toMatchObject({
      status: 429,
      message: 'Demasiados intentos. Intenta en unos momentos.',
    })
  })

  it('si el cuerpo no es JSON, usa el mensaje de respaldo de la llamada', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<html>Bad gateway</html>', { status: 502 }))
    const { client } = montar({ fetchImpl })

    const error = await client.getJson('/mobile/x', { fallbackError: 'No se pudo cargar.' }).catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 502, message: 'No se pudo cargar.' })
    expect((error as ApiError).isRetryable).toBe(true)
  })

  it('codifica la consulta en la URL', async () => {
    const fetchImpl = siempre(200, { candidatos: [] })
    await montar({ fetchImpl }).client.getJson('/mobile/traslado/buscar', { query: { q: 'ABC 1' } })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/buscar?q=ABC+1')
  })

  it('postJson manda el cuerpo como JSON, y sin cuerpo no declara tipo', async () => {
    const fetchImpl = siempre(200, { tomada: true })
    const { client } = montar({ fetchImpl })

    await client.postJson('/mobile/traslado/812/confirmar-salida', { fotos: [], id_placa: null })
    const [, conCuerpo] = fetchImpl.mock.calls[0] ?? []
    expect(conCuerpo?.method).toBe('POST')
    expect(conCuerpo?.body).toBe('{"fotos":[],"id_placa":null}')
    expect(new Headers(conCuerpo?.headers).get('Content-Type')).toBe('application/json')

    await client.postJson('/mobile/traslado/812/tomar')
    const [, sinCuerpo] = fetchImpl.mock.calls[1] ?? []
    expect(sinCuerpo?.body).toBeUndefined()
    expect(new Headers(sinCuerpo?.headers).get('Content-Type')).toBeNull()
  })
})

describe('ApiError', () => {
  it.each([
    [undefined, true],
    [408, true],
    [500, true],
    [502, true],
    [503, true],
    [504, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [409, false],
    [422, false],
    [429, false],
  ])('el estado %s es reintentable: %s', (status, esperado) => {
    expect(new ApiError('x', { status }).isRetryable).toBe(esperado)
  })
})
