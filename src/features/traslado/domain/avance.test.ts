// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type OrdenParaAvance, calcularAvance, totalDeAvance, valeMostrarAvance } from './avance'
import type { EstadoOrdenLocal } from './estadoOrden'

const orden = (estadoServidor: string, estadoLocal: EstadoOrdenLocal | null = null): OrdenParaAvance => ({ estadoServidor, estadoLocal })

describe('calcularAvance (reglas de `calcularAvance` de la app)', () => {
  it('sin órdenes, todo en cero', () => {
    expect(calcularAvance([])).toEqual({ enviados: 0, porEnviar: 0, sinEmpezar: 0 })
  })

  it.each([
    ['pendiente', 'sinIniciar', { enviados: 0, porEnviar: 0, sinEmpezar: 1 }],
    ['pendiente', 'enCaptura', { enviados: 0, porEnviar: 0, sinEmpezar: 1 }],
    ['pendiente', 'listaParaEnviar', { enviados: 0, porEnviar: 1, sinEmpezar: 0 }],
    ['pendiente', 'enviando', { enviados: 0, porEnviar: 1, sinEmpezar: 0 }],
    ['pendiente', 'confirmada', { enviados: 1, porEnviar: 0, sinEmpezar: 0 }],
  ] as const)('una orden %s con estado local %s', (servidor, local, esperado) => {
    expect(calcularAvance([orden(servidor, local)])).toEqual(esperado)
  })

  it('«todas las fotos tomadas» cuenta como trabajo hecho (por enviar), no como pendiente', () => {
    expect(calcularAvance([orden('pendiente', 'listaParaEnviar')]).sinEmpezar).toBe(0)
  })

  it('el servidor manda: en_transito y cerrada son enviados, diga lo que diga el estado local', () => {
    for (const local of [null, 'sinIniciar', 'enCaptura', 'listaParaEnviar'] as const) {
      expect(calcularAvance([orden('en_transito', local)])).toEqual({ enviados: 1, porEnviar: 0, sinEmpezar: 0 })
    }
    expect(calcularAvance([orden('cerrada')])).toEqual({ enviados: 1, porEnviar: 0, sinEmpezar: 0 })
  })

  it('una orden con la salida ya confirmada no desaparece del conteo cuando su estado local es nulo', () => {
    // El caso que la app corrigió: con 3 órdenes y una salida confirmada decía «2 sin empezar».
    const avance = calcularAvance([orden('en_transito', null), orden('pendiente', 'sinIniciar'), orden('pendiente', 'sinIniciar')])
    expect(avance).toEqual({ enviados: 1, porEnviar: 0, sinEmpezar: 2 })
  })

  it('cancelada no suma a ninguno, ni siquiera con una captura local pendiente', () => {
    expect(calcularAvance([orden('cancelada', 'listaParaEnviar'), orden('cancelada')])).toEqual({ enviados: 0, porEnviar: 0, sinEmpezar: 0 })
  })

  it('descartada por el supervisor tampoco suma: no se registró ninguna salida', () => {
    expect(calcularAvance([orden('pendiente', 'descartadaPorSupervisor')])).toEqual({ enviados: 0, porEnviar: 0, sinEmpezar: 0 })
  })

  it('una pendiente sin estado local queda fuera del conteo, a propósito', () => {
    expect(calcularAvance([orden('pendiente', null)])).toEqual({ enviados: 0, porEnviar: 0, sinEmpezar: 0 })
  })

  it('un estado del servidor desconocido no suma ni rompe', () => {
    expect(calcularAvance([orden('estado_nuevo', 'sinIniciar')])).toEqual({ enviados: 0, porEnviar: 0, sinEmpezar: 1 })
  })

  it('suma varias órdenes de grupos distintos', () => {
    const avance = calcularAvance([
      orden('en_transito'),
      orden('pendiente', 'confirmada'),
      orden('pendiente', 'listaParaEnviar'),
      orden('pendiente', 'enviando'),
      orden('pendiente', 'enCaptura'),
      orden('pendiente', 'sinIniciar'),
      orden('cancelada'),
    ])
    expect(avance).toEqual({ enviados: 2, porEnviar: 2, sinEmpezar: 2 })
  })
})

describe('cuándo vale la pena mostrar el contador', () => {
  it('con menos de 2 órdenes no agrega nada que la lista no diga', () => {
    expect(valeMostrarAvance({ enviados: 0, porEnviar: 0, sinEmpezar: 0 })).toBe(false)
    expect(valeMostrarAvance({ enviados: 0, porEnviar: 0, sinEmpezar: 1 })).toBe(false)
  })
  it('desde 2 órdenes sí', () => {
    expect(valeMostrarAvance({ enviados: 1, porEnviar: 0, sinEmpezar: 1 })).toBe(true)
    expect(valeMostrarAvance({ enviados: 0, porEnviar: 0, sinEmpezar: 2 })).toBe(true)
  })
  it('el total suma los tres grupos', () => {
    expect(totalDeAvance({ enviados: 2, porEnviar: 3, sinEmpezar: 4 })).toBe(9)
  })
})
