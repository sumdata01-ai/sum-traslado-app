// @vitest-environment node
import { Blob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { TomaLocal } from '../domain'
import { ConteoFotosDexie } from './conteoFotos'
import { ordenRemota } from './testing/fakes'
import { TomasDexie } from './tomasStore'
import { type FilaEnEscritura, type FilaFoto, TrasladoDb } from './trasladoDb'

const abiertas: TrasladoDb[] = []
afterEach(async () => {
  for (const db of abiertas.splice(0)) {
    db.close()
    await db.delete()
  }
})

function nuevaBase(nombre = `tomas-${globalThis.crypto.randomUUID()}`) {
  const db = new TrasladoDb(nombre)
  abiertas.push(db)
  return { db, nombre }
}

const toma = (idOrden: number, idUsuario: number | null, extra: Partial<TomaLocal> = {}): TomaLocal => ({
  idOrden,
  idUsuario,
  estado: 'pendiente',
  orden: ordenRemota(idOrden),
  tomadaEn: idOrden,
  mensaje: null,
  ...extra,
})

describe('TomasDexie', () => {
  it('guarda y devuelve las tomas tal cual, sin detalles del almacenamiento', async () => {
    const { db } = nuevaBase()
    const tomas = new TomasDexie(db)
    const original = toma(5, 7, { estado: 'perdida', mensaje: 'La tomó Ana' })

    await tomas.guardar(original)

    const leidas = await tomas.listar(7)
    expect(leidas).toEqual([original])
    expect(leidas[0]).not.toHaveProperty('clave')
    expect(leidas[0]).not.toHaveProperty('dueno')
  })

  it('cada persona ve solo las suyas, también si tomaron la misma orden', async () => {
    const { db } = nuevaBase()
    const tomas = new TomasDexie(db)
    await tomas.guardar(toma(1, 7))
    await tomas.guardar(toma(1, 8))
    await tomas.guardar(toma(2, 8))

    expect((await tomas.listar(7)).map((t) => t.idOrden)).toEqual([1])
    expect((await tomas.listar(8)).map((t) => t.idOrden)).toEqual([1, 2])
  })

  it('una persona sin id conocido tiene sus propias tomas, separadas', async () => {
    const { db } = nuevaBase()
    const tomas = new TomasDexie(db)
    await tomas.guardar(toma(1, null))
    await tomas.guardar(toma(2, 7))

    expect((await tomas.listar(null)).map((t) => t.idOrden)).toEqual([1])
  })

  it('se listan de la más antigua a la más nueva', async () => {
    const { db } = nuevaBase()
    const tomas = new TomasDexie(db)
    await tomas.guardar(toma(3, 7, { tomadaEn: 30 }))
    await tomas.guardar(toma(1, 7, { tomadaEn: 10 }))
    await tomas.guardar(toma(2, 7, { tomadaEn: 20 }))

    expect((await tomas.listar(7)).map((t) => t.idOrden)).toEqual([1, 2, 3])
  })

  it('guardar otra vez la misma toma la actualiza, no la duplica', async () => {
    const { db } = nuevaBase()
    const tomas = new TomasDexie(db)
    await tomas.guardar(toma(1, 7))
    await tomas.guardar(toma(1, 7, { estado: 'confirmada' }))

    expect(await tomas.listar(7)).toMatchObject([{ idOrden: 1, estado: 'confirmada' }])
  })

  it('quitar borra solo la de esa persona', async () => {
    const { db } = nuevaBase()
    const tomas = new TomasDexie(db)
    await tomas.guardar(toma(1, 7))
    await tomas.guardar(toma(1, 8))

    await tomas.quitar(7, 1)

    expect(await tomas.listar(7)).toEqual([])
    expect(await tomas.listar(8)).toHaveLength(1)
  })

  it('reemplazarDe deja exactamente esas tomas para esa persona y no toca a las demás', async () => {
    const { db } = nuevaBase()
    const tomas = new TomasDexie(db)
    await tomas.guardar(toma(1, 7))
    await tomas.guardar(toma(2, 7))
    await tomas.guardar(toma(9, 8))

    await tomas.reemplazarDe(7, [toma(2, 7, { estado: 'confirmada' }), toma(3, 7)])

    expect((await tomas.listar(7)).map((t) => [t.idOrden, t.estado])).toEqual([
      [2, 'confirmada'],
      [3, 'pendiente'],
    ])
    expect((await tomas.listar(8)).map((t) => t.idOrden)).toEqual([9])
  })

  it('sobreviven a cerrar y volver a abrir la base (una recarga)', async () => {
    const { db, nombre } = nuevaBase()
    await new TomasDexie(db).guardar(toma(1, 7))
    db.close()

    expect(await new TomasDexie(nuevaBase(nombre).db).listar(7)).toHaveLength(1)
  })
})

describe('migración de la base a la versión 3 (se añaden las tomas)', () => {
  it('una base de la versión 2 conserva sus fotos y sus órdenes, y empieza sin tomas', async () => {
    const nombre = `migracion-v3-${globalThis.crypto.randomUUID()}`
    const antigua = new Dexie(nombre)
    antigua.version(1).stores({
      fotos: 'clientId, &[ordenId+momento+zona], [ordenId+momento], estado',
      enEscritura: 'clientId, [ordenId+momento+zona], [ordenId+momento]',
    })
    antigua.version(2).stores({ ordenes: 'idOrden' })
    await antigua.open()
    await antigua.table('fotos').put(filaFoto('foto-vieja', 99))
    await antigua.table('ordenes').put({ ...ordenRemota(99), tomaSync: null, sincronizadaEn: 1, posicion: 0 })
    antigua.close()

    const { db } = nuevaBase(nombre)

    expect(await db.fotos.count()).toBe(1)
    expect(await db.ordenes.count()).toBe(1)
    expect(await db.tomas.count()).toBe(0)
  })
})

function filaFoto(clientId: string, ordenId: number, momento: FilaFoto['momento'] = 'salida', zona: FilaFoto['zona'] = 'FRONTAL'): FilaFoto {
  return {
    clientId,
    ordenId,
    momento,
    zona,
    blob: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }) as unknown as globalThis.Blob,
    ancho: 1,
    alto: 1,
    creadaEn: 1,
    estado: 'pending',
    storageKey: null,
    errorMessage: null,
    actualizadoEn: 1,
  }
}

describe('ConteoFotosDexie.borrarDeOrden', () => {
  it('borra las fotos de la orden, de los dos tramos y las que quedaron a medio escribir; las de otras órdenes no', async () => {
    const { db } = nuevaBase()
    await db.fotos.bulkPut([
      filaFoto('a', 1, 'salida', 'FRONTAL'),
      filaFoto('b', 1, 'entrega', 'VIN'),
      filaFoto('c', 2, 'salida', 'FRONTAL'),
    ])
    const aMedias: FilaEnEscritura = { ...filaFoto('d', 1, 'salida', 'POSTERIOR'), estado: 'writing' }
    await db.enEscritura.put(aMedias)

    await new ConteoFotosDexie(db).borrarDeOrden(1)

    expect((await db.fotos.toArray()).map((f) => f.clientId)).toEqual(['c'])
    expect(await db.enEscritura.count()).toBe(0)
  })

  it('una orden sin fotos no falla', async () => {
    const { db } = nuevaBase()
    await expect(new ConteoFotosDexie(db).borrarDeOrden(5)).resolves.toBeUndefined()
  })
})

describe('ConteoFotosDexie.borrarDeMomento', () => {
  it('borra solo las fotos de ese tramo de esa orden (también las a medio escribir); el otro tramo y las otras órdenes no', async () => {
    const { db } = nuevaBase()
    await db.fotos.bulkPut([
      filaFoto('a', 1, 'salida', 'FRONTAL'),
      filaFoto('b', 1, 'entrega', 'VIN'),
      filaFoto('c', 2, 'salida', 'FRONTAL'),
    ])
    const aMedias: FilaEnEscritura = { ...filaFoto('d', 1, 'salida', 'POSTERIOR'), estado: 'writing' }
    const otraAMedias: FilaEnEscritura = { ...filaFoto('e', 1, 'entrega', 'FRONTAL'), estado: 'writing' }
    await db.enEscritura.bulkPut([aMedias, otraAMedias])

    await new ConteoFotosDexie(db).borrarDeMomento(1, 'salida')

    expect((await db.fotos.toArray()).map((f) => f.clientId).sort()).toEqual(['b', 'c'])
    expect((await db.enEscritura.toArray()).map((f) => f.clientId)).toEqual(['e'])
  })

  it('un tramo sin fotos no falla', async () => {
    const { db } = nuevaBase()
    await expect(new ConteoFotosDexie(db).borrarDeMomento(5, 'entrega')).resolves.toBeUndefined()
  })
})
