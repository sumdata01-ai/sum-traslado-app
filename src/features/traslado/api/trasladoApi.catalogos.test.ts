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

describe('catalogos: contrato', () => {
  // Tal como lo devuelve el backend de desarrollo (comprobado el 2026-10-10).
  const cuerpo = {
    placas: [
      { id: 40, codigo: 'EEB190', estado: 'en_uso' },
      { id: 41, codigo: 'EEB191', estado: 'disponible' },
    ],
    proveedores: [
      { id: 6, nombre: 'BENAVIDES' },
      { id: 4, nombre: 'M&C' },
    ],
  }

  it('lee placas (con su estado) y proveedores, en el orden en que llegan', async () => {
    const { api, fetchImpl } = apiConRespuesta(() => json(200, cuerpo))

    const catalogos = await api.catalogos()

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/catalogos')
    expect(catalogos).toEqual({
      placas: [
        { id: 40, nombre: 'EEB190', estado: 'en_uso' },
        { id: 41, nombre: 'EEB191', estado: 'disponible' },
      ],
      proveedores: [
        { id: 6, nombre: 'BENAVIDES', estado: null },
        { id: 4, nombre: 'M&C', estado: null },
      ],
      descartadas: 0,
    })
  })

  it('una placa sin estado se lee con estado nulo', async () => {
    const { api } = apiConRespuesta(() => json(200, { placas: [{ id: 1, codigo: 'AAA111' }], proveedores: [] }))
    expect((await api.catalogos()).placas).toEqual([{ id: 1, nombre: 'AAA111', estado: null }])
  })

  it('un catálogo vacío es válido', async () => {
    const { api } = apiConRespuesta(() => json(200, { placas: [], proveedores: [] }))
    expect(await api.catalogos()).toEqual({ placas: [], proveedores: [], descartadas: 0 })
  })

  it('una opción con datos inválidos se salta y se cuenta, sin vaciar el resto', async () => {
    const { api } = apiConRespuesta(() =>
      json(200, {
        placas: [{ id: 'x', codigo: 'MALA' }, { id: 2, codigo: '' }, null, { id: 3, codigo: 'BUENA', estado: 'disponible' }],
        proveedores: [{ id: 1 }, { id: 2, nombre: 'SUM' }],
      }),
    )

    const catalogos = await api.catalogos()

    expect(catalogos.placas.map((p) => p.nombre)).toEqual(['BUENA'])
    expect(catalogos.proveedores.map((p) => p.nombre)).toEqual(['SUM'])
    expect(catalogos.descartadas).toBe(4)
  })

  it.each([
    ['sin «proveedores»', { placas: [] }],
    ['«placas» que no es una lista', { placas: 'x', proveedores: [] }],
    ['un cuerpo que no es un objeto', [1]],
    ['un cuerpo nulo', null],
  ])('%s → error de respuesta inesperada, que no se confunde con falta de red', async (_nombre, respuesta) => {
    const { api } = apiConRespuesta(() => json(200, respuesta))
    const error = await api.catalogos().catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502 })
    expect((error as ApiError).isNetwork).toBe(false)
  })

  it('sin red falla como red caída (sin código), para poder usar lo guardado', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const cliente = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion: () => undefined, fetchImpl })
    const error = await crearTrasladoApi(cliente).catalogos().catch((e: unknown) => e)
    expect((error as ApiError).isNetwork).toBe(true)
  })

  it('un 403 no cierra la sesión', async () => {
    const limpiarSesion = vi.fn()
    const fetchImpl = vi.fn<typeof fetch>(async () => json(403, { detail: 'Permisos insuficientes' }))
    const cliente = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion, fetchImpl })
    await expect(crearTrasladoApi(cliente).catalogos()).rejects.toMatchObject({ status: 403 })
    expect(limpiarSesion).not.toHaveBeenCalled()
  })
})
