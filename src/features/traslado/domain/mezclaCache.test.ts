// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type OrdenCacheada, type OrdenRemota, esMia } from './orden'
import { mezclarCache } from './mezclaCache'

const AHORA = 9_000
const placa = (id: number, codigo: string) => ({ id, codigo })
const proveedor = (id: number, nombre: string) => ({ id, nombre })
const conductor = { id: 7, username: 'ana', nombreCompleto: 'Ana Pérez' }

const remota = (idOrden: number, extra: Partial<OrdenRemota> = {}): OrdenRemota => ({
  idOrden,
  vin: `VIN${idOrden}`,
  estado: 'pendiente',
  placa: null,
  proveedor: null,
  destino: { id: 4, nombre: 'Concesionario' },
  conductorAsignado: null,
  fechaCreacion: '2026-10-09T10:00:00Z',
  ...extra,
})

const cacheada = (idOrden: number, extra: Partial<OrdenCacheada> = {}): OrdenCacheada => ({
  ...remota(idOrden),
  tomaSync: null,
  sincronizadaEn: 1,
  ...extra,
})

const ids = (ordenes: readonly OrdenCacheada[]) => ordenes.map((o) => o.idOrden)

describe('AC5 · placa y proveedor: el servidor pisa cuando trae dato, no cuando trae vacío', () => {
  it('si el servidor trae la placa vacía, se conserva la que ya había (el operario la eligió en el pañol)', () => {
    const resultado = mezclarCache([cacheada(1, { placa: placa(27, 'ABC-123') })], [remota(1, { placa: null })], AHORA)
    expect(resultado[0]?.placa).toEqual(placa(27, 'ABC-123'))
  })

  it('si el servidor trae la placa, esa gana', () => {
    const resultado = mezclarCache([cacheada(1, { placa: placa(27, 'ABC-123') })], [remota(1, { placa: placa(30, 'XYZ-999') })], AHORA)
    expect(resultado[0]?.placa).toEqual(placa(30, 'XYZ-999'))
  })

  it('lo mismo con el proveedor', () => {
    const conserva = mezclarCache([cacheada(1, { proveedor: proveedor(4, 'Grúas SA') })], [remota(1)], AHORA)
    expect(conserva[0]?.proveedor).toEqual(proveedor(4, 'Grúas SA'))
    const gana = mezclarCache([cacheada(1, { proveedor: proveedor(4, 'Grúas SA') })], [remota(1, { proveedor: proveedor(5, 'Otro') })], AHORA)
    expect(gana[0]?.proveedor).toEqual(proveedor(5, 'Otro'))
  })

  it('la placa y el proveedor se conservan por separado', () => {
    const resultado = mezclarCache(
      [cacheada(1, { placa: placa(27, 'ABC-123'), proveedor: proveedor(4, 'Grúas SA') })],
      [remota(1, { proveedor: proveedor(5, 'Otro') })], // trae proveedor pero no placa
      AHORA,
    )
    expect(resultado[0]).toMatchObject({ placa: placa(27, 'ABC-123'), proveedor: proveedor(5, 'Otro') })
  })

  it('el id y el nombre se mueven juntos: nunca queda una placa sin código', () => {
    const resultado = mezclarCache([cacheada(1, { placa: placa(27, 'ABC-123') })], [remota(1, { placa: null })], AHORA)
    expect(resultado[0]?.placa?.id).toBe(27)
    expect(resultado[0]?.placa?.codigo).toBe('ABC-123')
  })

  it('una orden nueva sin placa queda sin placa', () => {
    expect(mezclarCache([], [remota(1)], AHORA)[0]?.placa).toBeNull()
  })
})

describe('AC5 · el conductor NO se conserva: vacío significa «sin dueño»', () => {
  it('si el servidor la libera (conductor nulo), deja de tener dueño aunque antes lo tuviera', () => {
    const resultado = mezclarCache([cacheada(1, { conductorAsignado: conductor })], [remota(1, { conductorAsignado: null })], AHORA)
    expect(resultado[0]?.conductorAsignado).toBeNull()
  })

  it('si el servidor trae otro conductor, gana', () => {
    const otro = { id: 9, username: 'luis', nombreCompleto: null }
    const resultado = mezclarCache([cacheada(1, { conductorAsignado: conductor })], [remota(1, { conductorAsignado: otro })], AHORA)
    expect(resultado[0]?.conductorAsignado).toEqual(otro)
  })
})

describe('lo que es del servidor y lo que es local', () => {
  it('el estado, el VIN, el destino y la fecha vienen del servidor', () => {
    const resultado = mezclarCache(
      [cacheada(1, { estado: 'pendiente', destino: { id: 1, nombre: 'Viejo' } })],
      [remota(1, { estado: 'en_transito', destino: { id: 2, nombre: 'Nuevo' }, fechaCreacion: '2026-10-10T00:00:00Z' })],
      AHORA,
    )
    expect(resultado[0]).toMatchObject({ estado: 'en_transito', destino: { id: 2, nombre: 'Nuevo' }, fechaCreacion: '2026-10-10T00:00:00Z' })
  })

  it('«tomaSync» es local: el servidor no lo trae y se conserva en cada sincronización', () => {
    for (const toma of ['pendiente', 'confirmada'] as const) {
      expect(mezclarCache([cacheada(1, { tomaSync: toma })], [remota(1)], AHORA)[0]?.tomaSync).toBe(toma)
    }
    expect(mezclarCache([cacheada(1)], [remota(1)], AHORA)[0]?.tomaSync).toBeNull()
  })

  it('cada orden recibida queda marcada con el instante de la sincronización', () => {
    const resultado = mezclarCache([cacheada(1, { sincronizadaEn: 5 })], [remota(1), remota(2)], AHORA)
    expect(resultado.map((o) => o.sincronizadaEn)).toEqual([AHORA, AHORA])
  })
})

describe('qué se borra de la caché', () => {
  it('una orden que ya no viene del servidor (otro la tomó, la cancelaron, la reasignaron) sale sola', () => {
    const resultado = mezclarCache([cacheada(1), cacheada(2), cacheada(3)], [remota(2)], AHORA)
    expect(ids(resultado)).toEqual([2])
  })

  it('PERO una con la toma pendiente se conserva: borrarla dejaría sus fotos huérfanas', () => {
    const resultado = mezclarCache([cacheada(1, { tomaSync: 'pendiente' }), cacheada(2)], [remota(3)], AHORA)
    expect(ids(resultado).sort()).toEqual([1, 3])
  })

  it('una con la toma ya confirmada que el servidor dejó de devolver sí se borra', () => {
    const resultado = mezclarCache([cacheada(1, { tomaSync: 'confirmada' })], [remota(3)], AHORA)
    expect(ids(resultado)).toEqual([3])
  })

  it('con una lista vacía del servidor se borra todo menos lo de toma pendiente', () => {
    const resultado = mezclarCache([cacheada(1), cacheada(2, { tomaSync: 'pendiente' })], [], AHORA)
    expect(ids(resultado)).toEqual([2])
  })

  it('con reemplazarTodo en falso (la fuente es un solo VIN) no se borra nada', () => {
    const resultado = mezclarCache([cacheada(1), cacheada(2)], [remota(3)], AHORA, { reemplazarTodo: false })
    expect(ids(resultado).sort()).toEqual([1, 2, 3])
  })

  it('el orden del servidor se respeta, y lo conservado va al final', () => {
    const resultado = mezclarCache([cacheada(9, { tomaSync: 'pendiente' })], [remota(5), remota(2), remota(8)], AHORA)
    expect(ids(resultado)).toEqual([5, 2, 8, 9])
  })

  it('no modifica los datos de entrada', () => {
    const cache = [cacheada(1, { placa: placa(27, 'ABC-123') })]
    const copia = structuredClone(cache)
    mezclarCache(cache, [remota(1)], AHORA)
    expect(cache).toEqual(copia)
  })
})

describe('esMia', () => {
  it('es mía si el servidor le puso conductor', () => {
    expect(esMia({ conductorAsignado: conductor, tomaSync: null })).toBe(true)
  })
  it('es mía si la tomé y todavía no se registró, aunque el servidor diga que no tiene dueño', () => {
    expect(esMia({ conductorAsignado: null, tomaSync: 'pendiente' })).toBe(true)
    expect(esMia({ conductorAsignado: null, tomaSync: 'confirmada' })).toBe(true)
  })
  it('si no tiene conductor ni toma, es del pool', () => {
    expect(esMia({ conductorAsignado: null, tomaSync: null })).toBe(false)
  })
})
