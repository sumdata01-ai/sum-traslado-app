// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { createApiClient } from '@/core/http/apiClient'
import { crearSeguimientoApi } from './seguimientoApi'

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(respuesta: () => Response | Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>(async () => respuesta())
  const limpiarSesion = vi.fn()
  const cliente = createApiClient({ getToken: () => 'token', refreshSession: async () => 'expirada', limpiarSesion, fetchImpl })
  return { api: crearSeguimientoApi(cliente), fetchImpl, limpiarSesion }
}

describe('traslados con rango de fechas', () => {
  it('pide ?desde=…&hasta=… con los días de Lima tal cual, sobre /api/seguimiento/traslados', async () => {
    const { api, fetchImpl } = montar(() => json(200, { traslados: [] }))

    await api.traslados({ desde: '2026-10-12', hasta: '2026-10-16' })

    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]), 'http://servidor')
    expect(url.pathname).toBe('/api/seguimiento/traslados')
    expect(url.searchParams.get('desde')).toBe('2026-10-12')
    expect(url.searchParams.get('hasta')).toBe('2026-10-16')
    expect([...url.searchParams.keys()].sort()).toEqual(['desde', 'hasta'])
  })

  it('sin rango no manda ningún parámetro (la lista de siempre)', async () => {
    const { api, fetchImpl } = montar(() => json(200, { traslados: [] }))

    await api.traslados()

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/seguimiento/traslados')
  })

  it('un 422 del servidor (rango rechazado) llega como error con su mensaje, sin cerrar la sesión', async () => {
    const { api, limpiarSesion } = montar(() => json(422, { detail: 'La fecha de fin no puede ser futura.' }))

    const error = await api.traslados({ desde: '2026-10-12', hasta: '2026-10-16' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect(limpiarSesion).not.toHaveBeenCalled()
  })

  it('un 403 con rango tampoco cierra la sesión (misma política que sin rango)', async () => {
    const { api, limpiarSesion } = montar(() => json(403, { detail: 'No autorizado' }))

    const error = await api.traslados({ desde: '2026-10-12', hasta: '2026-10-16' }).catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(403)
    expect(limpiarSesion).not.toHaveBeenCalled()
  })
})

/** Un traslado crudo del servidor (lo mínimo que lee la web). */
const crudo = (id: number, extra: Record<string, unknown>) => ({
  id_orden: id,
  vin: `LVTDD24B6VDX${String(id).padStart(5, '0')}`,
  marca: 'Toyota',
  modelo: 'Corolla',
  color: 'Blanco',
  destino: 'Sede Norte',
  etapa: 'en_camino',
  salida_registrada_en: null,
  entregado_en: null,
  entrega_estimada: false,
  seguimiento: null,
  ...extra,
})

describe('un servidor que ignora el rango (todavía sin el cambio)', () => {
  const lista = [
    crudo(1, { etapa: 'en_camino', salida_registrada_en: '2026-10-15T12:40:00Z' }), // de hoy
    crudo(2, { etapa: 'en_camino', salida_registrada_en: '2026-10-09T12:40:00Z' }), // en camino desde hace días
    crudo(3, { etapa: 'en_planta' }), // sin fechas
    crudo(4, { etapa: 'entregado', salida_registrada_en: '2026-10-14T13:00:00Z', entregado_en: '2026-10-15T16:00:00Z' }), // se entregó hoy
    crudo(5, { etapa: 'entregado', salida_registrada_en: '2026-10-13T13:00:00Z', entregado_en: '2026-10-13T16:00:00Z' }), // de otro día
    crudo(6, { etapa: 'anulado' }),
  ]

  it('con un rango, la web deja solo lo que pertenece a él: no muestra traslados de otros días bajo «Hoy»', async () => {
    const { api } = montar(() => json(200, { traslados: lista }))

    const { traslados } = await api.traslados({ desde: '2026-10-15', hasta: '2026-10-15' })

    expect(traslados.map((t) => t.idOrden)).toEqual([1, 4])
  })

  it('sin rango no filtra nada (la lista de siempre)', async () => {
    const { api } = montar(() => json(200, { traslados: lista }))

    const { traslados } = await api.traslados()

    expect(traslados.map((t) => t.idOrden)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('con un servidor que sí filtra, el resultado es el mismo (la regla es idempotente)', async () => {
    const { api } = montar(() => json(200, { traslados: [lista[0], lista[3]] }))

    const { traslados } = await api.traslados({ desde: '2026-10-15', hasta: '2026-10-15' })

    expect(traslados.map((t) => t.idOrden)).toEqual([1, 4])
  })
})
