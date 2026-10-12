// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrdenCacheada, OrdenRemota } from './orden'
import { type TomaLocal, aplicarTomas, fallaPermiteTomarSinSenal, puedeSoltarse, reconciliarTomas, soltarEsSoloLocal } from './tomas'

const yo = { id: 7, username: 'yo', nombreCompleto: 'Yo' }

const remota = (idOrden: number, extra: Partial<OrdenRemota> = {}): OrdenRemota => ({
  idOrden,
  vin: `VIN${idOrden}`,
  estado: 'pendiente',
  placa: null,
  proveedor: null,
  destino: null,
  conductorAsignado: null,
  fechaCreacion: null,
  ...extra,
})

const cacheada = (idOrden: number, extra: Partial<OrdenCacheada> = {}): OrdenCacheada => ({ ...remota(idOrden), tomaSync: null, sincronizadaEn: 1, ...extra })

const toma = (idOrden: number, estado: TomaLocal['estado'], extra: Partial<TomaLocal> = {}): TomaLocal => ({
  idOrden,
  idUsuario: 7,
  estado,
  orden: remota(idOrden),
  tomadaEn: 100,
  mensaje: null,
  ...extra,
})

const estados = (tomas: TomaLocal[]) => tomas.map((t) => [t.idOrden, t.estado])

describe('reconciliarTomas', () => {
  it('una pendiente que el servidor ya da como propia pasa a confirmada', () => {
    expect(estados(reconciliarTomas([toma(1, 'pendiente')], [remota(1, { conductorAsignado: yo })]))).toEqual([[1, 'confirmada']])
  })

  it('una pendiente que sigue en el pool, o que el servidor no devuelve, se conserva pendiente', () => {
    expect(estados(reconciliarTomas([toma(1, 'pendiente'), toma(2, 'pendiente')], [remota(1)]))).toEqual([
      [1, 'pendiente'],
      [2, 'pendiente'],
    ])
  })

  it('una confirmada que sigue siendo propia y pendiente se conserva', () => {
    expect(estados(reconciliarTomas([toma(1, 'confirmada')], [remota(1, { conductorAsignado: yo })]))).toEqual([[1, 'confirmada']])
  })

  it.each([
    ['el servidor ya no la devuelve', []],
    ['la orden ya salió (en tránsito)', [remota(1, { conductorAsignado: yo, estado: 'en_transito' })]],
    ['volvió al pool sin dueño (la liberó el supervisor)', [remota(1)]],
  ])('una confirmada se olvida si %s', (_caso, remotas) => {
    expect(reconciliarTomas([toma(1, 'confirmada')], remotas)).toEqual([])
  })

  it('una perdida se conserva mientras el servidor no la dé como propia', () => {
    expect(estados(reconciliarTomas([toma(1, 'perdida', { mensaje: 'La tomó Ana' })], []))).toEqual([[1, 'perdida']])
    expect(reconciliarTomas([toma(1, 'perdida', { mensaje: 'La tomó Ana' })], [])[0]?.mensaje).toBe('La tomó Ana')
  })

  it('una perdida que el servidor vuelve a dar como propia se olvida (se muestra como cualquier propia)', () => {
    expect(reconciliarTomas([toma(1, 'perdida')], [remota(1, { conductorAsignado: yo })])).toEqual([])
  })

  it('la copia de la orden se actualiza con lo que trae el servidor', () => {
    const [actualizada] = reconciliarTomas([toma(1, 'pendiente')], [remota(1, { placa: { id: 3, codigo: 'ABC-123' } })])
    expect(actualizada?.orden.placa).toEqual({ id: 3, codigo: 'ABC-123' })
  })
})

describe('aplicarTomas', () => {
  it('marca las órdenes tomadas y deja las demás sin toma', () => {
    const resultado = aplicarTomas([cacheada(1), cacheada(2, { tomaSync: 'pendiente' })], [toma(1, 'confirmada')], 5)
    expect(resultado.map((o) => [o.idOrden, o.tomaSync])).toEqual([
      [1, 'confirmada'],
      [2, null], // la caché ya no decide la toma: sin fila de toma, no hay toma
    ])
  })

  it('agrega, con la copia guardada, una toma cuya orden el servidor no devolvió', () => {
    const resultado = aplicarTomas([cacheada(1)], [toma(9, 'perdida', { orden: remota(9, { vin: 'GUARDADO' }) })], 5)
    expect(resultado.map((o) => [o.idOrden, o.vin, o.tomaSync, o.sincronizadaEn])).toEqual([
      [1, 'VIN1', null, 1],
      [9, 'GUARDADO', 'perdida', 5],
    ])
  })
})

describe('soltar', () => {
  it.each([
    ['pendiente', 'pendiente', true],
    ['confirmada', 'pendiente', true],
    ['perdida', 'pendiente', false],
    [null, 'pendiente', false], // asignada por el supervisor: no se suelta desde aquí
    ['confirmada', 'en_transito', false], // el auto ya salió
  ] as const)('toma %s en una orden %s → se puede soltar: %s', (tomaSync, estado, esperado) => {
    expect(puedeSoltarse({ tomaSync, estado })).toBe(esperado)
  })

  it('solo una toma que no llegó al servidor se suelta sin red', () => {
    expect(soltarEsSoloLocal({ tomaSync: 'pendiente' })).toBe(true)
    expect(soltarEsSoloLocal({ tomaSync: 'confirmada' })).toBe(false)
  })
})

describe('fallaPermiteTomarSinSenal', () => {
  it.each([
    [{ isNetwork: true }, true],
    [{ status: 500 }, true],
    [{ status: 503 }, true],
    [{ status: 409 }, false],
    [{ status: 403 }, false],
    [{ status: 404 }, false],
    [{}, false],
  ])('%o → %s', (fallo, esperado) => {
    expect(fallaPermiteTomarSinSenal(fallo)).toBe(esperado)
  })
})
