// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/core/http/ApiError'
import { createApiClient } from '@/core/http/apiClient'
import { crearTrasladoApi } from './trasladoApi'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function apiConRespuesta(respuesta: () => Response | Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>(async () => respuesta())
  const cliente = createApiClient({ getToken: () => 'token', refreshSession: async () => 'expirada', limpiarSesion: () => undefined, fetchImpl })
  return { api: crearTrasladoApi(cliente), fetchImpl }
}

const VIN = 'LSCABN3E2VE840638'
const ordenCruda = {
  id_orden: 3458,
  vin: VIN,
  estado: 'pendiente',
  placa: null,
  proveedor: null,
  destino: { id: 4, nombre: 'Martinez Lujan (Renting)' },
  conductor_asignado: null,
  fecha_creacion: '2026-10-09T10:33:30.625541Z',
}

describe('identificarVin', () => {
  it('AC1 · el VIN va codificado en la URL, con GET', async () => {
    const { api, fetchImpl } = apiConRespuesta(() => json(200, { vin: VIN, ordenes: [] }))
    await api.identificarVin(VIN)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`/mobile/traslado/vin/${VIN}`)
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('AC1 · un texto con caracteres especiales no rompe la ruta ni se cuela en ella', async () => {
    const { api, fetchImpl } = apiConRespuesta(() => json(200, { vin: 'X', ordenes: [] }))
    await api.identificarVin('AB/../CD?x=1#y')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/vin/AB%2F..%2FCD%3Fx%3D1%23y')
  })

  it('lee las órdenes pendientes del vehículo, con su conductor', async () => {
    const propia = { ...ordenCruda, id_orden: 9, conductor_asignado: { id: 7, username: 'ana', nombre_completo: 'Ana Pérez' } }
    const { api } = apiConRespuesta(() => json(200, { vin: VIN, ordenes: [ordenCruda, propia] }))

    const resultado = await api.identificarVin(VIN)

    expect(resultado.vin).toBe(VIN)
    expect(resultado.ordenes.map((o) => o.idOrden)).toEqual([3458, 9])
    expect(resultado.ordenes[0]?.conductorAsignado).toBeNull()
    expect(resultado.ordenes[1]?.conductorAsignado).toEqual({ id: 7, username: 'ana', nombreCompleto: 'Ana Pérez' })
  })

  it('AC3 · 200 con la lista vacía es válido y NO es un error: el vehículo existe sin orden pendiente', async () => {
    const { api } = apiConRespuesta(() => json(200, { vin: VIN, ordenes: [] }))
    expect(await api.identificarVin(VIN)).toEqual({ vin: VIN, ordenes: [], descartadas: 0 })
  })

  it('AC2 · 404 llega como error con código 404 (VIN que no es un vehículo conocido)', async () => {
    const { api } = apiConRespuesta(() => json(404, { detail: `${VIN} no está registrado como vehículo` }))
    await expect(api.identificarVin(VIN)).rejects.toMatchObject({ status: 404 })
  })

  it('AC4 · 422 llega como error con código 422 (formato inválido)', async () => {
    const { api } = apiConRespuesta(() => json(422, { detail: 'VIN inválido: 17 caracteres, solo A-Z (excluye I O Q) y 0-9' }))
    await expect(api.identificarVin('XYZ')).rejects.toMatchObject({ status: 422, message: expect.stringContaining('VIN inválido') })
  })

  it('una orden con datos inválidos se salta y se cuenta, sin tirar las demás', async () => {
    const { api } = apiConRespuesta(() => json(200, { vin: VIN, ordenes: [{ id_orden: 'x' }, ordenCruda, null] }))
    const resultado = await api.identificarVin(VIN)
    expect(resultado.ordenes.map((o) => o.idOrden)).toEqual([3458])
    expect(resultado.descartadas).toBe(2)
  })

  it.each([
    ['sin «ordenes»', { vin: VIN }],
    ['sin «vin»', { ordenes: [] }],
    ['«ordenes» que no es una lista', { vin: VIN, ordenes: 'x' }],
    ['un cuerpo nulo', null],
    ['un cuerpo que no es un objeto', [1]],
  ])('%s → respuesta inesperada (502), que no se confunde con falta de red', async (_nombre, cuerpo) => {
    const { api } = apiConRespuesta(() => json(200, cuerpo))
    const error = await api.identificarVin(VIN).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502 })
    expect((error as ApiError).isNetwork).toBe(false)
  })

  it('sin red falla como red caída; un 403 no cierra la sesión', async () => {
    const sinRed = createApiClient({
      getToken: () => 't',
      refreshSession: async () => 'ok',
      limpiarSesion: () => undefined,
      fetchImpl: vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
    })
    expect(((await crearTrasladoApi(sinRed).identificarVin(VIN).catch((e: unknown) => e)) as ApiError).isNetwork).toBe(true)

    const limpiarSesion = vi.fn()
    const prohibido = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion, fetchImpl: vi.fn<typeof fetch>(async () => json(403, { detail: 'Permisos insuficientes' })) })
    await expect(crearTrasladoApi(prohibido).identificarVin(VIN)).rejects.toMatchObject({ status: 403 })
    expect(limpiarSesion).not.toHaveBeenCalled()
  })
})

describe('buscarVin', () => {
  it('llama a GET /buscar con el texto en el parámetro q, codificado', async () => {
    const { api, fetchImpl } = apiConRespuesta(() => json(200, { candidatos: [] }))
    await api.buscarVin('lsca b&c')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/buscar?q=lsca+b%26c')
  })

  it('lee los candidatos con su marca y modelo, en el orden en que llegan', async () => {
    const { api } = apiConRespuesta(() =>
      json(200, {
        candidatos: [
          { vin: 'LSCABN3E2VE840638', marca: 'CHANGAN', modelo: 'CS35' },
          { vin: 'LSCABN3E2VE840639', marca: 'CHANGAN', modelo: 'CS55' },
        ],
      }),
    )
    const resultado = await api.buscarVin('lscabn')
    expect(resultado.candidatos.map((c) => [c.vin, c.marca, c.modelo])).toEqual([
      ['LSCABN3E2VE840638', 'CHANGAN', 'CS35'],
      ['LSCABN3E2VE840639', 'CHANGAN', 'CS55'],
    ])
  })

  it('una marca o modelo vacíos se leen como texto vacío, no rompen', async () => {
    const { api } = apiConRespuesta(() => json(200, { candidatos: [{ vin: VIN, marca: null }] }))
    expect((await api.buscarVin('lsca')).candidatos).toEqual([{ vin: VIN, marca: '', modelo: '' }])
  })

  it('sin coincidencias es una lista vacía válida', async () => {
    const { api } = apiConRespuesta(() => json(200, { candidatos: [] }))
    expect(await api.buscarVin('zzzz')).toEqual({ candidatos: [], descartados: 0 })
  })

  it('un candidato inválido se salta y se cuenta', async () => {
    const { api } = apiConRespuesta(() => json(200, { candidatos: [{ vin: '' }, { vin: VIN, marca: 'X', modelo: 'Y' }, 5] }))
    const resultado = await api.buscarVin('lsca')
    expect(resultado.candidatos).toHaveLength(1)
    expect(resultado.descartados).toBe(2)
  })

  it('una respuesta sin la forma esperada es un 502', async () => {
    const { api } = apiConRespuesta(() => json(200, { otra: 1 }))
    expect(await api.buscarVin('lsca').catch((e: unknown) => e)).toMatchObject({ status: 502 })
  })

  it('un 422 (menos de 4 caracteres) llega como error con código: por eso no se debe llamar con menos', async () => {
    const { api } = apiConRespuesta(() => json(422, { detail: [{ msg: 'String should have at least 4 characters' }] }))
    await expect(api.buscarVin('abc')).rejects.toMatchObject({ status: 422 })
  })
})
