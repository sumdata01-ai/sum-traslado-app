// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ESTADOS_ORDEN_LOCAL, type EstadoOrdenLocal } from './estadoOrden'
import { etiquetaDeOrden, filtrarPorVin, normalizarFiltro, tonoDeOrden } from './presentacionOrden'

const etiqueta = (estadoServidor: string, estadoLocal: EstadoOrdenLocal | null, fotosTomadas = 0) =>
  etiquetaDeOrden({ estadoServidor, estadoLocal, fotosTomadas })

describe('AC2 · etiquetas (docs/01-vision-y-alcance/patron-traslado-web.md §5)', () => {
  it.each([
    ['sinIniciar', 'Sin empezar'],
    ['listaParaEnviar', 'Listo para enviar'],
    ['enviando', 'Enviando…'],
    ['confirmada', 'Confirmada'],
    ['descartadaPorSupervisor', 'Descartada por el supervisor'],
  ] as const)('salida (pendiente), estado local %s → «%s»', (local, esperada) => {
    expect(etiqueta('pendiente', local)).toBe(esperada)
  })

  it('salida en captura muestra cuántas fotos de 6 lleva', () => {
    expect(etiqueta('pendiente', 'enCaptura', 3)).toBe('Cargando fotos (3/6)')
    expect(etiqueta('pendiente', 'enCaptura', 1)).toBe('Cargando fotos (1/6)')
  })

  it.each([
    ['sinIniciar', 'En tránsito — falta entregar'],
    ['listaParaEnviar', 'Entrega lista para enviar'],
    ['enviando', 'Enviando la entrega…'],
    ['confirmada', 'Entregado'],
    ['descartadaPorSupervisor', 'Descartada por el supervisor'],
  ] as const)('entrega (en_transito), estado local %s → «%s»', (local, esperada) => {
    expect(etiqueta('en_transito', local)).toBe(esperada)
  })

  it('entrega en captura muestra cuántas fotos de 5 lleva', () => {
    expect(etiqueta('en_transito', 'enCaptura', 2)).toBe('Entregando (2/5)')
  })

  it('el mismo estado «sinIniciar» se lee distinto según el tramo: la salida ya confirmada NO vuelve a decir «Sin empezar»', () => {
    expect(etiqueta('pendiente', 'sinIniciar')).toBe('Sin empezar')
    expect(etiqueta('en_transito', 'sinIniciar')).not.toBe('Sin empezar')
  })

  it.each([
    ['en_transito', 'En tránsito'],
    ['realizado', 'Entregado'],
    ['cerrada', 'Cerrada'],
    ['cancelada', 'Cancelada'],
  ])('sin estado local, el servidor «%s» se muestra como «%s»', (servidor, esperada) => {
    expect(etiqueta(servidor, null)).toBe(esperada)
  })

  it('un estado del servidor que no conocemos se muestra tal cual, no se oculta', () => {
    expect(etiqueta('estado_nuevo', null)).toBe('estado_nuevo')
  })

  it('todos los estados locales tienen etiqueta en los dos tramos', () => {
    for (const estado of ESTADOS_ORDEN_LOCAL) {
      expect(etiqueta('pendiente', estado, 1).length).toBeGreaterThan(3)
      expect(etiqueta('en_transito', estado, 1).length).toBeGreaterThan(3)
    }
  })
})

describe('AC2 · color de la tarjeta', () => {
  it.each([
    ['pendiente', 'listaParaEnviar', 'success'],
    ['en_transito', 'listaParaEnviar', 'success'], // gana el verde aunque esté en tránsito
    ['cancelada', null, 'danger'],
    ['cancelada', 'sinIniciar', 'danger'],
    ['en_transito', null, 'info'],
    ['en_transito', 'sinIniciar', 'info'],
    ['en_transito', 'enCaptura', 'info'],
    ['pendiente', 'sinIniciar', 'neutral'],
    ['pendiente', 'enCaptura', 'neutral'],
    ['pendiente', 'enviando', 'neutral'],
    ['realizado', null, 'neutral'],
    ['cerrada', null, 'neutral'],
    ['estado_nuevo', null, 'neutral'],
  ] as const)('servidor %s con estado local %s → %s', (servidor, local, esperado) => {
    expect(tonoDeOrden({ estadoServidor: servidor, estadoLocal: local })).toBe(esperado)
  })

  it('«listo para enviar» se evalúa antes que cancelada', () => {
    // Una cancelada con la captura lista sigue pidiendo atención de quien la fotografió.
    expect(tonoDeOrden({ estadoServidor: 'cancelada', estadoLocal: 'listaParaEnviar' })).toBe('success')
  })
})

describe('AC3 · filtro por VIN', () => {
  const ordenes = [{ vin: 'LSCABN3E2VE840638', id: 1 }, { vin: 'LGWEF4A55SB123456', id: 2 }, { vin: 'LSCABN3E2VE999999', id: 3 }]

  it('sin texto devuelve todo', () => {
    expect(filtrarPorVin(ordenes, '')).toHaveLength(3)
    expect(filtrarPorVin(ordenes, '   ')).toHaveLength(3)
  })

  it('busca una parte del VIN, en cualquier posición', () => {
    expect(filtrarPorVin(ordenes, 'LSCABN').map((o) => o.id)).toEqual([1, 3])
    expect(filtrarPorVin(ordenes, '123456').map((o) => o.id)).toEqual([2])
    expect(filtrarPorVin(ordenes, 'E84').map((o) => o.id)).toEqual([1])
  })

  it('no distingue mayúsculas ni espacios en los extremos', () => {
    expect(filtrarPorVin(ordenes, '  lscabn3e2ve84  ').map((o) => o.id)).toEqual([1])
    expect(normalizarFiltro('  abc12 ')).toBe('ABC12')
  })

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(filtrarPorVin(ordenes, 'ZZZZ')).toEqual([])
  })

  it('no modifica la lista de entrada', () => {
    const copia = [...ordenes]
    filtrarPorVin(ordenes, 'LSC')
    expect(ordenes).toEqual(copia)
  })
})
