// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ESTADOS_ORDEN_LOCAL, derivarEstadoOrden } from './estadoOrden'

// Fuente: docs/01-vision-y-alcance/patron-traslado-web.md §2.2 y `derivarEstadoOrden` de traslado_estado.dart.
describe('derivarEstadoOrden', () => {
  it.each([
    // total, conArchivo, conStorageKey, esperado
    [6, 0, 0, 'sinIniciar'],
    [6, 1, 0, 'enCaptura'],
    [6, 5, 0, 'enCaptura'],
    [6, 5, 5, 'enCaptura'], // 5 subidas de 6: todavía falta una foto
    [6, 6, 0, 'listaParaEnviar'],
    [6, 6, 5, 'listaParaEnviar'], // falta subir la última
    [6, 6, 6, 'enviando'],
    [5, 0, 0, 'sinIniciar'], // entrega
    [5, 4, 0, 'enCaptura'],
    [5, 5, 0, 'listaParaEnviar'],
    [5, 5, 5, 'enviando'],
  ] as const)('total %i, con archivo %i, subidas %i → %s', (totalZonas, zonasConArchivo, zonasConStorageKey, esperado) => {
    expect(derivarEstadoOrden({ totalZonas, zonasConArchivo, zonasConStorageKey })).toBe(esperado)
  })

  it('el desenlace del servidor manda sobre el conteo', () => {
    const lista = { totalZonas: 6, zonasConArchivo: 6, zonasConStorageKey: 6 }
    expect(derivarEstadoOrden({ ...lista, resultadoConfirmacion: 'confirmada' })).toBe('confirmada')
    expect(derivarEstadoOrden({ ...lista, resultadoConfirmacion: 'descartadaPorSupervisor' })).toBe(
      'descartadaPorSupervisor',
    )
    // Aunque el conteo local diga otra cosa (fotos ya borradas tras confirmar):
    expect(
      derivarEstadoOrden({ totalZonas: 6, zonasConArchivo: 0, zonasConStorageKey: 0, resultadoConfirmacion: 'confirmada' }),
    ).toBe('confirmada')
  })

  it('el estado «confirmando» no existe y nunca se devuelve, para ninguna combinación', () => {
    expect(ESTADOS_ORDEN_LOCAL).not.toContain('confirmando')
    for (const total of [5, 6]) {
      for (let archivo = 0; archivo <= total; archivo++) {
        for (let subidas = 0; subidas <= total; subidas++) {
          const estado = derivarEstadoOrden({ totalZonas: total, zonasConArchivo: archivo, zonasConStorageKey: subidas })
          expect(ESTADOS_ORDEN_LOCAL).toContain(estado)
          expect(estado).not.toBe('confirmando' as string)
        }
      }
    }
  })

  it('subir más fotos nunca hace retroceder el estado', () => {
    const orden = ['sinIniciar', 'enCaptura', 'listaParaEnviar', 'enviando'] as const
    let previo = 0
    for (let archivo = 0; archivo <= 6; archivo++) {
      const estado = derivarEstadoOrden({ totalZonas: 6, zonasConArchivo: archivo, zonasConStorageKey: 0 })
      const posicion = orden.indexOf(estado as (typeof orden)[number])
      expect(posicion).toBeGreaterThanOrEqual(previo)
      previo = posicion
    }
  })

  it.each([
    [{ totalZonas: 0, zonasConArchivo: 0, zonasConStorageKey: 0 }],
    [{ totalZonas: -6, zonasConArchivo: 0, zonasConStorageKey: 0 }],
    [{ totalZonas: 6.5, zonasConArchivo: 0, zonasConStorageKey: 0 }],
    [{ totalZonas: 6, zonasConArchivo: -1, zonasConStorageKey: 0 }],
    [{ totalZonas: 6, zonasConArchivo: 0, zonasConStorageKey: -1 }],
    [{ totalZonas: 6, zonasConArchivo: Number.NaN, zonasConStorageKey: 0 }],
  ])('rechaza entradas imposibles %j', (entrada) => {
    expect(() => derivarEstadoOrden(entrada)).toThrow(RangeError)
  })
})
