// @vitest-environment node
import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrdenCacheada } from '../domain'
import { ConteoFotosDexie } from './conteoFotos'
import { OrdenesCacheDexie } from './ordenesCache'
import { type FilaFoto, TrasladoDb } from './trasladoDb'

const abiertas: Array<{ close: () => void; delete: () => Promise<void> }> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of abiertas.splice(0)) {
    db.close()
    await db.delete()
  }
})

function nuevaBase(nombre = `ordenes-${globalThis.crypto.randomUUID()}`) {
  const db = new TrasladoDb(nombre)
  abiertas.push(db)
  return { db, nombre }
}

const orden = (idOrden: number, extra: Partial<OrdenCacheada> = {}): OrdenCacheada => ({
  idOrden,
  vin: `VIN${idOrden}`,
  estado: 'pendiente',
  placa: null,
  proveedor: null,
  destino: { id: 4, nombre: 'Concesionario' },
  conductorAsignado: null,
  fechaCreacion: '2026-10-09T10:00:00Z',
  tomaSync: null,
  sincronizadaEn: 1_000,
  ...extra,
})

describe('OrdenesCacheDexie', () => {
  it('guarda y devuelve las órdenes tal cual, sin detalles internos del almacenamiento', async () => {
    const { db } = nuevaBase()
    const cache = new OrdenesCacheDexie(db)
    const original = orden(5, {
      placa: { id: 27, codigo: 'ABC-123' },
      conductorAsignado: { id: 7, username: 'ana', nombreCompleto: 'Ana Pérez' },
      tomaSync: 'pendiente',
    })

    await cache.reemplazar([original])
    const leidas = await cache.leer()

    expect(leidas).toEqual([original])
    expect(leidas[0]).not.toHaveProperty('posicion')
  })

  it('conserva el orden en que el servidor entregó la lista, no el de la clave', async () => {
    const { db } = nuevaBase()
    const cache = new OrdenesCacheDexie(db)

    await cache.reemplazar([orden(30), orden(10), orden(20)])

    expect((await cache.leer()).map((o) => o.idOrden)).toEqual([30, 10, 20])
  })

  it('reemplazar sustituye todo el contenido anterior', async () => {
    const { db } = nuevaBase()
    const cache = new OrdenesCacheDexie(db)
    await cache.reemplazar([orden(1), orden(2), orden(3)])

    await cache.reemplazar([orden(2), orden(9)])

    expect((await cache.leer()).map((o) => o.idOrden)).toEqual([2, 9])
  })

  it('es todo o nada: si la escritura falla a mitad, la caché anterior sigue intacta', async () => {
    const { db } = nuevaBase()
    const cache = new OrdenesCacheDexie(db)
    await cache.reemplazar([orden(1), orden(2)])
    vi.spyOn(db.ordenes, 'bulkPut').mockRejectedValueOnce(new Error('disco lleno'))

    await expect(cache.reemplazar([orden(7), orden(8)])).rejects.toThrow('disco lleno')

    expect((await cache.leer()).map((o) => o.idOrden)).toEqual([1, 2]) // el clear() se deshizo
  })

  it('vaciar borra las órdenes pero no toca las fotos', async () => {
    const { db } = nuevaBase()
    const cache = new OrdenesCacheDexie(db)
    await cache.reemplazar([orden(1)])
    await db.fotos.put(filaFoto({ clientId: 'foto-1' }))

    await cache.vaciar()

    expect(await cache.leer()).toEqual([])
    expect(await db.fotos.count()).toBe(1)
  })

  it.each([
    ['con la base recién creada', false],
    ['con la base ya abierta', true],
  ])('un vaciar pedido mientras se reemplaza corre después y gana, %s', async (_caso, abrirAntes) => {
    const { db } = nuevaBase()
    const cache = new OrdenesCacheDexie(db)
    if (abrirAntes) await cache.leer()

    const escritura = cache.reemplazar([orden(1), orden(2)])
    const borrado = cache.vaciar() // sin esperar a la escritura: como un cierre de sesión a mitad
    await Promise.all([escritura, borrado])

    expect(await cache.leer()).toEqual([])
  })

  it('un reemplazo que falla no traba el borrado que viene detrás', async () => {
    const { db } = nuevaBase()
    const cache = new OrdenesCacheDexie(db)
    await cache.reemplazar([orden(1)])
    vi.spyOn(db.ordenes, 'bulkPut').mockRejectedValueOnce(new Error('disco lleno'))

    const escritura = cache.reemplazar([orden(2)])
    const borrado = cache.vaciar()

    await expect(escritura).rejects.toThrow('disco lleno')
    await borrado
    expect(await cache.leer()).toEqual([])
  })

  it('una caché vacía se lee como lista vacía', async () => {
    const { db } = nuevaBase()
    expect(await new OrdenesCacheDexie(db).leer()).toEqual([])
  })

  it('las órdenes sobreviven a cerrar y volver a abrir la base (una recarga)', async () => {
    const { db, nombre } = nuevaBase()
    await new OrdenesCacheDexie(db).reemplazar([orden(1), orden(2)])
    db.close()

    const reabierta = nuevaBase(nombre).db

    expect((await new OrdenesCacheDexie(reabierta).leer()).map((o) => o.idOrden)).toEqual([1, 2])
  })
})

describe('migración de la base a la versión 2 (se añade la caché de órdenes)', () => {
  it('una base que ya tenía fotos las conserva intactas y la caché de órdenes empieza vacía', async () => {
    const nombre = `migracion-${globalThis.crypto.randomUUID()}`
    // Una base como la dejó la versión anterior de la aplicación: solo fotos y filas en tránsito.
    const antigua = new Dexie(nombre)
    antigua.version(1).stores({
      fotos: 'clientId, &[ordenId+momento+zona], [ordenId+momento], estado',
      enEscritura: 'clientId, [ordenId+momento+zona], [ordenId+momento]',
    })
    await antigua.open()
    await antigua.table('fotos').put(filaFoto({ clientId: 'foto-vieja', ordenId: 99 }))
    antigua.close()

    const { db } = nuevaBase(nombre)

    expect(await db.fotos.count()).toBe(1)
    expect((await db.fotos.get('foto-vieja'))?.ordenId).toBe(99)
    expect(await db.ordenes.count()).toBe(0)
  })
})

function filaFoto(extra: Partial<FilaFoto> = {}): FilaFoto {
  return {
    clientId: 'foto',
    ordenId: 1,
    momento: 'salida',
    zona: 'FRONTAL',
    blob: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }),
    ancho: 1,
    alto: 1,
    creadaEn: 1,
    estado: 'pending',
    storageKey: null,
    errorMessage: null,
    actualizadoEn: 1,
    ...extra,
  }
}

describe('ConteoFotosDexie', () => {
  it('cuenta las fotos de cada orden por tramo, y cuántas ya se subieron', async () => {
    const { db } = nuevaBase()
    await db.fotos.bulkPut([
      filaFoto({ clientId: 'a', ordenId: 1, momento: 'salida', zona: 'FRONTAL', storageKey: 'traslado/a.jpg', estado: 'uploaded' }),
      filaFoto({ clientId: 'b', ordenId: 1, momento: 'salida', zona: 'POSTERIOR' }),
      filaFoto({ clientId: 'c', ordenId: 1, momento: 'entrega', zona: 'VIN' }),
      ...(['FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR', 'PLACA_ESTADO', 'PLACA_INSTALADA'] as const).map((zona) =>
        filaFoto({ clientId: `orden2-${zona}`, ordenId: 2, momento: 'salida', zona, storageKey: `traslado/${zona}.jpg` }),
      ),
    ])

    const conteos = await new ConteoFotosDexie(db).contar()

    expect(conteos.get(1)).toEqual({ salida: { archivo: 2, subidas: 1 }, entrega: { archivo: 1, subidas: 0 } })
    expect(conteos.get(2)).toEqual({ salida: { archivo: 6, subidas: 6 }, entrega: { archivo: 0, subidas: 0 } })
    expect(conteos.has(3)).toBe(false) // sin fotos, sin entrada
  })

  it('sin fotos devuelve un mapa vacío', async () => {
    const { db } = nuevaBase()
    expect((await new ConteoFotosDexie(db).contar()).size).toBe(0)
  })
})
