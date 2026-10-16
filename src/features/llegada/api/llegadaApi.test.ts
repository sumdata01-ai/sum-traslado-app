// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/core/http/apiClient'
import { crearLlegadaApi } from './llegadaApi'

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(respuesta: () => Response | Promise<Response>, refresh: 'ok' | 'expirada' | 'sin_conexion' = 'expirada') {
  const fetchImpl = vi.fn<typeof fetch>(async () => respuesta())
  const limpiarSesion = vi.fn()
  const cliente = createApiClient({ getToken: () => 'token', refreshSession: async () => refresh, limpiarSesion, fetchImpl })
  return { api: crearLlegadaApi(cliente), fetchImpl, limpiarSesion }
}

const DATOS = { payload: 'SUM1|1|59733450|zQG61jRaGQCSUy_8-vyeVQ', latitud: -11.902172, longitud: -77.122394, precisionM: 8.5 }
const OK = { id_llegada: 11, punto: 'Patio de llegada', fecha_llegada: '2026-10-15T14:35:00-05:00', turno: 3, flags: [] }

describe('registrar: la petición', () => {
  it('hace POST a /mobile/llegadas con el token y exactamente los cuatro campos', async () => {
    const { api, fetchImpl } = montar(() => json(201, OK))

    await api.registrar(DATOS)

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('/mobile/llegadas')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ payload: DATOS.payload, latitud: -11.902172, longitud: -77.122394, precision_m: 8.5 })
  })

  it('el texto del QR viaja sin cambios, con espacios y mayúsculas', async () => {
    const { api, fetchImpl } = montar(() => json(201, OK))
    const crudo = ' SUM1|7|59698271|S4eYGtymJsriCiZYxmdpHA \n'

    await api.registrar({ ...DATOS, payload: crudo })

    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body)).payload).toBe(crudo)
  })

  it('manda una sola petición', async () => {
    const { api, fetchImpl } = montar(() => json(201, OK))
    await api.registrar(DATOS)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('registrar: las respuestas', () => {
  it('201 → confirmada', async () => {
    const { api } = montar(() => json(201, OK))
    expect(await api.registrar(DATOS)).toMatchObject({ tipo: 'confirmada', yaRegistrada: false, llegada: { turno: 3, punto: 'Patio de llegada' } })
  })

  it('200 → confirmada, ya registrada', async () => {
    const { api } = montar(() => json(200, OK))
    expect(await api.registrar(DATOS)).toMatchObject({ tipo: 'confirmada', yaRegistrada: true })
  })

  it('400 INVALID_CODE → código no válido (lee el code, no solo el mensaje)', async () => {
    const { api } = montar(() => json(400, { detail: 'Código no válido', code: 'INVALID_CODE' }))
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'codigoInvalido' })
  })

  it('400 fuera de zona', async () => {
    const { api } = montar(() => json(400, { detail: 'x', code: 'OUT_OF_GEOFENCE', motivo: 'fuera_de_zona' }))
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'fueraDeZona' })
  })

  it('400 precisión insuficiente, con lo que acepta el punto', async () => {
    const { api } = montar(() => json(400, { detail: 'x', code: 'OUT_OF_GEOFENCE', motivo: 'precision_insuficiente', precision_max_m: 100 }))
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'precisionInsuficiente', precisionMaxM: 100 })
  })

  it('422 → ubicación no leída', async () => {
    const { api } = montar(() => json(422, { detail: [{ loc: ['body', 'latitud'], msg: 'x', type: 'y' }] }))
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'ubicacionNoLeida' })
  })

  it('403 → sin permiso, y NO cierra la sesión', async () => {
    const { api, limpiarSesion } = montar(() => json(403, { detail: 'Permisos insuficientes' }))

    expect(await api.registrar(DATOS)).toEqual({ tipo: 'sinPermiso' })
    expect(limpiarSesion).not.toHaveBeenCalled()
  })

  it('500 → error con su código', async () => {
    const { api } = montar(() => json(500, { detail: 'boom' }))
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'error', status: 500 })
  })

  it('sin red → sinRed', async () => {
    const { api } = montar(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'sinRed' })
  })

  it('401 que no se pudo renovar → sesión vencida', async () => {
    const { api } = montar(() => json(401, { detail: 'no' }), 'expirada')
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'sesionVencida' })
  })

  it('401 con el refresh sin red → sin red, no sesión vencida', async () => {
    const { api } = montar(() => json(401, { detail: 'no' }), 'sin_conexion')
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'sinRed' })
  })

  it('401 que se renueva y se reintenta una vez → confirmada', async () => {
    let llamadas = 0
    const { api, fetchImpl } = montar(() => (++llamadas === 1 ? json(401, { detail: 'vencido' }) : json(201, OK)), 'ok')

    expect(await api.registrar(DATOS)).toMatchObject({ tipo: 'confirmada' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('un 200 con un cuerpo raro no se da por confirmado', async () => {
    const { api } = montar(() => json(200, { algo: 'raro' }))
    expect(await api.registrar(DATOS)).toEqual({ tipo: 'error', status: 200 })
  })
})
