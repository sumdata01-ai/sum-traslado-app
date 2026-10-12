// @vitest-environment node
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { EleccionLocal } from '../domain'
import { EleccionesDexie } from './eleccionesStore'
import { CatalogoCacheDexie } from './catalogoCache'
import { TrasladoDb } from './trasladoDb'

const abiertas: TrasladoDb[] = []
afterEach(async () => {
  for (const db of abiertas.splice(0)) {
    db.close()
    await db.delete()
  }
})

function nuevaBase(nombre = `elecciones-${globalThis.crypto.randomUUID()}`) {
  const db = new TrasladoDb(nombre)
  abiertas.push(db)
  return { db, nombre }
}

const eleccion = (idOrden: number, idUsuario: number | null, extra: Partial<EleccionLocal> = {}): EleccionLocal => ({
  idOrden,
  idUsuario,
  placa: { id: 40, nombre: 'EEB190', estado: 'en_uso' },
  proveedor: { id: 6, nombre: 'BENAVIDES', estado: null },
  elegidaEn: idOrden,
  ...extra,
})

describe('EleccionesDexie', () => {
  it('guarda y devuelve la elección tal cual, sin detalles del almacenamiento', async () => {
    const almacen = new EleccionesDexie(nuevaBase().db)
    const original = eleccion(5, 7, { proveedor: null })

    await almacen.guardar(original)

    const leidas = await almacen.listar(7)
    expect(leidas).toEqual([original])
    expect(leidas[0]).not.toHaveProperty('clave')
    expect(leidas[0]).not.toHaveProperty('dueno')
  })

  it('cada persona ve solo las suyas, también si eligieron para la misma orden', async () => {
    const almacen = new EleccionesDexie(nuevaBase().db)
    await almacen.guardar(eleccion(1, 7))
    await almacen.guardar(eleccion(1, 8, { placa: null }))
    await almacen.guardar(eleccion(2, 8))

    expect((await almacen.listar(7)).map((e) => e.idOrden)).toEqual([1])
    expect((await almacen.listar(8)).map((e) => e.idOrden)).toEqual([1, 2])
    expect((await almacen.listar(7))[0]?.placa).not.toBeNull()
  })

  it('una persona sin id conocido tiene sus propias elecciones, separadas', async () => {
    const almacen = new EleccionesDexie(nuevaBase().db)
    await almacen.guardar(eleccion(1, null))
    await almacen.guardar(eleccion(2, 7))
    expect((await almacen.listar(null)).map((e) => e.idOrden)).toEqual([1])
  })

  it('guardar otra vez la misma la actualiza, no la duplica', async () => {
    const almacen = new EleccionesDexie(nuevaBase().db)
    await almacen.guardar(eleccion(1, 7))
    await almacen.guardar(eleccion(1, 7, { placa: { id: 12, nombre: 'AAA111', estado: null } }))
    expect(await almacen.listar(7)).toMatchObject([{ idOrden: 1, placa: { id: 12 } }])
  })

  it('quitar borra solo la de esa persona', async () => {
    const almacen = new EleccionesDexie(nuevaBase().db)
    await almacen.guardar(eleccion(1, 7))
    await almacen.guardar(eleccion(1, 8))
    await almacen.quitar(7, 1)
    expect(await almacen.listar(7)).toEqual([])
    expect(await almacen.listar(8)).toHaveLength(1)
  })

  it('reemplazarDe deja exactamente esas para esa persona y no toca a las demás', async () => {
    const almacen = new EleccionesDexie(nuevaBase().db)
    await almacen.guardar(eleccion(1, 7))
    await almacen.guardar(eleccion(2, 7))
    await almacen.guardar(eleccion(9, 8))

    await almacen.reemplazarDe(7, [eleccion(2, 7, { proveedor: null }), eleccion(3, 7)])

    expect((await almacen.listar(7)).map((e) => e.idOrden)).toEqual([2, 3])
    expect((await almacen.listar(8)).map((e) => e.idOrden)).toEqual([9])
  })

  it('sobreviven a cerrar y volver a abrir la base (una recarga)', async () => {
    const { db, nombre } = nuevaBase()
    await new EleccionesDexie(db).guardar(eleccion(1, 7))
    db.close()
    expect(await new EleccionesDexie(nuevaBase(nombre).db).listar(7)).toHaveLength(1)
  })
})

describe('migración de la base a la versión 5 (se añaden las elecciones)', () => {
  it('una base de la versión 4 conserva sus tomas y su catálogo, y las elecciones empiezan vacías', async () => {
    const nombre = `migracion-v5-${globalThis.crypto.randomUUID()}`
    const antigua = new Dexie(nombre)
    antigua.version(1).stores({
      fotos: 'clientId, &[ordenId+momento+zona], [ordenId+momento], estado',
      enEscritura: 'clientId, [ordenId+momento+zona], [ordenId+momento]',
    })
    antigua.version(2).stores({ ordenes: 'idOrden' })
    antigua.version(3).stores({ tomas: 'clave, dueno' })
    antigua.version(4).stores({ catalogos: 'clave, tipo' })
    await antigua.open()
    await antigua.table('tomas').put({ clave: '7:1', dueno: '7', idOrden: 1, idUsuario: 7, estado: 'pendiente', tomadaEn: 1, mensaje: null, orden: {} })
    antigua.close()
    const previa = nuevaBase(nombre)
    await new CatalogoCacheDexie(previa.db).reemplazar({ placas: [{ id: 1, nombre: 'X', estado: null }], proveedores: [] })
    previa.db.close()

    const { db } = nuevaBase(nombre)

    expect(await db.tomas.count()).toBe(1)
    expect(await new CatalogoCacheDexie(db).leer()).toMatchObject({ placas: [{ id: 1 }] })
    expect(await db.elecciones.count()).toBe(0)
  })
})
