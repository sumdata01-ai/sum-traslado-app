// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { crearListaSeguimientoDePrueba, trasladoDePrueba } from './testing/fakes'

const redCaida = () => new ApiError('Sin conexión al backend o internet.')

describe('primera carga', () => {
  it('antes de pedir nada está «cargando» y sin traslados', () => {
    const { lista } = crearListaSeguimientoDePrueba()
    expect(lista.getSnapshot()).toMatchObject({ cargando: true, actualizando: false, traslados: [], actualizadoEn: null, sinPermiso: null })
  })

  it('al iniciar muestra los traslados, deja de cargar y anota cuándo llegaron', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    expect(m.lista.getSnapshot()).toMatchObject({ cargando: false, actualizando: false, sinConexion: false, error: null, actualizadoEn: m.reloj.ahora })
    expect(m.lista.getSnapshot().traslados).toHaveLength(7)
  })

  it('mientras espera al servidor está «actualizando» y todavía «cargando»', async () => {
    const m = crearListaSeguimientoDePrueba()
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))

    const carga = m.lista.iniciar(7)
    expect(m.lista.getSnapshot()).toMatchObject({ cargando: true, actualizando: true })

    abrir()
    await carga
    expect(m.lista.getSnapshot()).toMatchObject({ cargando: false, actualizando: false })
  })

  it('cuenta los traslados que el servidor mandó inválidos', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.descartados = 2
    await m.lista.iniciar(7)
    expect(m.lista.getSnapshot().descartados).toBe(2)
  })

  it('avisa a quien escucha en cada cambio, y deja de avisar al darse de baja', async () => {
    const m = crearListaSeguimientoDePrueba()
    let avisos = 0
    const baja = m.lista.suscribir(() => avisos++)
    await m.lista.iniciar(7)
    expect(avisos).toBeGreaterThanOrEqual(2) // actualizando y luego el resultado
    baja()
    const antes = avisos
    await m.lista.actualizar()
    expect(avisos).toBe(antes)
  })
})

describe('una sola petición a la vez', () => {
  it('dos actualizaciones seguidas piden una sola vez', async () => {
    const m = crearListaSeguimientoDePrueba()
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))

    const a = m.lista.actualizar()
    const b = m.lista.actualizar()
    abrir()
    await Promise.all([a, b])

    expect(m.estado.llamadas).toBe(1)
  })

  it('terminada una, la siguiente sí pide de nuevo', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.actualizar()
    await m.lista.actualizar()
    expect(m.estado.llamadas).toBe(2)
  })
})

describe('un fallo nunca vacía lo que se muestra', () => {
  it('sin red: avisa «sin conexión» y conserva los traslados y la hora de la última lista', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    const antes = m.lista.getSnapshot()
    m.reloj.ahora += 120_000
    m.estado.fallo = redCaida()

    await m.lista.actualizar()

    expect(m.lista.getSnapshot()).toMatchObject({ sinConexion: true, error: null, actualizadoEn: antes.actualizadoEn })
    expect(m.lista.getSnapshot().traslados).toEqual(antes.traslados)
  })

  it('un error del servidor se dice con su mensaje y conserva lo que había', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    m.estado.fallo = new ApiError('No se pudieron traer los traslados.', { status: 500 })

    await m.lista.actualizar()

    expect(m.lista.getSnapshot()).toMatchObject({ error: 'No se pudieron traer los traslados.', sinConexion: false })
    expect(m.lista.getSnapshot().traslados).toHaveLength(7)
  })

  it('un error que no es de la API tiene mensaje propio', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.fallo = new Error('algo raro')
    await m.lista.iniciar(7)
    expect(m.lista.getSnapshot().error).toBe('No se pudieron traer los traslados.')
  })

  it('sin red en la primera carga: deja de «cargar», queda vacía y lo dice', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.fallo = redCaida()
    await m.lista.iniciar(7)
    expect(m.lista.getSnapshot()).toMatchObject({ cargando: false, sinConexion: true, traslados: [] })
  })

  it('al volver la red, la siguiente actualización quita el aviso y trae lo nuevo', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.fallo = redCaida()
    await m.lista.iniciar(7)
    await m.lista.actualizar()
    expect(m.lista.getSnapshot()).toMatchObject({ sinConexion: false, error: null })
    expect(m.lista.getSnapshot().traslados).toHaveLength(7)
  })
})

describe('403 · sin permiso', () => {
  it('muestra «sin permiso» con el mensaje del servidor, y NO conserva traslados', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    m.estado.fallo = new ApiError('Permisos insuficientes', { status: 403 })

    await m.lista.actualizar()

    expect(m.lista.getSnapshot()).toMatchObject({ sinPermiso: { mensaje: 'Permisos insuficientes' }, error: null, sinConexion: false, traslados: [] })
  })

  it('un permiso que vuelve quita el aviso', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.fallo = new ApiError('Permisos insuficientes', { status: 403 })
    await m.lista.iniciar(7)
    await m.lista.actualizar()
    expect(m.lista.getSnapshot().sinPermiso).toBeNull()
    expect(m.lista.getSnapshot().traslados).toHaveLength(7)
  })
})

describe('los datos son de quien inició sesión', () => {
  it('si entra otra persona, lo de la anterior se vacía antes de pedir lo nuevo', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))

    const carga = m.lista.iniciar(8)

    expect(m.lista.getSnapshot()).toMatchObject({ cargando: true, traslados: [] }) // nada de la persona 7
    abrir()
    await carga
    expect(m.lista.getSnapshot().traslados).toHaveLength(7)
  })

  it('la misma persona que vuelve a abrir la pantalla conserva lo que ya veía mientras llega lo nuevo', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))

    const carga = m.lista.iniciar(7)

    expect(m.lista.getSnapshot().traslados).toHaveLength(7)
    abrir()
    await carga
  })

  it('un token sin id de usuario no hereda nada: se vacía siempre', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(null)
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))

    const carga = m.lista.iniciar(null)

    expect(m.lista.getSnapshot().traslados).toEqual([])
    abrir()
    await carga
  })

  it('vaciar (cerrar sesión) deja todo como al principio', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    m.lista.vaciar()
    expect(m.lista.getSnapshot()).toMatchObject({ cargando: true, traslados: [], actualizadoEn: null, sinConexion: false, error: null })
  })

  it('una respuesta que llega DESPUÉS de vaciar no resucita los datos de la persona anterior', async () => {
    const m = crearListaSeguimientoDePrueba()
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))

    const carga = m.lista.iniciar(7)
    m.lista.vaciar()
    abrir()
    await carga

    expect(m.lista.getSnapshot().traslados).toEqual([])
  })

  it('una respuesta que llega DESPUÉS de liberar (se cerró la pantalla) se descarta', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 1 })])
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))

    const carga = m.lista.iniciar(7)
    m.lista.liberar()
    abrir()
    await carga

    expect(m.lista.getSnapshot()).toMatchObject({ traslados: [], actualizando: false })
  })
})

describe('consulta masiva de VIN', () => {
  it('pide los VIN a la API y devuelve su respuesta', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ vin: 'LVTDD24B6VDX00231', etapa: 'en_camino' })])
    const { resultados } = await m.lista.consultarVines(['LVTDD24B6VDX00231', 'LVTDD24B6VDX99999'])
    expect(m.estado.consultas).toEqual([['LVTDD24B6VDX00231', 'LVTDD24B6VDX99999']])
    expect(resultados.map((r) => r.informacion)).toEqual(['disponible', 'pendiente'])
  })

  it('no toca la lista: ni la vacía, ni la actualiza, ni cuenta como una carga', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    const antes = m.lista.getSnapshot()
    const llamadas = m.estado.llamadas

    await m.lista.consultarVines(['LVTDD24B6VDX00231'])

    expect(m.lista.getSnapshot()).toBe(antes)
    expect(m.estado.llamadas).toBe(llamadas)
  })

  it('un fallo (incluido un 403) llega a quien consulta y NO pone la lista en «sin permiso»', async () => {
    const m = crearListaSeguimientoDePrueba()
    await m.lista.iniciar(7)
    m.estado.falloConsulta = new ApiError('Permisos insuficientes', { status: 403 })

    await expect(m.lista.consultarVines(['LVTDD24B6VDX00231'])).rejects.toMatchObject({ status: 403 })

    expect(m.lista.getSnapshot().sinPermiso).toBeNull()
    expect(m.lista.getSnapshot().traslados).toHaveLength(7)
  })
})
