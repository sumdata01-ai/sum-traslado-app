// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { DIA_APENDICE, PATIO, PUERTA, crearTableroDePrueba } from './testing/fakes'

const puerta = () => {
  let abrir!: () => void
  const promesa = new Promise<void>((resolve) => {
    abrir = resolve
  })
  return { promesa, abrir }
}

describe('abrir el tablero', () => {
  it('antes de pedir nada está cargando, en el día de hoy de Lima y sin punto', () => {
    const { tablero } = crearTableroDePrueba()
    expect(tablero.getSnapshot()).toMatchObject({ cargando: true, actualizando: false, datos: null, dia: DIA_APENDICE, idPunto: null, actualizadoEn: null })
  })

  it('el día de hoy es el de Lima y no el de UTC', () => {
    const { tablero, reloj } = crearTableroDePrueba()
    reloj.ahora = Date.parse('2026-10-16T03:00:00Z') // todavía es el 15 en Lima
    tablero.vaciar() // vuelve a su estado inicial con el reloj nuevo
    expect(tablero.getSnapshot().dia).toBe('2026-10-15')
  })

  it('iniciar pide las tres lecturas del día de hoy (el punto solo a dos de ellas) y deja los datos', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)

    expect(estado.dia).toEqual([{ dia: DIA_APENDICE, idPunto: null }])
    expect(estado.intentos).toEqual([{ dia: DIA_APENDICE, idPunto: null }])
    expect(estado.puntos).toEqual([{ dia: DIA_APENDICE }]) // el punto no aplica a la ficha
    const s = tablero.getSnapshot()
    expect(s).toMatchObject({ cargando: false, actualizando: false, sinConexion: false, error: null, sinPermiso: null, descartadas: 0 })
    expect(s.datos!.dia.resumen.total).toBe(19)
    expect(s.datos!.intentos.intentos).toHaveLength(9)
    expect(s.datos!.puntos.puntos).toHaveLength(3)
  })

  it('anota cuándo llegó lo último', async () => {
    const { tablero, reloj } = crearTableroDePrueba()
    await tablero.iniciar(7)
    expect(tablero.getSnapshot().actualizadoEn).toBe(reloj.ahora)
  })

  it('mientras llega lo primero está «actualizando» y todavía «cargando»', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    const p = puerta()
    estado.puerta = p.promesa
    const espera = tablero.iniciar(7)
    expect(tablero.getSnapshot()).toMatchObject({ cargando: true, actualizando: true })
    p.abrir()
    await espera
    expect(tablero.getSnapshot()).toMatchObject({ cargando: false, actualizando: false })
  })

  it('suma las filas descartadas de las tres lecturas, cada una', async () => {
    const { tablero, api } = crearTableroDePrueba()
    const { dia, intentos, puntos } = { dia: api.dia, intentos: api.intentos, puntos: api.puntos }
    api.dia = async (c) => ({ ...(await dia(c)), descartadas: 1 })
    api.intentos = async (c) => ({ ...(await intentos(c)), descartados: 10 })
    api.puntos = async (c) => ({ ...(await puntos(c)), descartados: 100 })
    await tablero.iniciar(7)
    expect(tablero.getSnapshot().descartadas).toBe(111)
  })

  it('suma las filas descartadas de las tres lecturas', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    estado.descartadas = 2
    await tablero.iniciar(7)
    expect(tablero.getSnapshot().descartadas).toBe(2)
  })
})

describe('«Actualizar»: solo cuando se pide', () => {
  it('no pide nada por su cuenta', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await new Promise((r) => setTimeout(r, 50))
    expect(estado.dia).toHaveLength(1)
  })

  it('actualizar vuelve a pedir con el mismo día y punto', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirPunto(PATIO)
    await tablero.actualizar()
    expect(estado.dia.at(-1)).toEqual({ dia: DIA_APENDICE, idPunto: PATIO })
  })

  it('una sola petición a la vez: dos «Actualizar» seguidos comparten la misma', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    const p = puerta()
    estado.puerta = p.promesa
    const a = tablero.actualizar()
    const b = tablero.actualizar()
    p.abrir()
    await Promise.all([a, b])
    expect(estado.dia).toHaveLength(1)
  })
})

describe('cambiar el punto y el día', () => {
  it('elegir un punto pide lo de ese punto y los datos son los de ese punto', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirPunto(PUERTA)

    expect(estado.dia.at(-1)).toEqual({ dia: DIA_APENDICE, idPunto: PUERTA })
    expect(estado.intentos.at(-1)).toEqual({ dia: DIA_APENDICE, idPunto: PUERTA })
    const s = tablero.getSnapshot()
    expect(s.idPunto).toBe(PUERTA)
    expect(s.datos!.dia.resumen.total).toBe(3)
    expect(s.datos!.dia.idPunto).toBe(PUERTA)
  })

  it('volver a «todos» (null) pide todo de nuevo', async () => {
    const { tablero } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirPunto(PUERTA)
    await tablero.elegirPunto(null)
    expect(tablero.getSnapshot().datos!.dia.resumen.total).toBe(19)
  })

  it('elegir el mismo punto no pide nada', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirPunto(null)
    await tablero.elegirPunto(PATIO)
    await tablero.elegirPunto(PATIO)
    expect(estado.dia).toHaveLength(2)
  })

  it('elegir otro día pide lo de ese día', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirDia('2026-10-14')
    expect(estado.dia.at(-1)).toEqual({ dia: '2026-10-14', idPunto: null })
    expect(estado.puntos.at(-1)).toEqual({ dia: '2026-10-14' })
    const s = tablero.getSnapshot()
    expect(s.dia).toBe('2026-10-14')
    expect(s.datos!.dia.resumen.total).toBe(0)
    expect(s.datos!.puntos.puntos.every((p) => p.llegadasDia === 0)).toBe(true)
  })

  it.each([
    ['uno futuro', '2026-10-16'],
    ['de más de 90 días', '2026-07-16'],
    ['un texto que no es un día', 'ayer'],
    ['una fecha que no existe', '2026-02-31'],
  ])('un día que no se puede consultar (%s) se ignora sin pedir nada', async (_caso, dia) => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirDia(dia)
    expect(estado.dia).toHaveLength(1)
    expect(tablero.getSnapshot().dia).toBe(DIA_APENDICE)
  })

  it('el día 90 hacia atrás todavía se puede', async () => {
    const { tablero } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirDia('2026-07-17')
    expect(tablero.getSnapshot().dia).toBe('2026-07-17')
  })

  it('al cambiar de día o de punto se conserva lo anterior mientras llega lo nuevo', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    const p = puerta()
    estado.puerta = p.promesa
    const espera = tablero.elegirPunto(PUERTA)
    const mientras = tablero.getSnapshot()
    expect(mientras).toMatchObject({ actualizando: true, idPunto: PUERTA })
    expect(mientras.datos!.dia.resumen.total).toBe(19) // todavía lo de «todos»
    p.abrir()
    await espera
    expect(tablero.getSnapshot().datos!.dia.resumen.total).toBe(3)
  })

  it('lo que llega tarde de un punto anterior se descarta', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    const lenta = puerta()
    estado.puerta = lenta.promesa
    const primera = tablero.elegirPunto(PATIO) // se queda esperando
    estado.puerta = null
    await tablero.elegirPunto(PUERTA) // la segunda llega primero
    lenta.abrir()
    await primera
    const s = tablero.getSnapshot()
    expect(s.idPunto).toBe(PUERTA)
    expect(s.datos!.dia.idPunto).toBe(PUERTA)
    expect(s.actualizando).toBe(false)
  })
})

describe('fallos', () => {
  it('sin red: lo último sigue a la vista y se avisa', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    estado.fallo = new ApiError('Sin conexión al backend o internet.')
    await tablero.actualizar()
    const s = tablero.getSnapshot()
    expect(s).toMatchObject({ sinConexion: true, error: null, actualizando: false })
    expect(s.datos!.dia.resumen.total).toBe(19)
  })

  it('la primera carga sin red: no hay datos, y deja de estar «cargando»', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    estado.fallo = new ApiError('Sin conexión al backend o internet.')
    await tablero.iniciar(7)
    expect(tablero.getSnapshot()).toMatchObject({ cargando: false, sinConexion: true, datos: null })
  })

  it('un error del servidor: el mensaje se muestra y lo último no se borra', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    estado.fallo = new ApiError('Error interno.', { status: 500 })
    await tablero.actualizar()
    const s = tablero.getSnapshot()
    expect(s.error).toBe('Error interno.')
    expect(s.datos!.dia.resumen.total).toBe(19)
  })

  it('un fallo que no es del cliente HTTP usa un texto de respaldo', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    estado.fallo = new Error('boom')
    await tablero.iniciar(7)
    expect(tablero.getSnapshot().error).toBe('No se pudo traer el tablero.')
  })

  it('una actualización buena después limpia los avisos', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    estado.fallo = new ApiError('Sin conexión al backend o internet.')
    await tablero.actualizar()
    await tablero.actualizar()
    expect(tablero.getSnapshot()).toMatchObject({ sinConexion: false, error: null })
  })

  it('403: «sin permiso» con el mensaje del servidor, y NO se conserva nada de lo anterior', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    estado.fallo = new ApiError('Permisos insuficientes', { status: 403 })
    await tablero.actualizar()
    expect(tablero.getSnapshot()).toMatchObject({ sinPermiso: { mensaje: 'Permisos insuficientes' }, datos: null, descartadas: 0, cargando: false })
  })

  it('cualquiera de las tres lecturas que falle hace fallar la actualización entera (no se mezclan días)', async () => {
    const { tablero, api, estado } = crearTableroDePrueba()
    const intentos = api.intentos
    api.intentos = async (c) => {
      await intentos(c)
      throw new ApiError('Error interno.', { status: 500 })
    }
    await tablero.iniciar(7)
    expect(estado.dia).toHaveLength(1)
    expect(tablero.getSnapshot()).toMatchObject({ error: 'Error interno.', datos: null })
  })
})

describe('cambio de persona y cierre de sesión', () => {
  it('vaciar no deja nada de la persona anterior', async () => {
    const { tablero } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirPunto(PUERTA)
    tablero.vaciar()
    expect(tablero.getSnapshot()).toMatchObject({ cargando: true, datos: null, idPunto: null, dia: DIA_APENDICE, actualizadoEn: null })
  })

  it('entrar otra persona vacía lo de la anterior antes de pedir', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    await tablero.elegirPunto(PUERTA)
    const p = puerta()
    estado.puerta = p.promesa
    const espera = tablero.iniciar(8)
    expect(tablero.getSnapshot()).toMatchObject({ datos: null, idPunto: null })
    p.abrir()
    await espera
  })

  it('la misma persona conserva lo que ve mientras pide', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    const p = puerta()
    estado.puerta = p.promesa
    const espera = tablero.iniciar(7)
    expect(tablero.getSnapshot().datos).not.toBeNull()
    p.abrir()
    await espera
  })

  it('un token sin id de usuario (null) nunca conserva lo anterior', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(null)
    const p = puerta()
    estado.puerta = p.promesa
    const espera = tablero.iniciar(null)
    expect(tablero.getSnapshot().datos).toBeNull()
    p.abrir()
    await espera
  })

  it('lo que llega después de vaciar se descarta', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    const p = puerta()
    estado.puerta = p.promesa
    const espera = tablero.iniciar(7)
    tablero.vaciar()
    p.abrir()
    await espera
    expect(tablero.getSnapshot().datos).toBeNull()
  })

  it('liberar (la pantalla se cerró) descarta lo que llegue y no toca lo mostrado', async () => {
    const { tablero, estado } = crearTableroDePrueba()
    await tablero.iniciar(7)
    const p = puerta()
    estado.puerta = p.promesa
    estado.fallo = new ApiError('Error interno.', { status: 500 })
    const espera = tablero.actualizar()
    tablero.liberar()
    expect(tablero.getSnapshot().actualizando).toBe(false)
    p.abrir()
    await espera
    expect(tablero.getSnapshot()).toMatchObject({ error: null }) // el fallo tardío no se muestra
    expect(tablero.getSnapshot().datos).not.toBeNull()
  })
})

describe('el store', () => {
  it('avisa a quien se suscribe, entrega instantáneas nuevas y deja de avisar al darse de baja', async () => {
    const { tablero } = crearTableroDePrueba()
    let avisos = 0
    const baja = tablero.suscribir(() => avisos++)
    const antes = tablero.getSnapshot()
    await tablero.iniciar(7)
    expect(avisos).toBeGreaterThan(0)
    expect(tablero.getSnapshot()).not.toBe(antes)
    expect(tablero.getSnapshot()).toBe(tablero.getSnapshot())
    baja()
    const contados = avisos
    await tablero.actualizar()
    expect(avisos).toBe(contados)
  })
})

describe('«hoy» para el selector de día', () => {
  it('es el de Lima y se renueva con cada petición', async () => {
    const { tablero, reloj } = crearTableroDePrueba()
    expect(tablero.getSnapshot().hoy).toBe('2026-10-15')
    reloj.ahora = Date.parse('2026-10-16T06:00:00Z') // pasó la medianoche de Lima
    await tablero.iniciar(7)
    expect(tablero.getSnapshot().hoy).toBe('2026-10-16')
  })
})
