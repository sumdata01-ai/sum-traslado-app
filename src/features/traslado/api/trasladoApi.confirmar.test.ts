// @vitest-environment node
/** E4-02 · la capa de API de «Confirmar salida» y «Confirmar entrega». */
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { createApiClient } from '@/core/http/apiClient'
import { ZONAS_ENTREGA, ZONAS_SALIDA } from '../domain'
import { type DatosEntrega, type DatosSalida, crearTrasladoApi } from './trasladoApi'

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(respuesta: () => Response | Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>(async () => respuesta())
  const limpiarSesion = vi.fn()
  const cliente = createApiClient({ getToken: () => 'token', refreshSession: async () => 'expirada', limpiarSesion, fetchImpl })
  const cuerpo = () => JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
  return { api: crearTrasladoApi(cliente), fetchImpl, limpiarSesion, cuerpo }
}

const salida: DatosSalida = {
  fotos: ZONAS_SALIDA.map((zona) => ({ zona, storageKey: `traslado/2026/10/${zona}.jpg` })),
  idConductorEsperado: 303,
  idPlaca: 27,
  idProveedor: 4,
  fechaSalida: new Date('2026-10-09T13:13:35Z'),
}
const entrega: DatosEntrega = {
  fotos: ZONAS_ENTREGA.map((zona) => ({ zona, storageKey: `traslado/2026/10/${zona}.jpg` })),
  fechaEntrega: new Date('2026-10-09T23:13:35.000Z'),
}

describe('confirmarSalida', () => {
  it('AC2 · el cuerpo trae las 6 fotos con zona y storage_key, el conductor esperado, la placa, el proveedor y la fecha medida en UTC', async () => {
    const m = montar(() => json(200, { resultado: 'confirmada', id_orden: 812, estado: 'en_transito', motivo: null }))

    await m.api.confirmarSalida(812, salida)

    expect(m.fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/812/confirmar-salida')
    expect(m.fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(m.cuerpo()).toEqual({
      fotos: ZONAS_SALIDA.map((zona) => ({ zona, storage_key: `traslado/2026/10/${zona}.jpg`, comentario: null })),
      id_conductor_asignado_esperado: 303,
      id_placa: 27,
      id_proveedor: 4,
      fecha_salida_cliente: '2026-10-09T13:13:35.000Z',
    })
  })

  it('el conductor esperado, la placa y el proveedor pueden ir en null (van como null, no se omiten)', async () => {
    const m = montar(() => json(200, { resultado: 'confirmada', id_orden: 812 }))

    await m.api.confirmarSalida(812, { ...salida, idConductorEsperado: null, idPlaca: null, idProveedor: null })

    expect(m.cuerpo()).toMatchObject({ id_conductor_asignado_esperado: null, id_placa: null, id_proveedor: null })
    expect(Object.keys(m.cuerpo())).toEqual(expect.arrayContaining(['id_conductor_asignado_esperado', 'id_placa', 'id_proveedor']))
  })

  it('lee «confirmada» con el estado nuevo', async () => {
    const m = montar(() => json(200, { resultado: 'confirmada', id_orden: 812, estado: 'en_transito', motivo: null }))
    expect(await m.api.confirmarSalida(812, salida)).toEqual({ resultado: 'confirmada', idOrden: 812, estado: 'en_transito', motivo: null })
  })

  it.each(['orden_cancelada', 'orden_reasignada'])('«descartada_por_supervisor» (%s) es un RESULTADO, no un error', async (motivo) => {
    const m = montar(() => json(200, { resultado: 'descartada_por_supervisor', id_orden: 812, estado: 'cancelada', motivo }))
    expect(await m.api.confirmarSalida(812, salida)).toMatchObject({ resultado: 'descartada_por_supervisor', motivo })
  })

  it('AC5 · un 422 es un ApiError con el mensaje del servidor, y no cierra la sesión', async () => {
    const m = montar(() => json(422, { detail: 'Se esperan exactamente 6 fotos.' }))
    const error = await m.api.confirmarSalida(812, salida).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, message: 'Se esperan exactamente 6 fotos.' })
    expect(m.limpiarSesion).not.toHaveBeenCalled()
  })

  it('un 403 no cierra la sesión (política de Traslado)', async () => {
    const m = montar(() => json(403, { detail: 'Permisos insuficientes' }))
    await expect(m.api.confirmarSalida(812, salida)).rejects.toMatchObject({ status: 403 })
    expect(m.limpiarSesion).not.toHaveBeenCalled()
  })

  it('un cuerpo que no se entiende NO se toma por confirmado: es un error 502', async () => {
    for (const cuerpo of [{}, { resultado: 'quizá', id_orden: 1 }, { id_orden: 1 }, null]) {
      const m = montar(() => json(200, cuerpo))
      await expect(m.api.confirmarSalida(812, salida), JSON.stringify(cuerpo)).rejects.toMatchObject({ status: 502 })
    }
  })

  it('sin red es un ApiError de red (se puede reintentar)', async () => {
    const m = montar(() => {
      throw new TypeError('Failed to fetch')
    })
    await expect(m.api.confirmarSalida(812, salida)).rejects.toMatchObject({ isNetwork: true })
  })
})

describe('confirmarEntrega', () => {
  it('AC6 · el cuerpo trae las 5 fotos (con VIN) y fecha_entrega_cliente, y nada de placa ni proveedor', async () => {
    const m = montar(() => json(200, { resultado: 'confirmada', id_orden: 812, estado: 'realizado', motivo: null }))

    await m.api.confirmarEntrega(812, entrega)

    expect(m.fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/812/confirmar-entrega')
    expect(m.cuerpo()).toEqual({
      fotos: ZONAS_ENTREGA.map((zona) => ({ zona, storage_key: `traslado/2026/10/${zona}.jpg`, comentario: null })),
      fecha_entrega_cliente: '2026-10-09T23:13:35.000Z',
    })
    expect(m.cuerpo().fotos).toHaveLength(5)
  })

  it('un 422 (la orden nunca salió) llega con el mensaje del servidor', async () => {
    const m = montar(() => json(422, { detail: 'La orden nunca salió.' }))
    await expect(m.api.confirmarEntrega(812, entrega)).rejects.toMatchObject({ status: 422, message: 'La orden nunca salió.' })
  })

  it('«descartada_por_supervisor» con orden_cancelada es un resultado', async () => {
    const m = montar(() => json(200, { resultado: 'descartada_por_supervisor', id_orden: 812, estado: 'cancelada', motivo: 'orden_cancelada' }))
    expect(await m.api.confirmarEntrega(812, entrega)).toMatchObject({ resultado: 'descartada_por_supervisor', motivo: 'orden_cancelada' })
  })
})
