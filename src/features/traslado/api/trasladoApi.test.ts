// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { type ApiClient, createApiClient } from '@/core/http/apiClient'
import { aOrdenRemota } from './schemas'
import { OPCIONES_TRASLADO, type TrasladoApi, crearTrasladoApi } from './trasladoApi'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

// Una orden tal como la devuelve el backend de desarrollo (comprobado el 2026-10-09).
const ordenCruda = {
  id_orden: 3458,
  vin: 'LSCABN3E2VE840638',
  estado: 'pendiente',
  placa: null,
  proveedor: null,
  destino: { id: 4, nombre: 'Martinez Lujan (Renting)' },
  conductor_asignado: null,
  fecha_creacion: '2026-10-09T10:33:30.625541Z',
}

function apiConRespuesta(respuesta: () => Response | Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>(async () => respuesta())
  const cliente = createApiClient({ getToken: () => 'token', refreshSession: async () => 'expirada', limpiarSesion: () => undefined, fetchImpl })
  return { api: crearTrasladoApi(cliente), fetchImpl }
}

describe('misOrdenes: lectura del contrato', () => {
  it('lee una orden del pool tal como la devuelve el backend, con los campos vacíos como nulos', async () => {
    const { api, fetchImpl } = apiConRespuesta(() => json(200, { ordenes: [ordenCruda] }))

    const { ordenes, descartadas } = await api.misOrdenes()

    expect(descartadas).toBe(0)
    expect(ordenes).toEqual([
      {
        idOrden: 3458,
        vin: 'LSCABN3E2VE840638',
        estado: 'pendiente',
        placa: null,
        proveedor: null,
        destino: { id: 4, nombre: 'Martinez Lujan (Renting)' },
        conductorAsignado: null,
        fechaCreacion: '2026-10-09T10:33:30.625541Z',
      },
    ])
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/mis-ordenes')
  })

  it('lee una orden propia con su conductor, su placa y su proveedor', async () => {
    const propia = {
      ...ordenCruda,
      placa: { id: 27, codigo: 'ABC-123' },
      proveedor: { id: 4, nombre: 'Grúas SA' },
      conductor_asignado: { id: 7, username: 'ana', nombre_completo: 'Ana Pérez' },
    }
    const { api } = apiConRespuesta(() => json(200, { ordenes: [propia] }))

    const { ordenes } = await api.misOrdenes()

    expect(ordenes[0]).toMatchObject({
      placa: { id: 27, codigo: 'ABC-123' },
      proveedor: { id: 4, nombre: 'Grúas SA' },
      conductorAsignado: { id: 7, username: 'ana', nombreCompleto: 'Ana Pérez' },
    })
  })

  it('un conductor sin nombre completo queda con el nombre nulo y no rompe', async () => {
    const { api } = apiConRespuesta(() => json(200, { ordenes: [{ ...ordenCruda, conductor_asignado: { id: 7, username: 'ana' } }] }))
    expect((await api.misOrdenes()).ordenes[0]?.conductorAsignado).toEqual({ id: 7, username: 'ana', nombreCompleto: null })
  })

  it('los campos que faltan del todo (no solo nulos) también se toleran', async () => {
    const minima = { id_orden: 1, vin: 'V', estado: 'pendiente' }
    const { api } = apiConRespuesta(() => json(200, { ordenes: [minima] }))
    expect((await api.misOrdenes()).ordenes[0]).toMatchObject({ placa: null, proveedor: null, destino: null, conductorAsignado: null, fechaCreacion: null })
  })

  it('una lista vacía es válida: no hay traslados', async () => {
    const { api } = apiConRespuesta(() => json(200, { ordenes: [] }))
    expect(await api.misOrdenes()).toEqual({ ordenes: [], descartadas: 0 })
  })

  it('una orden con datos inválidos se salta y se cuenta, sin vaciar el resto de la lista', async () => {
    const mala1 = { ...ordenCruda, id_orden: 'no es un número' }
    const mala2 = { ...ordenCruda, vin: '' }
    const mala3 = null
    const buena = { ...ordenCruda, id_orden: 5 }
    const { api } = apiConRespuesta(() => json(200, { ordenes: [mala1, buena, mala2, mala3] }))

    const { ordenes, descartadas } = await api.misOrdenes()

    expect(ordenes.map((o) => o.idOrden)).toEqual([5])
    expect(descartadas).toBe(3)
  })

  it('ignora campos que el contrato no conoce', async () => {
    const { api } = apiConRespuesta(() => json(200, { ordenes: [{ ...ordenCruda, campo_nuevo: 'x' }] }))
    expect((await api.misOrdenes()).ordenes).toHaveLength(1)
  })
})

describe('misOrdenes: respuestas inesperadas', () => {
  it.each([
    ['sin la clave «ordenes»', {}],
    ['«ordenes» que no es una lista', { ordenes: 'nada' }],
    ['un cuerpo que no es un objeto', [1, 2]],
    ['un cuerpo nulo', null],
  ])('%s → error de respuesta inesperada que NO se confunde con falta de red', async (_nombre, cuerpo) => {
    const { api } = apiConRespuesta(() => json(200, cuerpo))
    const error = await api.misOrdenes().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
    expect((error as ApiError).isNetwork).toBe(false)
  })

  it('un error del servidor conserva su código y su mensaje', async () => {
    const { api } = apiConRespuesta(() => json(500, { detail: 'Error interno' }))
    await expect(api.misOrdenes()).rejects.toMatchObject({ status: 500, message: 'Error interno' })
  })

  it('sin red lanza un error sin código (red caída)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const cliente = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion: () => undefined, fetchImpl })
    const error = await crearTrasladoApi(cliente).misOrdenes().catch((e: unknown) => e)
    expect((error as ApiError).isNetwork).toBe(true)
  })
})

describe('política de 403 de Traslado', () => {
  it('un 403 NO cierra la sesión: llega como error 403 con el mensaje del servidor', async () => {
    const limpiarSesion = vi.fn()
    const fetchImpl = vi.fn<typeof fetch>(async () => json(403, { detail: 'Permisos insuficientes' }))
    const cliente = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion, fetchImpl })

    const error = await crearTrasladoApi(cliente).misOrdenes().catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 403, message: 'Permisos insuficientes' })
    expect(limpiarSesion).not.toHaveBeenCalled()
  })

  it('con el cliente por defecto (sin la opción) el mismo 403 SÍ cierra la sesión: por eso la opción es obligatoria', async () => {
    const limpiarSesion = vi.fn()
    const fetchImpl = vi.fn<typeof fetch>(async () => json(403, { detail: 'Permisos insuficientes' }))
    const cliente = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion, fetchImpl })

    await cliente.getJson('/mobile/traslado/mis-ordenes').catch(() => undefined)

    expect(limpiarSesion).toHaveBeenCalledTimes(1)
  })

  it('la constante de la política dice no cerrar la sesión', () => {
    expect(OPCIONES_TRASLADO).toEqual({ cerrarSesionEn403: false })
  })
})

describe('PRUEBA DE GUARDA: toda función de trasladoApi pasa cerrarSesionEn403: false', () => {
  // Cada función de la API necesita una muestra de cómo llamarla. El tipo `Record<keyof TrasladoApi, …>`
  // hace que añadir una función sin su muestra sea un error de compilación: no se puede olvidar.
  function montar() {
    const opcionesRecibidas: Array<{ cliente: string; opciones: unknown }> = []
    const cliente = {
      getJson: vi.fn(async (_path: string, opciones?: unknown) => {
        opcionesRecibidas.push({ cliente: 'getJson', opciones })
        return { ordenes: [], placas: [], proveedores: [], candidatos: [], vin: 'X' }
      }),
      postJson: vi.fn(async (_path: string, _cuerpo?: unknown, opciones?: unknown) => {
        opcionesRecibidas.push({ cliente: 'postJson', opciones })
        return { id_orden: 1, tomada: true, resultado: 'confirmada' }
      }),
      request: vi.fn(async (_path: string, _init?: unknown, opciones?: unknown) => {
        opcionesRecibidas.push({ cliente: 'request', opciones })
        return new Response('{}')
      }),
    }
    const api = crearTrasladoApi(cliente as unknown as ApiClient)
    const muestras: Record<keyof TrasladoApi, () => Promise<unknown>> = {
      misOrdenes: () => api.misOrdenes(),
      catalogos: () => api.catalogos(),
      buscarVin: () => api.buscarVin('lsca'),
      identificarVin: () => api.identificarVin('LSCABN3E2VE840638'),
      tomarOrden: () => api.tomarOrden(1),
      soltarOrden: () => api.soltarOrden(1),
      confirmarSalida: () => api.confirmarSalida(1, { fotos: [], idConductorEsperado: null, idPlaca: null, idProveedor: null, fechaSalida: new Date(0) }),
      confirmarEntrega: () => api.confirmarEntrega(1, { fotos: [], fechaEntrega: new Date(0) }),
    }
    return { api, muestras, opcionesRecibidas }
  }

  it('cada función hace al menos una llamada y todas llevan la política', async () => {
    const { api, muestras, opcionesRecibidas } = montar()
    const funciones = Object.keys(api) as Array<keyof TrasladoApi>
    expect(funciones.length).toBeGreaterThan(0)

    for (const nombre of funciones) {
      const antes = opcionesRecibidas.length
      await muestras[nombre]()
      const llamadas = opcionesRecibidas.slice(antes)
      expect(llamadas.length, `«${nombre}» no hizo ninguna llamada al cliente`).toBeGreaterThan(0)
      for (const { cliente, opciones } of llamadas) {
        expect(opciones, `«${nombre}» llama a ${cliente} sin las opciones de Traslado`).toMatchObject({ cerrarSesionEn403: false })
      }
    }
  })

  it('las muestras cubren exactamente las funciones de la API', () => {
    const { api, muestras } = montar()
    expect(Object.keys(muestras).sort()).toEqual(Object.keys(api).sort())
  })
})

describe('aOrdenRemota', () => {
  it('rechaza lo que no es un objeto', () => {
    for (const valor of [null, undefined, 'x', 5, []]) expect(aOrdenRemota(valor)).toBeNull()
  })
  it('rechaza un id que no es entero', () => {
    expect(aOrdenRemota({ ...ordenCruda, id_orden: 1.5 })).toBeNull()
  })
})

describe('tomarOrden y soltarOrden: contrato', () => {
  it('tomar llama a POST /mobile/traslado/{id}/tomar y lee la respuesta', async () => {
    const { api, fetchImpl } = apiConRespuesta(() => json(200, { id_orden: 3458, tomada: true, conductor: 'OPERARIO PRUEBA' }))

    expect(await api.tomarOrden(3458)).toEqual({ idOrden: 3458, tomada: true })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/3458/tomar')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
  })

  it('soltar llama a POST /mobile/traslado/{id}/soltar', async () => {
    const { api, fetchImpl } = apiConRespuesta(() => json(200, { id_orden: 7, tomada: false }))

    expect(await api.soltarOrden(7)).toEqual({ idOrden: 7, tomada: false })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/mobile/traslado/7/soltar')
  })

  it('un 409 al tomar llega con el nombre de quien se adelantó', async () => {
    const { api } = apiConRespuesta(() => json(409, { detail: 'La tomó Ana Pérez' }))
    await expect(api.tomarOrden(1)).rejects.toMatchObject({ status: 409, message: 'La tomó Ana Pérez' })
  })

  it('un 409 al soltar llega con el motivo', async () => {
    const { api } = apiConRespuesta(() => json(409, { detail: 'El auto ya salió con esta orden: no se puede devolver al pool' }))
    await expect(api.soltarOrden(1)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('ya salió') })
  })

  it('sin red, tomar falla como red caída (sin código): es lo que permite tomarla sin señal', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const cliente = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion: () => undefined, fetchImpl })
    const error = await crearTrasladoApi(cliente).tomarOrden(1).catch((e: unknown) => e)
    expect((error as ApiError).isNetwork).toBe(true)
  })

  it('una respuesta sin la forma esperada es un 502, no un «tomada»', async () => {
    const { api } = apiConRespuesta(() => json(200, { ok: true }))
    const error = await api.tomarOrden(1).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502 })
  })

  it('un 403 al tomar no cierra la sesión', async () => {
    const limpiarSesion = vi.fn()
    const fetchImpl = vi.fn<typeof fetch>(async () => json(403, { detail: 'Permisos insuficientes' }))
    const cliente = createApiClient({ getToken: () => 't', refreshSession: async () => 'ok', limpiarSesion, fetchImpl })
    await expect(crearTrasladoApi(cliente).tomarOrden(1)).rejects.toMatchObject({ status: 403 })
    expect(limpiarSesion).not.toHaveBeenCalled()
  })
})
