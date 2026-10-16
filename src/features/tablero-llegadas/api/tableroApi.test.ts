// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { createApiClient } from '@/core/http/apiClient'
import { OPCIONES_TABLERO, crearTableroApi } from './tableroApi'

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(respuesta: (url: string) => Response | Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => respuesta(String(url)))
  const limpiarSesion = vi.fn()
  const cliente = createApiClient({ getToken: () => 'token', refreshSession: async () => 'expirada', limpiarSesion, fetchImpl })
  return { api: crearTableroApi(cliente), fetchImpl, limpiarSesion }
}

const conductor = { id_usuario: 101, username: 'op.demo01', nombre: 'Conductor 01' }
const llegada = (extra: Record<string, unknown> = {}) => ({
  id_llegada: 8,
  turno: 8,
  punto: { id_punto: 1, nombre: 'Patio de llegada', radio_m: 100, precision_max_m: 100 },
  conductor,
  step: 59_735_722,
  hora_oficial: '2026-10-15T13:41:00Z',
  hora_recepcion: '2026-10-15T13:43:20Z',
  demora_s: 140,
  pasos: 4,
  flag: true,
  flags: ['OUT_OF_WINDOW'],
  latitud: -12.0501,
  longitud: -77.0499,
  distancia_m: 27.5,
  pct_radio: 27.5,
  precision_m: 15,
  ...extra,
})
const resumen = { total: 1, por_punto: [{ id_punto: 1, nombre: 'Patio de llegada', total: 1 }], con_flag: 1, rechazados: 2, mediana_demora_s: 140 }
const diaCrudo = (extra: Record<string, unknown> = {}) => ({
  dia: '2026-10-15',
  id_punto: null,
  resumen,
  senales: { con_flag: 1, qr_vencido_repetido: [{ conductor: { id_usuario: 107, username: 'op.demo07', nombre: 'Conductor 07' }, veces: 3 }] },
  llegadas: [llegada()],
  truncado: false,
  ...extra,
})
const intentoCrudo = (extra: Record<string, unknown> = {}) => ({
  id_intento: 52,
  hora_recepcion: '2026-10-15T14:12:44Z',
  conductor: { id_usuario: 107, username: 'op.demo07', nombre: 'Conductor 07' },
  punto: { id_punto: 1, nombre: 'Patio de llegada' },
  motivo: 'fuera_de_tope',
  etiqueta: 'QR demasiado viejo',
  antiguedad_qr_s: 64_920,
  texto_inicio: 'SUM1|1|59734129|dE5a',
  repeticiones_conductor_dia: 3,
  ...extra,
})
const puntoCrudo = (extra: Record<string, unknown> = {}) => ({
  id_punto: 1,
  nombre: 'Patio de llegada',
  activo: true,
  latitud: -12.05,
  longitud: -77.05,
  radio_m: 100,
  precision_max_m: 100,
  peor_caso_m: 200,
  llegadas_dia: 16,
  ultimo_escaneo: '2026-10-15T16:40:35Z',
  ...extra,
})

describe('las rutas y los parámetros', () => {
  it('dia: pide /api/llegada-qr/dia (el prefijo que reenvía esta web) con el token', async () => {
    const { api, fetchImpl } = montar(() => json(200, diaCrudo()))
    await api.dia({ dia: '2026-10-15', idPunto: 1 })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('/api/llegada-qr/dia?dia=2026-10-15&id_punto=1')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
  })

  it('intentos: /api/llegada-qr/intentos', async () => {
    const { api, fetchImpl } = montar(() => json(200, { dia: '2026-10-15', id_punto: null, intentos: [], truncado: false }))
    await api.intentos({ dia: '2026-10-14' })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/llegada-qr/intentos?dia=2026-10-14')
  })

  it('puntos: /api/llegada-qr/puntos solo con el día (el punto no aplica)', async () => {
    const { api, fetchImpl } = montar(() => json(200, { dia: '2026-10-15', puntos: [] }))
    await api.puntos({ dia: '2026-10-15' })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/llegada-qr/puntos?dia=2026-10-15')
  })

  it('puntos nunca manda el punto, aunque se le pase', async () => {
    const { api, fetchImpl } = montar(() => json(200, { dia: '2026-10-15', puntos: [] }))
    await api.puntos({ dia: '2026-10-15', idPunto: 2 } as { dia: string })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/llegada-qr/puntos?dia=2026-10-15')
  })

  it('sin día ni punto no manda parámetros (el servidor usa hoy y todos)', async () => {
    const { api, fetchImpl } = montar(() => json(200, diaCrudo()))
    await api.dia()
    await api.dia({ idPunto: null })
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['/api/llegada-qr/dia', '/api/llegada-qr/dia'])
  })

  it('el punto 0 o un id cualquiera se manda tal cual; solo null y undefined se omiten', async () => {
    const { api, fetchImpl } = montar(() => json(200, diaCrudo()))
    await api.dia({ idPunto: 0 })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/llegada-qr/dia?id_punto=0')
  })
})

describe('dia: lo que se lee', () => {
  it('cada campo de una llegada, resumen y señales', async () => {
    const { api } = montar(() => json(200, diaCrudo()))
    const { dia, descartadas } = await api.dia()
    expect(descartadas).toBe(0)
    expect(dia).toMatchObject({
      dia: '2026-10-15',
      idPunto: null,
      truncado: false,
      resumen: { total: 1, conFlag: 1, rechazados: 2, medianaDemoraS: 140, porPunto: [{ idPunto: 1, nombre: 'Patio de llegada', total: 1 }] },
      senales: { conFlag: 1, qrVencidoRepetido: [{ veces: 3, conductor: { idUsuario: 107, username: 'op.demo07', nombre: 'Conductor 07' } }] },
    })
    expect(dia.llegadas[0]).toEqual({
      idLlegada: 8,
      turno: 8,
      punto: { idPunto: 1, nombre: 'Patio de llegada', radioM: 100, precisionMaxM: 100 },
      conductor: { idUsuario: 101, username: 'op.demo01', nombre: 'Conductor 01' },
      step: 59_735_722,
      horaOficial: '2026-10-15T13:41:00Z',
      horaRecepcion: '2026-10-15T13:43:20Z',
      demoraS: 140,
      pasos: 4,
      flag: true,
      flags: ['OUT_OF_WINDOW'],
      latitud: -12.0501,
      longitud: -77.0499,
      distanciaM: 27.5,
      pctRadio: 27.5,
      precisionM: 15,
    })
  })

  it('el total y las llegadas con flag son números distintos', async () => {
    const { api } = montar(() => json(200, diaCrudo({ resumen: { ...resumen, total: 19, con_flag: 3 }, senales: { con_flag: 3, qr_vencido_repetido: [] } })))
    const { dia } = await api.dia()
    expect(dia.resumen).toMatchObject({ total: 19, conFlag: 3 })
    expect(dia.senales.conFlag).toBe(3)
  })

  it('el id del punto filtrado', async () => {
    const { api } = montar(() => json(200, diaCrudo({ id_punto: 2 })))
    expect((await api.dia({ idPunto: 2 })).dia.idPunto).toBe(2)
  })

  it('un conductor sin usuario ni nombre llega con nulos', async () => {
    const { api } = montar(() => json(200, diaCrudo({ llegadas: [llegada({ conductor: { id_usuario: 5, username: null } })] })))
    expect((await api.dia()).dia.llegadas[0]!.conductor).toEqual({ idUsuario: 5, username: null, nombre: null })
  })

  it('una llegada mala se salta y se cuenta, no vacía la lista', async () => {
    const malas = [{ id_llegada: 1 }, llegada({ id_llegada: 9, demora_s: 'rápido' }), llegada({ id_llegada: 10, hora_recepcion: '' }), null, 'x']
    const { api } = montar(() => json(200, diaCrudo({ llegadas: [llegada({ id_llegada: 7 }), ...malas, llegada({ id_llegada: 11 })] })))
    const leido = await api.dia()
    expect(leido.dia.llegadas.map((l) => l.idLlegada)).toEqual([7, 11])
    expect(leido.descartadas).toBe(5)
  })

  it('un conductor repetido malo en las señales se salta y se cuenta', async () => {
    const { api } = montar(() => json(200, diaCrudo({ senales: { con_flag: 1, qr_vencido_repetido: [{ conductor, veces: 2 }, { veces: 'dos' }] } })))
    const leido = await api.dia()
    expect(leido.dia.senales.qrVencidoRepetido).toHaveLength(1)
    expect(leido.descartadas).toBe(1)
  })

  it('un campo de más (como un secreto) no llega a la interfaz', async () => {
    const { api } = montar(() => json(200, diaCrudo({ secreto: 'abc', llegadas: [llegada({ secreto: 'abc', payload: 'SUM1|1|1|CODIGOCOMPLETO' })] })))
    const leido = await api.dia()
    expect(JSON.stringify(leido)).not.toMatch(/secreto|CODIGOCOMPLETO|payload/)
  })

  it.each([
    ['no es un objeto', []],
    ['sin llegadas', { ...diaCrudo(), llegadas: undefined }],
    ['sin resumen', { ...diaCrudo(), resumen: undefined }],
    ['resumen malo', { ...diaCrudo(), resumen: { total: 'muchas' } }],
    ['sin señales', { ...diaCrudo(), senales: undefined }],
    ['sin truncado', { ...diaCrudo(), truncado: undefined }],
    ['sin día', { ...diaCrudo(), dia: undefined }],
  ])('una respuesta que %s es un error 502 (no «sin conexión»)', async (_caso, cuerpo) => {
    const { api } = montar(() => json(200, cuerpo))
    await expect(api.dia()).rejects.toMatchObject({ status: 502, message: 'Respuesta inesperada del servidor.' })
  })
})

describe('intentos y puntos: lo que se lee', () => {
  it('un intento con todos sus campos, y con el punto nulo', async () => {
    const { api } = montar(() => json(200, { dia: '2026-10-15', id_punto: null, truncado: true, intentos: [intentoCrudo(), intentoCrudo({ id_intento: 53, punto: null, antiguedad_qr_s: null, motivo: 'payload_ilegible' })] }))
    const { intentos, descartados } = await api.intentos()
    expect(descartados).toBe(0)
    expect(intentos.truncado).toBe(true)
    expect(intentos.intentos[0]).toEqual({
      idIntento: 52,
      horaRecepcion: '2026-10-15T14:12:44Z',
      conductor: { idUsuario: 107, username: 'op.demo07', nombre: 'Conductor 07' },
      punto: { idPunto: 1, nombre: 'Patio de llegada' },
      motivo: 'fuera_de_tope',
      etiqueta: 'QR demasiado viejo',
      antiguedadQrS: 64_920,
      textoInicio: 'SUM1|1|59734129|dE5a',
      repeticionesConductorDia: 3,
    })
    expect(intentos.intentos[1]).toMatchObject({ punto: null, antiguedadQrS: null })
  })

  it('un intento malo se salta y se cuenta', async () => {
    const { api } = montar(() => json(200, { dia: '2026-10-15', id_punto: null, truncado: false, intentos: [intentoCrudo(), { id_intento: 1 }] }))
    const leido = await api.intentos()
    expect(leido.intentos.intentos).toHaveLength(1)
    expect(leido.descartados).toBe(1)
  })

  it('un intento que trae el texto completo no lo deja pasar', async () => {
    const { api } = montar(() => json(200, { dia: '2026-10-15', id_punto: null, truncado: false, intentos: [intentoCrudo({ payload: 'SUM1|1|59734129|FIRMACOMPLETA' })] }))
    expect(JSON.stringify(await api.intentos())).not.toContain('FIRMACOMPLETA')
  })

  it('la ficha de un punto', async () => {
    const { api } = montar(() => json(200, { dia: '2026-10-15', puntos: [puntoCrudo(), puntoCrudo({ id_punto: 3, activo: false, ultimo_escaneo: null }), { id_punto: 'x' }] }))
    const { puntos, descartados } = await api.puntos()
    expect(descartados).toBe(1)
    expect(puntos.puntos[0]).toEqual({
      idPunto: 1,
      nombre: 'Patio de llegada',
      activo: true,
      latitud: -12.05,
      longitud: -77.05,
      radioM: 100,
      precisionMaxM: 100,
      peorCasoM: 200,
      llegadasDia: 16,
      ultimoEscaneo: '2026-10-15T16:40:35Z',
    })
    expect(puntos.puntos[1]).toMatchObject({ idPunto: 3, activo: false, ultimoEscaneo: null })
    expect(JSON.stringify(puntos)).not.toContain('secreto')
  })

  it.each([
    ['intentos', { dia: '2026-10-15' }],
    ['intentos', { dia: '2026-10-15', intentos: [] }],
    ['puntos', { dia: '2026-10-15' }],
    ['puntos', []],
  ])('%s con una forma inesperada es un 502', async (cual, cuerpo) => {
    const { api } = montar(() => json(200, cuerpo))
    const llamada = cual === 'intentos' ? api.intentos() : api.puntos()
    await expect(llamada).rejects.toMatchObject({ status: 502 })
  })
})

describe('errores del servidor', () => {
  it('403 → ApiError 403 y NO cierra la sesión (política de 403 del tablero)', async () => {
    const { api, limpiarSesion } = montar(() => json(403, { detail: 'Permisos insuficientes' }))
    await expect(api.dia()).rejects.toMatchObject({ status: 403, message: 'Permisos insuficientes' })
    await expect(api.intentos()).rejects.toMatchObject({ status: 403 })
    await expect(api.puntos()).rejects.toMatchObject({ status: 403 })
    expect(limpiarSesion).not.toHaveBeenCalled()
  })

  it('prueba de guarda: las tres funciones pasan la política de 403', () => {
    expect(OPCIONES_TABLERO).toEqual({ cerrarSesionEn403: false })
  })

  it('422 → el mensaje del servidor', async () => {
    const { api } = montar(() => json(422, { detail: 'Solo se pueden consultar los últimos 90 días.' }))
    await expect(api.dia({ dia: '2020-01-01' })).rejects.toMatchObject({ status: 422, message: 'Solo se pueden consultar los últimos 90 días.' })
  })

  it('500 → error con su código y un texto de respaldo', async () => {
    const { api } = montar(() => new Response('', { status: 500 }))
    await expect(api.dia()).rejects.toMatchObject({ status: 500, message: 'No se pudieron traer las llegadas.' })
    await expect(api.intentos()).rejects.toMatchObject({ message: 'No se pudieron traer los códigos rechazados.' })
    await expect(api.puntos()).rejects.toMatchObject({ message: 'No se pudieron traer los puntos.' })
  })

  it('sin red → ApiError sin status (el tablero lo muestra como «sin conexión»)', async () => {
    const { api } = montar(() => Promise.reject(new TypeError('Failed to fetch')))
    const error = await api.dia().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isNetwork).toBe(true)
  })
})
