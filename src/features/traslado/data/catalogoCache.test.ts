// @vitest-environment node
import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalogos } from '../domain'
import { CatalogoCacheDexie } from './catalogoCache'
import { TrasladoDb } from './trasladoDb'

const abiertas: TrasladoDb[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of abiertas.splice(0)) {
    db.close()
    await db.delete()
  }
})

function nuevaBase(nombre = `catalogo-${globalThis.crypto.randomUUID()}`) {
  const db = new TrasladoDb(nombre)
  abiertas.push(db)
  return { db, nombre }
}

const catalogos = (): Catalogos => ({
  placas: [
    { id: 40, nombre: 'EEB190', estado: 'en_uso' },
    { id: 12, nombre: 'AAA111', estado: 'disponible' },
    { id: 30, nombre: 'CCC333', estado: null },
  ],
  proveedores: [
    { id: 6, nombre: 'BENAVIDES', estado: null },
    { id: 3, nombre: 'GRAND PRIX', estado: null },
  ],
})

describe('CatalogoCacheDexie', () => {
  it('nunca descargado: devuelve null (no un catálogo vacío), para poder explicarlo', async () => {
    expect(await new CatalogoCacheDexie(nuevaBase().db).leer()).toBeNull()
  })

  it('guarda y devuelve placas y proveedores tal cual, sin detalles del almacenamiento', async () => {
    const cache = new CatalogoCacheDexie(nuevaBase().db)
    await cache.reemplazar(catalogos())

    const leido = await cache.leer()

    expect(leido).toEqual(catalogos())
    expect(leido?.placas[0]).not.toHaveProperty('clave')
    expect(leido?.placas[0]).not.toHaveProperty('posicion')
    expect(leido?.placas[0]).not.toHaveProperty('tipo')
  })

  it('conserva el orden en que el servidor entregó cada lista, no el de la clave', async () => {
    const cache = new CatalogoCacheDexie(nuevaBase().db)
    await cache.reemplazar(catalogos())
    expect((await cache.leer())?.placas.map((p) => p.id)).toEqual([40, 12, 30])
    expect((await cache.leer())?.proveedores.map((p) => p.id)).toEqual([6, 3])
  })

  it('una placa y un proveedor con el mismo id no se pisan', async () => {
    const cache = new CatalogoCacheDexie(nuevaBase().db)
    await cache.reemplazar({ placas: [{ id: 5, nombre: 'PLACA5', estado: 'disponible' }], proveedores: [{ id: 5, nombre: 'PROV5', estado: null }] })
    const leido = await cache.leer()
    expect(leido?.placas.map((p) => p.nombre)).toEqual(['PLACA5'])
    expect(leido?.proveedores.map((p) => p.nombre)).toEqual(['PROV5'])
  })

  it('reemplazar sustituye todo el contenido anterior', async () => {
    const cache = new CatalogoCacheDexie(nuevaBase().db)
    await cache.reemplazar(catalogos())
    await cache.reemplazar({ placas: [{ id: 99, nombre: 'NUEVA', estado: 'disponible' }], proveedores: [] })
    expect(await cache.leer()).toEqual({ placas: [{ id: 99, nombre: 'NUEVA', estado: 'disponible' }], proveedores: [] })
  })

  it('es todo o nada: si la escritura falla a mitad, el catálogo anterior sigue intacto', async () => {
    const { db } = nuevaBase()
    const cache = new CatalogoCacheDexie(db)
    await cache.reemplazar(catalogos())
    vi.spyOn(db.catalogos, 'bulkPut').mockRejectedValueOnce(new Error('disco lleno'))

    await expect(cache.reemplazar({ placas: [{ id: 1, nombre: 'X', estado: null }], proveedores: [] })).rejects.toThrow('disco lleno')

    expect(await cache.leer()).toEqual(catalogos()) // el clear() se deshizo: no se queda sin catálogo
  })

  it('sobrevive a cerrar y volver a abrir la base (una recarga)', async () => {
    const { db, nombre } = nuevaBase()
    await new CatalogoCacheDexie(db).reemplazar(catalogos())
    db.close()

    expect(await new CatalogoCacheDexie(nuevaBase(nombre).db).leer()).toEqual(catalogos())
  })
})

describe('migración de la base a la versión 4 (se añade el catálogo)', () => {
  it('una base de la versión 3 conserva sus tomas, y el catálogo empieza vacío', async () => {
    const nombre = `migracion-v4-${globalThis.crypto.randomUUID()}`
    const antigua = new Dexie(nombre)
    antigua.version(1).stores({
      fotos: 'clientId, &[ordenId+momento+zona], [ordenId+momento], estado',
      enEscritura: 'clientId, [ordenId+momento+zona], [ordenId+momento]',
    })
    antigua.version(2).stores({ ordenes: 'idOrden' })
    antigua.version(3).stores({ tomas: 'clave, dueno' })
    await antigua.open()
    await antigua.table('tomas').put({ clave: '7:1', dueno: '7', idOrden: 1, idUsuario: 7, estado: 'pendiente', tomadaEn: 1, mensaje: null, orden: {} })
    antigua.close()

    const { db } = nuevaBase(nombre)

    expect(await db.tomas.count()).toBe(1)
    expect(await new CatalogoCacheDexie(db).leer()).toBeNull()
  })
})
