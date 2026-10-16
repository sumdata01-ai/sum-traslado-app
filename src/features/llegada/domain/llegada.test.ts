import { describe, expect, it } from 'vitest'
import { type FixUbicacion, cuerpoDeLlegada, esFixUtil, interpretarRespuestaLlegada, textoDeLlegada } from './llegada'

const AHORA = Date.parse('2026-10-15T19:35:00Z')
const fix = (extra: Partial<FixUbicacion> = {}): FixUbicacion => ({ latitud: -11.9, longitud: -77.1, precisionM: 12, momento: AHORA - 1000, ...extra })

describe('cuerpoDeLlegada', () => {
  it('lleva exactamente cuatro campos y ninguno es una fecha', () => {
    const cuerpo = cuerpoDeLlegada({ payload: 'SUM1|1|59733450|zQG61jRaGQCSUy_8-vyeVQ', latitud: -11.9, longitud: -77.1, precisionM: 12.5 })
    expect(Object.keys(cuerpo).sort()).toEqual(['latitud', 'longitud', 'payload', 'precision_m'])
    expect(cuerpo).toEqual({ payload: 'SUM1|1|59733450|zQG61jRaGQCSUy_8-vyeVQ', latitud: -11.9, longitud: -77.1, precision_m: 12.5 })
  })

  it('manda el texto del QR tal cual: sin recortar y sin cambiar mayúsculas', () => {
    const crudo = ' SUM1|7|59698271|S4eYGtymJsriCiZYxmdpHA\n'
    expect(cuerpoDeLlegada({ payload: crudo, latitud: 0, longitud: 0, precisionM: 1 }).payload).toBe(crudo)
  })
})

describe('interpretarRespuestaLlegada', () => {
  const confirmada = JSON.stringify({ id_llegada: 11, punto: 'Patio de llegada', fecha_llegada: '2026-10-15T14:35:00-05:00', turno: 3, flags: ['OUT_OF_WINDOW'] })

  it('201: llegada nueva, con la hora oficial y el turno', () => {
    expect(interpretarRespuestaLlegada(201, confirmada)).toEqual({
      tipo: 'confirmada',
      yaRegistrada: false,
      llegada: { idLlegada: 11, punto: 'Patio de llegada', fechaLlegada: Date.parse('2026-10-15T19:35:00Z'), turno: 3 },
    })
  })

  it('200: ya estaba registrada, y es lo mismo para quien escanea', () => {
    const r = interpretarRespuestaLlegada(200, confirmada)
    expect(r).toMatchObject({ tipo: 'confirmada', yaRegistrada: true })
  })

  it('no guarda los flags: no hay forma de mostrarlos por descuido', () => {
    const r = interpretarRespuestaLlegada(201, confirmada)
    expect(JSON.stringify(r)).not.toMatch(/OUT_OF_WINDOW|flags/)
  })

  it('una hora sin zona se lee como UTC, no como la hora del teléfono', () => {
    const r = interpretarRespuestaLlegada(201, JSON.stringify({ id_llegada: 1, punto: 'P', fecha_llegada: '2026-10-15T19:35:00', turno: 1 }))
    expect(r).toMatchObject({ llegada: { fechaLlegada: Date.parse('2026-10-15T19:35:00Z') } })
  })

  it.each([
    ['cuerpo que no es JSON', 'no es json'],
    ['sin turno', JSON.stringify({ id_llegada: 1, punto: 'P', fecha_llegada: '2026-10-15T19:35:00Z' })],
    ['turno que no es entero', JSON.stringify({ id_llegada: 1, punto: 'P', fecha_llegada: '2026-10-15T19:35:00Z', turno: 1.5 })],
    ['id que no es entero', JSON.stringify({ id_llegada: '1', punto: 'P', fecha_llegada: '2026-10-15T19:35:00Z', turno: 1 })],
    ['punto que no es texto', JSON.stringify({ id_llegada: 1, punto: 5, fecha_llegada: '2026-10-15T19:35:00Z', turno: 1 })],
    ['fecha ilegible', JSON.stringify({ id_llegada: 1, punto: 'P', fecha_llegada: 'ayer', turno: 1 })],
    ['una lista', '[]'],
  ])('un éxito con %s no se da por confirmado', (_caso, cuerpo) => {
    expect(interpretarRespuestaLlegada(201, cuerpo)).toEqual({ tipo: 'error', status: 201 })
  })

  it('400 INVALID_CODE: código no válido', () => {
    expect(interpretarRespuestaLlegada(400, JSON.stringify({ detail: 'x', code: 'INVALID_CODE' }))).toEqual({ tipo: 'codigoInvalido' })
  })

  it('400 OUT_OF_GEOFENCE fuera_de_zona', () => {
    expect(interpretarRespuestaLlegada(400, JSON.stringify({ code: 'OUT_OF_GEOFENCE', motivo: 'fuera_de_zona' }))).toEqual({ tipo: 'fueraDeZona' })
  })

  it('400 OUT_OF_GEOFENCE precision_insuficiente trae lo que acepta el punto', () => {
    expect(interpretarRespuestaLlegada(400, JSON.stringify({ code: 'OUT_OF_GEOFENCE', motivo: 'precision_insuficiente', precision_max_m: 100 }))).toEqual({
      tipo: 'precisionInsuficiente',
      precisionMaxM: 100,
    })
  })

  it.each([[undefined], [0], [-5], ['100'], [null]])('un precision_max_m inválido (%s) se toma como desconocido', (max) => {
    const cuerpo = JSON.stringify({ code: 'OUT_OF_GEOFENCE', motivo: 'precision_insuficiente', precision_max_m: max })
    expect(interpretarRespuestaLlegada(400, cuerpo)).toEqual({ tipo: 'precisionInsuficiente', precisionMaxM: null })
  })

  it.each([
    ['un motivo que no se conoce', JSON.stringify({ code: 'OUT_OF_GEOFENCE', motivo: 'otro' })],
    ['un code que no se conoce', JSON.stringify({ code: 'OTRO' })],
    ['un 400 sin cuerpo', ''],
    ['un 400 que no es JSON', 'Bad Request'],
  ])('400 con %s: no se adivina qué significa', (_caso, cuerpo) => {
    expect(interpretarRespuestaLlegada(400, cuerpo)).toEqual({ tipo: 'error', status: 400 })
  })

  it('422: ubicación no leída, aunque el cuerpo sea la lista de errores de FastAPI', () => {
    expect(interpretarRespuestaLlegada(422, JSON.stringify({ detail: [{ loc: ['body', 'latitud'], msg: 'x', type: 'y' }] }))).toEqual({ tipo: 'ubicacionNoLeida' })
  })

  it('403: sin permiso', () => expect(interpretarRespuestaLlegada(403, '')).toEqual({ tipo: 'sinPermiso' }))
  it('401: sesión vencida', () => expect(interpretarRespuestaLlegada(401, '')).toEqual({ tipo: 'sesionVencida' }))
  it.each([[404], [429], [500], [502], [503]])('%i: error con su código', (status) => {
    expect(interpretarRespuestaLlegada(status, '')).toEqual({ tipo: 'error', status })
  })
})

describe('esFixUtil', () => {
  const ok = (f: FixUbicacion, extra: { edadMaximaMs?: number; precisionMaxM?: number | null } = {}) => esFixUtil(f, { ahora: AHORA, ...extra })

  it('un fix reciente y con coordenadas posibles sirve', () => expect(ok(fix())).toBe(true))

  it('20 s exactos sirven; 20,001 s no', () => {
    expect(ok(fix({ momento: AHORA - 20_000 }))).toBe(true)
    expect(ok(fix({ momento: AHORA - 20_001 }))).toBe(false)
  })

  it('un fix «del futuro» más allá del límite tampoco sirve (reloj desfasado)', () => {
    expect(ok(fix({ momento: AHORA + 20_000 }))).toBe(true)
    expect(ok(fix({ momento: AHORA + 20_001 }))).toBe(false)
  })

  it('una posición en caché de hace horas no sirve', () => expect(ok(fix({ momento: AHORA - 3 * 3_600_000 }))).toBe(false))

  it.each([
    ['latitud > 90', { latitud: 90.1 }],
    ['latitud < -90', { latitud: -90.1 }],
    ['longitud > 180', { longitud: 180.1 }],
    ['longitud < -180', { longitud: -180.1 }],
    ['latitud NaN', { latitud: NaN }],
    ['longitud infinita', { longitud: Infinity }],
    ['precisión negativa', { precisionM: -1 }],
    ['precisión NaN', { precisionM: NaN }],
    ['precisión infinita', { precisionM: Infinity }],
    ['momento NaN', { momento: NaN }],
  ])('no sirve con %s', (_caso, extra) => expect(ok(fix(extra))).toBe(false))

  it('los extremos posibles sí sirven', () => {
    expect(ok(fix({ latitud: 90, longitud: 180, precisionM: 0 }))).toBe(true)
    expect(ok(fix({ latitud: -90, longitud: -180 }))).toBe(true)
  })

  it('con precisión máxima exige precisión menor o igual', () => {
    expect(ok(fix({ precisionM: 100 }), { precisionMaxM: 100 })).toBe(true)
    expect(ok(fix({ precisionM: 100.1 }), { precisionMaxM: 100 })).toBe(false)
  })

  it('una precisión máxima nula no exige nada', () => expect(ok(fix({ precisionM: 5000 }), { precisionMaxM: null })).toBe(true))

  it('la edad máxima se puede cambiar', () => expect(ok(fix({ momento: AHORA - 5000 }), { edadMaximaMs: 4000 })).toBe(false))
})

describe('textoDeLlegada', () => {
  it('«Hoy 14:35» si fue el mismo día de Lima', () => {
    expect(textoDeLlegada(Date.parse('2026-10-15T19:35:00Z'), Date.parse('2026-10-15T20:00:00Z'))).toBe('Hoy 14:35')
  })

  it('«13/10 14:35» si fue otro día', () => {
    expect(textoDeLlegada(Date.parse('2026-10-13T19:35:00Z'), Date.parse('2026-10-15T20:00:00Z'))).toBe('13/10 14:35')
  })

  it('el día es el de Lima, no el de UTC: a las 02:00 UTC todavía es el día anterior en Lima', () => {
    // 2026-10-16T02:00Z = 15/10 21:00 en Lima; «ahora» 2026-10-16T03:00Z = 15/10 22:00 en Lima → mismo día.
    expect(textoDeLlegada(Date.parse('2026-10-16T02:00:00Z'), Date.parse('2026-10-16T03:00:00Z'))).toBe('Hoy 21:00')
    // Medianoche de Lima (05:00 UTC): 15/10 23:59 y 16/10 00:01 son días distintos.
    expect(textoDeLlegada(Date.parse('2026-10-16T04:59:00Z'), Date.parse('2026-10-16T05:01:00Z'))).toBe('15/10 23:59')
  })

  it('el mismo número de día de otro mes no es «hoy»', () => {
    expect(textoDeLlegada(Date.parse('2026-09-15T19:35:00Z'), Date.parse('2026-10-15T20:00:00Z'))).toBe('15/09 14:35')
    expect(textoDeLlegada(Date.parse('2025-10-15T19:35:00Z'), Date.parse('2026-10-15T20:00:00Z'))).toBe('15/10 14:35')
  })

  it('rellena con ceros', () => {
    expect(textoDeLlegada(Date.parse('2026-01-05T12:05:00Z'), Date.parse('2026-02-01T12:00:00Z'))).toBe('05/01 07:05')
  })

  it('no depende de la zona horaria de la máquina', () => {
    // Se construye con UTC y se calcula con UTC: si dependiera de la zona local, la hora cambiaría con TZ.
    expect(textoDeLlegada(Date.UTC(2026, 9, 15, 5, 0), Date.UTC(2026, 9, 15, 12, 0))).toBe('Hoy 00:00')
  })
})
