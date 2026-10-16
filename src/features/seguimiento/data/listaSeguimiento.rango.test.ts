import { describe, expect, it } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { ListaSeguimiento } from './listaSeguimiento'
import { crearListaSeguimientoDePrueba, crearSeguimientoApiDePrueba, trasladoDePrueba } from './testing/fakes'

// El reloj de las pruebas es el 15 oct 2026, 12:00 UTC = 07:00 en Lima: hoy es 2026-10-15.
const HOY = { desde: '2026-10-15', hasta: '2026-10-15' }
const AYER = { desde: '2026-10-14', hasta: '2026-10-14' }

/** Una puerta que se abre a mano, para controlar cuándo contesta el servidor falso. */
function puerta() {
  let abrir: () => void = () => undefined
  const espera = new Promise<void>((resolver) => (abrir = resolver))
  return { espera, abrir }
}

describe('el filtro por fecha de la lista', () => {
  it('empieza en «hoy» (día de Lima), antes y después de pedir nada', async () => {
    const { lista, estado } = crearListaSeguimientoDePrueba()
    expect(lista.getSnapshot().rango).toEqual(HOY)

    await lista.iniciar(7)

    expect(estado.rangos).toEqual([HOY])
    expect(lista.getSnapshot().rango).toEqual(HOY)
  })

  it('«hoy» es el de Lima aunque en UTC ya sea otro día: a las 22:00 de Lima sigue siendo el mismo', async () => {
    const { api, estado } = crearSeguimientoApiDePrueba()
    // 03:00 UTC del 16 son las 22:00 del 15 en Lima.
    const lista = new ListaSeguimiento({ api, reloj: () => Date.parse('2026-10-16T03:00:00Z') })

    expect(lista.getSnapshot().rango).toEqual(HOY)
    await lista.iniciar(7)

    expect(estado.rangos).toEqual([HOY])
  })

  it('aplicarRango pide ese rango al servidor, vacía lo mostrado mientras llega y luego muestra lo nuevo', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    await m.lista.iniciar(7)
    expect(m.lista.getSnapshot().traslados).toHaveLength(1)

    const p = puerta()
    m.estado.puerta = p.espera
    m.estado.traslados = [trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000X00002' })]
    const pedido = m.lista.aplicarRango(AYER)

    // Mientras espera: ya no se ve lo de «hoy» bajo el rótulo de «ayer».
    expect(m.lista.getSnapshot()).toMatchObject({ rango: AYER, cargando: true, traslados: [], actualizadoEn: null })

    p.abrir()
    expect(await pedido).toBeNull()

    expect(m.estado.rangos).toEqual([HOY, AYER])
    expect(m.lista.getSnapshot()).toMatchObject({ rango: AYER, cargando: false })
    expect(m.lista.getSnapshot().traslados.map((t) => t.idOrden)).toEqual([2])
  })

  it('lo que contesta tarde del rango anterior se descarta: no pisa el rango nuevo', async () => {
    const m = crearListaSeguimientoDePrueba()
    const primera = puerta()
    m.estado.puerta = primera.espera
    m.estado.traslados = [trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000X00001' })]
    const inicio = m.lista.iniciar(7) // pide «hoy» y se queda esperando

    const segunda = puerta()
    m.estado.puerta = segunda.espera
    m.estado.traslados = [trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000X00002' })]
    const aplicado = m.lista.aplicarRango(AYER)

    // Contesta primero la del segundo rango y DESPUÉS la vieja, que esta vez FALLA: si se la tomara en cuenta, pisaría lo nuevo con un error.
    segunda.abrir()
    await aplicado
    m.estado.fallo = new ApiError('Contestó tarde y mal.', { status: 500 })
    primera.abrir()
    await inicio

    expect(m.lista.getSnapshot().rango).toEqual(AYER)
    expect(m.lista.getSnapshot().traslados.map((t) => t.idOrden)).toEqual([2])
    expect(m.lista.getSnapshot().error).toBeNull()
    expect(m.lista.getSnapshot().actualizando).toBe(false)
  })

  it('«Actualizar» pide de nuevo el mismo rango y no vacía nada', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    await m.lista.iniciar(7)
    await m.lista.aplicarRango(AYER)

    const p = puerta()
    m.estado.puerta = p.espera
    const actualizacion = m.lista.actualizar()
    expect(m.lista.getSnapshot().traslados).toHaveLength(1) // sigue a la vista
    p.abrir()
    await actualizacion

    expect(m.estado.rangos).toEqual([HOY, AYER, AYER])
  })

  it('aplicar el mismo rango que ya se muestra solo actualiza: no vacía lo mostrado', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    await m.lista.iniciar(7)

    const p = puerta()
    m.estado.puerta = p.espera
    const pedido = m.lista.aplicarRango(HOY)
    expect(m.lista.getSnapshot()).toMatchObject({ cargando: false, actualizando: true })
    expect(m.lista.getSnapshot().traslados).toHaveLength(1)
    p.abrir()
    await pedido

    expect(m.estado.rangos).toEqual([HOY, HOY])
  })

  it.each([
    ['con el fin en el futuro', { desde: '2026-10-15', hasta: '2026-10-16' }, 'La fecha de fin no puede ser futura.'],
    ['al revés', { desde: '2026-10-15', hasta: '2026-10-14' }, 'La fecha de inicio no puede ser posterior a la de fin.'],
    ['de más de 90 días', { desde: '2026-07-01', hasta: '2026-10-15' }, 'El rango no puede pasar de 90 días.'],
    ['sin una de las fechas', { desde: '', hasta: '2026-10-15' }, 'Elige las dos fechas.'],
  ])('un rango %s no se pide al servidor y devuelve el motivo', async (_caso, rango, motivo) => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    await m.lista.iniciar(7)

    expect(await m.lista.aplicarRango(rango)).toBe(motivo)

    expect(m.estado.rangos).toEqual([HOY]) // ninguna petición nueva
    expect(m.lista.getSnapshot()).toMatchObject({ rango: HOY })
    expect(m.lista.getSnapshot().traslados).toHaveLength(1) // y lo mostrado sigue ahí
  })

  it('si el rango nuevo falla, no se muestra lo del rango anterior: queda vacío y con el aviso', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    await m.lista.iniciar(7)

    m.estado.fallo = new ApiError('El servidor no pudo.', { status: 500 })
    await m.lista.aplicarRango(AYER)

    expect(m.lista.getSnapshot()).toMatchObject({ rango: AYER, traslados: [], error: 'El servidor no pudo.', cargando: false })
  })

  it('sin red tampoco: avisa y no deja datos de otro día', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    await m.lista.iniciar(7)

    m.estado.fallo = new ApiError('Sin conexión al backend o internet.') // sin `status`: es un error de red
    await m.lista.aplicarRango(AYER)

    expect(m.lista.getSnapshot()).toMatchObject({ rango: AYER, traslados: [], sinConexion: true })
  })

  it('al volver a abrir la pantalla vuelve a «hoy»', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    await m.lista.aplicarRango(AYER)
    m.lista.liberar()

    await m.lista.iniciar(7)

    expect(m.lista.getSnapshot().rango).toEqual(HOY)
    expect(m.estado.rangos.at(-1)).toEqual(HOY)
  })

  it('«vaciar» (cierre de sesión o cambio de persona) deja el rango en «hoy»', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    await m.lista.aplicarRango(AYER)

    m.lista.vaciar()

    expect(m.lista.getSnapshot()).toMatchObject({ rango: HOY, traslados: [], cargando: true })
  })

  it('una persona distinta no hereda el rango de la anterior', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    await m.lista.aplicarRango(AYER)

    await m.lista.iniciar(8)

    expect(m.lista.getSnapshot().rango).toEqual(HOY)
  })

  it('un 403 con un rango nuevo muestra «sin permiso» y no deja traslados', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    await m.lista.iniciar(7)

    m.estado.fallo = new ApiError('No autorizado', { status: 403 })
    await m.lista.aplicarRango(AYER)

    expect(m.lista.getSnapshot().sinPermiso).not.toBeNull()
    expect(m.lista.getSnapshot().traslados).toEqual([])
  })
})
