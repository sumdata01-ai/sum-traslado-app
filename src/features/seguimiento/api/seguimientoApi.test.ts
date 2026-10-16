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

const crudo = (extra: Record<string, unknown> = {}) => ({
  id_orden: 9001,
  vin: 'LVTDD24B6VDX00231',
  marca: 'Toyota',
  modelo: 'Corolla',
  color: 'Blanco',
  destino: 'Sede Norte',
  etapa: 'en_camino',
  salida_registrada_en: '2026-10-15T12:40:00Z',
  entregado_en: null,
  entrega_estimada: false,
  seguimiento: 'en_vivo', // el servidor puede mandarlo: la web no lo lee
  ...extra,
})

describe('traslados: contrato', () => {
  it('pide /api/seguimiento/traslados (el prefijo que reenvía esta web) y lee cada campo', async () => {
    const { api, fetchImpl } = montar(() => json(200, { traslados: [crudo()] }))

    const leidos = await api.traslados()

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/seguimiento/traslados')
    expect(leidos).toEqual({
      descartados: 0,
      traslados: [
        {
          idOrden: 9001,
          vin: 'LVTDD24B6VDX00231',
          marca: 'Toyota',
          modelo: 'Corolla',
          color: 'Blanco',
          destino: 'Sede Norte',
          etapa: 'en_camino',
          salidaRegistrada: '2026-10-15T12:40:00Z',
          entregadoEn: null,
          entregaEstimada: false,
        },
      ],
    })
  })

  it('lo que el servidor puede dejar vacío se lee como nulo (y una entrega sin el campo «estimada» se supone medida)', async () => {
    const { api } = montar(() =>
      json(200, { traslados: [{ id_orden: 1, vin: 'V1', etapa: 'en_planta' }] }),
    )
    expect((await api.traslados()).traslados[0]).toEqual({
      idOrden: 1,
      vin: 'V1',
      marca: null,
      modelo: null,
      color: null,
      destino: null,
      etapa: 'en_planta',
      salidaRegistrada: null,
      entregadoEn: null,
      entregaEstimada: false,
    })
  })

  it('un traslado con datos inválidos o una etapa que no se conoce se salta y se cuenta, sin vaciar el resto', async () => {
    const { api } = montar(() =>
      json(200, {
        traslados: [crudo({ id_orden: 1 }), crudo({ id_orden: 'x' }), crudo({ id_orden: 3, etapa: 'perdido' }), crudo({ id_orden: 4, vin: '' }), null, crudo({ id_orden: 6 })],
      }),
    )

    const leidos = await api.traslados()

    expect(leidos.traslados.map((t) => t.idOrden)).toEqual([1, 6])
    expect(leidos.descartados).toBe(4)
  })

  it('una lista vacía es válida', async () => {
    const { api } = montar(() => json(200, { traslados: [] }))
    expect(await api.traslados()).toEqual({ traslados: [], descartados: 0 })
  })

  it('el seguimiento por GPS que el servidor mande (en vivo, última ubicación, sin seguimiento) no llega a la interfaz', async () => {
    for (const seguimiento of ['en_vivo', 'ultima_ubicacion', 'sin_seguimiento', null]) {
      const { api } = montar(() => json(200, { traslados: [crudo({ seguimiento })] }))
      const [traslado] = (await api.traslados()).traslados
      expect(traslado).not.toHaveProperty('seguimiento')
      expect(JSON.stringify(traslado)).not.toMatch(/en_vivo|ultima_ubicacion|sin_seguimiento/)
    }
  })

  it('un dato interno que el servidor mande de más (conductor, velocidad, fotos) no llega a la interfaz', async () => {
    const { api } = montar(() =>
      json(200, { traslados: [crudo({ conductor: { username: '44121694' }, velocidad: 88, fotos: ['traslado/a.jpg'], placa: 'EEB190' })] }),
    )

    const [traslado] = (await api.traslados()).traslados
    const texto = JSON.stringify(traslado)

    expect(texto).not.toContain('44121694')
    expect(texto).not.toContain('88')
    expect(texto).not.toContain('traslado/a.jpg')
    expect(texto).not.toContain('EEB190')
  })

  it('una respuesta que no es una lista de traslados es un error 502, no una red caída', async () => {
    for (const cuerpo of [{ otra: 1 }, { traslados: 'no' }, null, []]) {
      const { api } = montar(() => json(200, cuerpo))
      const error = await api.traslados().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(502)
    }
  })

  it('sin red lanza un ApiError sin estado', async () => {
    const { api } = montar(() => {
      throw new TypeError('fallo de red')
    })
    const error = await api.traslados().catch((e: unknown) => e)
    expect((error as ApiError).isNetwork).toBe(true)
  })
})

describe('guarda · la política de 403 está en toda función del módulo', () => {
  it('un 403 NO cierra la sesión: llega como ApiError 403 y la sesión sigue', async () => {
    const { api, limpiarSesion } = montar(() => json(403, { detail: 'Permisos insuficientes' }))

    const error = await api.traslados().catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(403)
    expect((error as ApiError).message).toBe('Permisos insuficientes')
    expect(limpiarSesion).not.toHaveBeenCalled()
  })

  it('un 401 sí pide renovar la sesión (y, vencida, la cierra)', async () => {
    const { api, limpiarSesion } = montar(() => json(401, { detail: 'Token invalido o expirado' }))
    await api.traslados().catch(() => undefined)
    expect(limpiarSesion).toHaveBeenCalledTimes(1)
  })
})

describe('consulta masiva de VIN: contrato', () => {
  const VIN_A = 'LVTDD24B6VDX00231'
  const VIN_B = 'KMHJB81B1PU123456'

  it('hace un POST a /api/seguimiento/consulta-vines con los VIN en el cuerpo', async () => {
    const { api, fetchImpl } = montar(() => json(200, { resultados: [] }))

    await api.consultarVines([VIN_A, VIN_B])

    const [ruta, init] = fetchImpl.mock.calls[0]!
    expect(ruta).toBe('/api/seguimiento/consulta-vines')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ vines: [VIN_A, VIN_B] })
  })

  it('lee un VIN con información (con su traslado) y uno pendiente, en el orden recibido', async () => {
    const { api } = montar(() =>
      json(200, {
        resultados: [
          { vin: VIN_B, informacion: 'pendiente', traslado: null },
          { vin: VIN_A, informacion: 'disponible', traslado: crudo({ vin: VIN_A }) },
        ],
      }),
    )

    const leidos = await api.consultarVines([VIN_B, VIN_A])

    expect(leidos.descartados).toBe(0)
    expect(leidos.resultados.map((r) => [r.vin, r.informacion])).toEqual([
      [VIN_B, 'pendiente'],
      [VIN_A, 'disponible'],
    ])
    const [, con] = leidos.resultados
    expect(con?.informacion === 'disponible' && con.traslado).toMatchObject({ idOrden: 9001, vin: VIN_A, etapa: 'en_camino', destino: 'Sede Norte' })
  })

  it('un VIN «disponible» cuya orden llega anulada se muestra como pendiente: no se enseña lo anulado', async () => {
    const { api } = montar(() => json(200, { resultados: [{ vin: VIN_A, informacion: 'disponible', traslado: crudo({ etapa: 'anulado' }) }] }))
    expect((await api.consultarVines([VIN_A])).resultados).toEqual([{ vin: VIN_A, informacion: 'pendiente' }])
  })

  it.each(['PLANETA', 'Satelital', 'SATELITAL'])('un VIN «disponible» cuyo destino es «%s» se muestra como pendiente: no se enseña un destino oculto', async (destino) => {
    const { api } = montar(() => json(200, { resultados: [{ vin: VIN_A, informacion: 'disponible', traslado: crudo({ destino }) }] }))
    expect((await api.consultarVines([VIN_A])).resultados).toEqual([{ vin: VIN_A, informacion: 'pendiente' }])
  })

  it('en la misma consulta, el de un destino oculto sale pendiente y los demás con su información, en el mismo orden', async () => {
    const { api } = montar(() =>
      json(200, {
        resultados: [
          { vin: VIN_A, informacion: 'disponible', traslado: crudo({ destino: 'Sede Norte' }) },
          { vin: VIN_B, informacion: 'disponible', traslado: crudo({ id_orden: 9002, vin: VIN_B, destino: 'PLANETA' }) },
        ],
      }),
    )
    const { resultados } = await api.consultarVines([VIN_A, VIN_B])
    expect(resultados.map((r) => [r.vin, r.informacion])).toEqual([
      [VIN_A, 'disponible'],
      [VIN_B, 'pendiente'],
    ])
  })

  it('un VIN «disponible» sin traslado válido se muestra como pendiente (no se pierde el VIN)', async () => {
    const { api } = montar(() =>
      json(200, {
        resultados: [
          { vin: VIN_A, informacion: 'disponible', traslado: null },
          { vin: VIN_B, informacion: 'disponible', traslado: { id_orden: 'x' } },
        ],
      }),
    )
    const { resultados } = await api.consultarVines([VIN_A, VIN_B])
    expect(resultados.map((r) => r.informacion)).toEqual(['pendiente', 'pendiente'])
  })

  it('un VIN «pendiente» nunca lleva traslado, aunque el servidor lo mande: no se enseña lo que no corresponde', async () => {
    const { api } = montar(() => json(200, { resultados: [{ vin: VIN_A, informacion: 'pendiente', traslado: crudo({ vin: VIN_A }) }] }))
    expect((await api.consultarVines([VIN_A])).resultados).toEqual([{ vin: VIN_A, informacion: 'pendiente' }])
  })

  it('un resultado con datos inválidos se salta y se cuenta, sin vaciar el resto', async () => {
    const { api } = montar(() =>
      json(200, { resultados: [{ vin: VIN_A, informacion: 'pendiente' }, { vin: '', informacion: 'pendiente' }, { vin: VIN_B, informacion: 'rara' }, null, { vin: VIN_B, informacion: 'pendiente' }] }),
    )
    const leidos = await api.consultarVines([VIN_A, VIN_B])
    expect(leidos.resultados.map((r) => r.vin)).toEqual([VIN_A, VIN_B])
    expect(leidos.descartados).toBe(3)
  })

  it('un dato interno de más (conductor, velocidad) no llega a la interfaz', async () => {
    const { api } = montar(() =>
      json(200, { resultados: [{ vin: VIN_A, informacion: 'disponible', conductor: 'Juan Secreto', traslado: crudo({ vin: VIN_A, conductor: 'Juan Secreto', velocidad: 88 }) }] }),
    )
    expect(JSON.stringify(await api.consultarVines([VIN_A]))).not.toMatch(/Juan Secreto|88/)
  })

  it('una respuesta que no es una lista de resultados es un error 502, no una red caída', async () => {
    for (const cuerpo of [{ otra: 1 }, { resultados: 'no' }, null, []]) {
      const { api } = montar(() => json(200, cuerpo))
      const error = await api.consultarVines([VIN_A]).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(502)
    }
  })

  it('un 403 NO cierra la sesión (la política del módulo), y un 422 llega con su mensaje', async () => {
    const prohibido = montar(() => json(403, { detail: 'Permisos insuficientes' }))
    const error403 = await prohibido.api.consultarVines([VIN_A]).catch((e: unknown) => e)
    expect((error403 as ApiError).status).toBe(403)
    expect(prohibido.limpiarSesion).not.toHaveBeenCalled()

    const grande = montar(() => json(422, { detail: 'demasiados' }))
    const error422 = await grande.api.consultarVines([VIN_A]).catch((e: unknown) => e)
    expect((error422 as ApiError).status).toBe(422)
  })

  it('un 401 sí pide renovar la sesión (y, vencida, la cierra)', async () => {
    const { api, limpiarSesion } = montar(() => json(401, { detail: 'Token invalido o expirado' }))
    await api.consultarVines([VIN_A]).catch(() => undefined)
    expect(limpiarSesion).toHaveBeenCalledTimes(1)
  })
})
