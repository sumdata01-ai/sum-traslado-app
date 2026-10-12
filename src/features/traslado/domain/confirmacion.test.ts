// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type FotoParaConfirmar, fechaMedida, mensajeDelProblema, validarConfirmacion } from './confirmacion'
import { ZONAS_ENTREGA, ZONAS_SALIDA } from './zonas'

const subida = (zona: string): FotoParaConfirmar => ({ zona, storageKey: `traslado/${zona}.jpg` })
const salidaCompleta = () => ZONAS_SALIDA.map(subida)
const entregaCompleta = () => ZONAS_ENTREGA.map(subida)

function codigos(resultado: ReturnType<typeof validarConfirmacion>): string[] {
  return resultado.ok ? [] : resultado.problemas.map((p) => `${p.codigo}${p.zona ? `:${p.zona}` : ''}`)
}

describe('validarConfirmacion', () => {
  it('acepta la salida con 6 zonas distintas y todas subidas', () => {
    expect(validarConfirmacion('salida', salidaCompleta())).toEqual({ ok: true })
  })

  it('acepta la entrega con 5 zonas, incluida VIN, y todas subidas', () => {
    expect(validarConfirmacion('entrega', entregaCompleta())).toEqual({ ok: true })
  })

  it('el orden de las fotos no importa', () => {
    expect(validarConfirmacion('salida', [...salidaCompleta()].reverse())).toEqual({ ok: true })
  })

  it('con 5 fotos en la salida, avisa del conteo y de qué zona falta', () => {
    const fotos = salidaCompleta().filter((f) => f.zona !== 'PLACA_INSTALADA')
    expect(codigos(validarConfirmacion('salida', fotos))).toEqual(['CONTEO_INCORRECTO', 'ZONA_FALTANTE:PLACA_INSTALADA'])
  })

  it('con 7 fotos en la salida, avisa del conteo y de la zona repetida', () => {
    const fotos = [...salidaCompleta(), subida('FRONTAL')]
    expect(codigos(validarConfirmacion('salida', fotos))).toEqual(['CONTEO_INCORRECTO', 'ZONA_REPETIDA:FRONTAL'])
  })

  it('6 fotos con una zona repetida: no cuenta como completa porque falta otra', () => {
    const fotos = [subida('FRONTAL'), subida('FRONTAL'), ...ZONAS_SALIDA.slice(2).map(subida)]
    expect(codigos(validarConfirmacion('salida', fotos))).toEqual(['ZONA_REPETIDA:FRONTAL', 'ZONA_FALTANTE:LATERAL_IZQUIERDO'])
  })

  it('una zona que no existe en el momento se reporta como no esperada y deja la esperada faltante', () => {
    const fotos = [...ZONAS_SALIDA.slice(0, 5).map(subida), subida('TECHO')]
    expect(codigos(validarConfirmacion('salida', fotos))).toEqual(['ZONA_NO_ESPERADA:TECHO', 'ZONA_FALTANTE:PLACA_INSTALADA'])
  })

  it('la entrega con las zonas de placa de la salida no es válida', () => {
    const fotos = [...ZONAS_ENTREGA.slice(0, 4).map(subida), subida('PLACA_ESTADO')]
    expect(codigos(validarConfirmacion('entrega', fotos))).toEqual(['ZONA_NO_ESPERADA:PLACA_ESTADO', 'ZONA_FALTANTE:VIN'])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['cadena vacía', ''],
    ['solo espacios', '   '],
  ])('una foto sin storage_key (%s) impide confirmar', (_nombre, storageKey) => {
    const fotos = salidaCompleta().map((f) => (f.zona === 'POSTERIOR' ? { zona: f.zona, storageKey } : f))
    expect(codigos(validarConfirmacion('salida', fotos))).toEqual(['FALTA_STORAGE_KEY:POSTERIOR'])
  })

  it('sin ninguna foto, reporta el conteo y las 6 zonas faltantes en el orden del formulario', () => {
    const resultado = validarConfirmacion('salida', [])
    expect(codigos(resultado)).toEqual([
      'CONTEO_INCORRECTO',
      ...ZONAS_SALIDA.map((zona) => `ZONA_FALTANTE:${zona}`),
    ])
  })

  it('devuelve todos los problemas juntos, no solo el primero', () => {
    const fotos: FotoParaConfirmar[] = [{ zona: 'FRONTAL', storageKey: null }, subida('TECHO')]
    const resultado = validarConfirmacion('salida', fotos)
    expect(resultado.ok).toBe(false)
    expect(codigos(resultado).length).toBeGreaterThan(3)
  })
})

describe('fechaMedida', () => {
  afterEach(() => vi.useRealTimers())

  it('devuelve la última captura de la tanda, sin importar el orden', () => {
    const fotos = [{ createdAt: 1_000 }, { createdAt: 5_000 }, { createdAt: 3_000 }]
    expect(fechaMedida(fotos).getTime()).toBe(5_000)
  })

  it('nunca usa el reloj del momento de enviar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T15:00:00Z'))
    const capturada = Date.parse('2026-10-09T09:00:00Z')
    expect(fechaMedida([{ createdAt: capturada - 60_000 }, { createdAt: capturada }]).toISOString()).toBe(
      '2026-10-09T09:00:00.000Z',
    )
  })

  it('su ISO está en UTC, como espera el backend', () => {
    expect(fechaMedida([{ createdAt: Date.parse('2026-10-09T13:13:35Z') }]).toISOString()).toBe('2026-10-09T13:13:35.000Z')
  })

  it('sin fotos no hay fecha que medir', () => {
    expect(() => fechaMedida([])).toThrow(RangeError)
  })

  it('una fecha de captura inválida se rechaza', () => {
    expect(() => fechaMedida([{ createdAt: 1_000 }, { createdAt: Number.NaN }])).toThrow(RangeError)
  })
})

describe('mensajeDelProblema: lo que se le dice al operario', () => {
  const mensajes = (resultado: ReturnType<typeof validarConfirmacion>) => (resultado.ok ? [] : resultado.problemas.map(mensajeDelProblema))

  it('usa el nombre de la zona, no su código', () => {
    const fotos = salidaCompleta().filter((f) => f.zona !== 'PLACA_ESTADO' && f.zona !== 'FRONTAL')
    expect(mensajes(validarConfirmacion('salida', fotos))).toEqual([
      'Se esperan 6 fotos y hay 4.',
      'Falta la foto de Frontal.',
      'Falta la foto de Placa — estado físico.',
    ])
  })

  it('una foto sin subir dice que todavía no se subió', () => {
    const fotos = [...ZONAS_ENTREGA.slice(0, 4).map(subida), { zona: 'VIN', storageKey: null }]
    expect(mensajes(validarConfirmacion('entrega', fotos))).toEqual(['La foto de Número de VIN todavía no se subió.'])
  })

  it('una zona repetida o de otro paso se dice con su nombre', () => {
    expect(mensajes(validarConfirmacion('entrega', [...entregaCompleta(), subida('FRONTAL')]))).toEqual([
      'Se esperan 5 fotos y hay 6.',
      'Hay más de una foto de Frontal.',
    ])
    expect(mensajes(validarConfirmacion('entrega', [...entregaCompleta().slice(0, 4), subida('PLACA_ESTADO')]))).toEqual([
      'La foto de Placa — estado físico no corresponde a este paso.',
      'Falta la foto de Número de VIN.',
    ])
  })

  it('una zona desconocida se muestra tal cual, sin romperse', () => {
    expect(mensajeDelProblema({ codigo: 'ZONA_NO_ESPERADA', zona: 'RARA', detalle: '' })).toBe('La foto de RARA no corresponde a este paso.')
    expect(mensajeDelProblema({ codigo: 'ZONA_FALTANTE', detalle: '' })).toBe('Falta la foto de una zona.')
  })
})
