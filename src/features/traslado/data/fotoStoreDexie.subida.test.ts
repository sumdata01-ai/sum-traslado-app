// @vitest-environment node
/** E4-01 en el almacén local: el estado de subida de cada foto, con IndexedDB real (fake-indexeddb). */
import { Blob } from 'node:buffer'
import { afterEach, describe, expect, it } from 'vitest'
import { ConteoFotosDexie } from './conteoFotos'
import type { FotoParaGuardar } from './fotoStorePort'
import { FotoStoreDexie } from './fotoStoreDexie'
import { TrasladoDb } from './trasladoDb'

const abiertas: TrasladoDb[] = []

function montar() {
  const db = new TrasladoDb(`subida-${globalThis.crypto.randomUUID()}`)
  abiertas.push(db)
  return { db, store: new FotoStoreDexie(db, { ahora: () => 5_000 }) }
}

afterEach(async () => {
  for (const db of abiertas.splice(0)) {
    db.close()
    await db.delete()
  }
})

const CLAVE = { ordenId: 812, momento: 'salida' as const }
const foto = (marca = 1): FotoParaGuardar => ({
  blob: new Blob([new Uint8Array(8).fill(marca)], { type: 'image/jpeg' }) as unknown as globalThis.Blob,
  ancho: 1280,
  alto: 720,
  creadaEn: 1_700_000_000_000 + marca,
})

describe('una foto recién guardada', () => {
  it('queda «pending», sin ruta en el bucket y sin error, y así la devuelven guardar y listar', async () => {
    const { store } = montar()

    const guardada = await store.guardar(CLAVE, 'FRONTAL', foto())
    const [listada] = await store.listar(CLAVE)

    for (const f of [guardada, listada]) {
      expect(f).toMatchObject({ estado: 'pending', storageKey: null, errorMessage: null })
    }
  })
})

describe('leerBlob (AC7: cada intento lee el archivo del almacén)', () => {
  it('devuelve el contenido guardado', async () => {
    const { store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto(7))
    const blob = await store.leerBlob(clientId)
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual(Array(8).fill(7))
  })

  it('devuelve null si la foto ya no existe, sin lanzar', async () => {
    const { store } = montar()
    expect(await store.leerBlob('no-existe')).toBeNull()
  })

  it('devuelve null si esa zona se repitió: el id viejo ya no está', async () => {
    const { store } = montar()
    const vieja = await store.guardar(CLAVE, 'FRONTAL', foto(1))
    await store.guardar(CLAVE, 'FRONTAL', foto(2))
    expect(await store.leerBlob(vieja.clientId)).toBeNull()
  })
})

describe('AC8 · marcarSubida', () => {
  it('pasa la foto a «uploaded» con su ruta del bucket y sin error', async () => {
    const { store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto())

    expect(await store.marcarSubida(clientId, 'traslado/2026/abc.jpg')).toBe(true)

    expect((await store.listar(CLAVE))[0]).toMatchObject({ estado: 'uploaded', storageKey: 'traslado/2026/abc.jpg', errorMessage: null })
  })

  it('el contador de fotos subidas de la home sube con ella', async () => {
    const { db, store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto())
    await store.guardar(CLAVE, 'POSTERIOR', foto())
    await store.marcarSubida(clientId, 'traslado/a.jpg')

    expect((await new ConteoFotosDexie(db).contar()).get(812)?.salida).toEqual({ archivo: 2, subidas: 1 })
  })

  it('una foto que ya no existe (se repitió la zona mientras subía) devuelve false y NO marca la nueva', async () => {
    const { store } = montar()
    const vieja = await store.guardar(CLAVE, 'FRONTAL', foto(1))
    await store.guardar(CLAVE, 'FRONTAL', foto(2)) // la nueva foto de la misma zona

    expect(await store.marcarSubida(vieja.clientId, 'traslado/vieja.jpg')).toBe(false)

    expect((await store.listar(CLAVE))[0]).toMatchObject({ estado: 'pending', storageKey: null })
  })

  it('una foto ya subida (por otra pestaña) devuelve false y conserva la ruta del que llegó primero', async () => {
    const { store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto())
    await store.marcarSubida(clientId, 'traslado/a.jpg')

    expect(await store.marcarSubida(clientId, 'traslado/b.jpg')).toBe(false)

    expect((await store.listar(CLAVE))[0]?.storageKey).toBe('traslado/a.jpg')
  })
})

describe('marcarFalloSubida y prepararReintento', () => {
  it('el fallo deja la foto «failed_upload» con el motivo y el archivo intacto', async () => {
    const { store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto(3))

    expect(await store.marcarFalloSubida(clientId, 'No se pudo subir la foto')).toBe(true)

    expect((await store.listar(CLAVE))[0]).toMatchObject({ estado: 'failed_upload', errorMessage: 'No se pudo subir la foto', storageKey: null })
    expect(await store.leerBlob(clientId)).not.toBeNull() // reintentar es posible: el archivo sigue ahí
  })

  it('prepararReintento la devuelve a «pending» y borra el error', async () => {
    const { store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto())
    await store.marcarFalloSubida(clientId, 'falló')

    expect(await store.prepararReintento(clientId)).toBe(true)

    expect((await store.listar(CLAVE))[0]).toMatchObject({ estado: 'pending', errorMessage: null })
  })

  it('prepararReintento solo vale para una foto fallida: una «pending» o «uploaded» devuelve false y no cambia', async () => {
    const { store } = montar()
    const pendiente = await store.guardar(CLAVE, 'FRONTAL', foto(1))
    const subida = await store.guardar(CLAVE, 'POSTERIOR', foto(2))
    await store.marcarSubida(subida.clientId, 'traslado/a.jpg')

    expect(await store.prepararReintento(pendiente.clientId)).toBe(false)
    expect(await store.prepararReintento(subida.clientId)).toBe(false)

    const estados = Object.fromEntries((await store.listar(CLAVE)).map((f) => [f.zona, f.estado]))
    expect(estados).toEqual({ FRONTAL: 'pending', POSTERIOR: 'uploaded' })
  })

  it('marcar el fallo de una foto que ya no existe devuelve false', async () => {
    const { store } = montar()
    expect(await store.marcarFalloSubida('no-existe', 'x')).toBe(false)
    expect(await store.prepararReintento('no-existe')).toBe(false)
  })

  it('un fallo que llega tras subirse bien (otra pestaña) no pisa la foto ya subida', async () => {
    const { store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto())
    await store.marcarSubida(clientId, 'traslado/a.jpg')

    expect(await store.marcarFalloSubida(clientId, 'tarde')).toBe(false)

    expect((await store.listar(CLAVE))[0]).toMatchObject({ estado: 'uploaded', storageKey: 'traslado/a.jpg' })
  })

  it('el ciclo completo: pending → fallida → pending → subida', async () => {
    const { store } = montar()
    const { clientId } = await store.guardar(CLAVE, 'FRONTAL', foto())
    const estado = async () => (await store.listar(CLAVE))[0]?.estado

    await store.marcarFalloSubida(clientId, 'falló')
    expect(await estado()).toBe('failed_upload')
    await store.prepararReintento(clientId)
    expect(await estado()).toBe('pending')
    await store.marcarSubida(clientId, 'traslado/a.jpg')
    expect(await estado()).toBe('uploaded')
  })
})

describe('repetir una zona ya subida', () => {
  it('la foto nueva empieza «pending» y sin ruta: la subida de la anterior no se hereda', async () => {
    const { store } = montar()
    const vieja = await store.guardar(CLAVE, 'FRONTAL', foto(1))
    await store.marcarSubida(vieja.clientId, 'traslado/vieja.jpg')

    await store.guardar(CLAVE, 'FRONTAL', foto(2))

    expect((await store.listar(CLAVE))[0]).toMatchObject({ estado: 'pending', storageKey: null })
  })
})
