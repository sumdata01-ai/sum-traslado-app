// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ETIQUETA_ZONA,
  MOMENTOS,
  ZONAS_ENTREGA,
  ZONAS_SALIDA,
  momentoDeEstadoServidor,
  totalZonas,
  zonasDe,
} from './zonas'

describe('zonas', () => {
  it('la salida pide 6 zonas, en el orden del formulario', () => {
    expect(zonasDe('salida')).toEqual([
      'FRONTAL',
      'LATERAL_IZQUIERDO',
      'LATERAL_DERECHO',
      'POSTERIOR',
      'PLACA_ESTADO',
      'PLACA_INSTALADA',
    ])
    expect(totalZonas('salida')).toBe(6)
  })

  it('la entrega pide 5 zonas: las 4 exteriores más VIN, sin las de placa', () => {
    expect(zonasDe('entrega')).toEqual(['FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR', 'VIN'])
    expect(totalZonas('entrega')).toBe(5)
    expect(ZONAS_ENTREGA).not.toContain('PLACA_ESTADO')
    expect(ZONAS_ENTREGA).not.toContain('PLACA_INSTALADA')
  })

  it('no hay zonas repetidas dentro de un momento', () => {
    for (const momento of MOMENTOS) {
      const zonas = zonasDe(momento)
      expect(new Set(zonas).size).toBe(zonas.length)
    }
  })

  it('las zonas exteriores son las mismas en la salida y en la entrega, para poder compararlas', () => {
    const comunes = ZONAS_SALIDA.filter((z) => (ZONAS_ENTREGA as readonly string[]).includes(z))
    expect(comunes).toEqual(['FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR'])
  })

  it('toda zona tiene etiqueta para la pantalla', () => {
    for (const zona of new Set([...ZONAS_SALIDA, ...ZONAS_ENTREGA])) {
      expect(ETIQUETA_ZONA[zona]).toBeTruthy()
    }
  })

  it.each([
    ['pendiente', 'salida'],
    ['en_transito', 'entrega'],
    ['cancelada', null],
    ['realizado', null],
    ['cerrada', null],
    ['', null],
    ['PENDIENTE', null],
  ] as const)('el estado del servidor «%s» abre el tramo %s', (estado, esperado) => {
    expect(momentoDeEstadoServidor(estado)).toBe(esperado)
  })
})
