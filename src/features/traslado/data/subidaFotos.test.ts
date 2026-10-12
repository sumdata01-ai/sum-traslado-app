// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import type { StorageApi, UrlDeSubida } from '../api/storageApi'
import { SubidaError, type subirBlobAGcs } from '../api/subidaGcs'
import { AlmacenEnMemoria } from './almacenEnMemoria'
import type { FotoParaGuardar } from './fotoStorePort'
import { almacenDelegando } from './testing/almacenes'
import { RENOVACIONES_DE_URL, SubidaFotos } from './subidaFotos'

const CLAVE = { ordenId: 812, momento: 'salida' as const }
const foto = (): FotoParaGuardar => ({ blob: new Blob([new Uint8Array(8)], { type: 'image/jpeg' }), ancho: 1280, alto: 720, creadaEn: 1 })

let contador = 0
const permiso = (): UrlDeSubida => {
  contador++
  return { urlDeSubida: `https://storage.googleapis.com/b/traslado/${contador}.jpg?firma=${contador}`, storageKey: `traslado/${contador}.jpg`, venceEnSegundos: 900 }
}

type Subir = typeof subirBlobAGcs

async function montar(opciones: { pedir?: () => Promise<UrlDeSubida>; subir?: Subir; store?: (real: AlmacenEnMemoria) => ReturnType<typeof almacenDelegando> } = {}) {
  const real = new AlmacenEnMemoria()
  const store = opciones.store ? opciones.store(real) : real
  const pedirUrlDeSubida = vi.fn(opciones.pedir ?? (async () => permiso()))
  const subir = vi.fn<Subir>(opciones.subir ?? (async () => undefined))
  const subidas = new SubidaFotos({ store, storage: { pedirUrlDeSubida } as StorageApi, subir })
  const guardada = await real.guardar(CLAVE, 'FRONTAL', foto())
  const estado = async () => (await real.listar(CLAVE))[0]!
  return { subidas, real, pedirUrlDeSubida, subir, guardada, id: guardada.clientId, estado }
}

const fallo = (tipo: ConstructorParameters<typeof SubidaError>[0], status: number | null = null) => () => Promise.reject(new SubidaError(tipo, `fallo ${tipo}`, status))

describe('AC1 y AC8 · el camino feliz', () => {
  it('pide la URL, sube el archivo con su tipo, y deja la foto «uploaded» con la ruta del bucket', async () => {
    const m = await montar()

    const resultado = await m.subidas.subir(m.id)

    expect(m.pedirUrlDeSubida).toHaveBeenCalledTimes(1)
    expect(m.subir).toHaveBeenCalledTimes(1)
    const [url, blob, tipo] = m.subir.mock.calls[0]!
    expect(url).toMatch(/^https:\/\/storage\.googleapis\.com\//)
    expect(blob.size).toBe(8)
    expect(tipo).toBe('image/jpeg')
    expect(resultado).toEqual({ tipo: 'subida', storageKey: 'traslado/' + contador + '.jpg' })
    expect(await m.estado()).toMatchObject({ estado: 'uploaded', storageKey: resultado.tipo === 'subida' ? resultado.storageKey : '' })
  })

  it('la ruta que se marca es la de la URL con la que se subió (no la de otra)', async () => {
    const m = await montar()
    const resultado = await m.subidas.subir(m.id)
    const urlUsada = m.subir.mock.calls[0]![0]
    expect(resultado.tipo === 'subida' && urlUsada.includes(resultado.storageKey.replace('traslado/', ''))).toBe(true)
  })

  it('mientras sube dice que está en curso, y al terminar deja de estarlo', async () => {
    let terminar: () => void = () => undefined
    const m = await montar({ subir: () => new Promise<void>((r) => (terminar = r)) })
    const avisos: number[] = []
    m.subidas.suscribir(() => avisos.push(m.subidas.getSnapshot().enCurso.size))

    const subida = m.subidas.subir(m.id)
    await vi.waitFor(() => expect(m.subir).toHaveBeenCalled())
    expect(m.subidas.getSnapshot().enCurso.has(m.id)).toBe(true)

    terminar()
    await subida
    expect(m.subidas.getSnapshot().enCurso.has(m.id)).toBe(false)
    expect(avisos).toEqual([1, 0])
  })

  it('dos pedidos para la misma foto son una sola subida', async () => {
    let terminar: () => void = () => undefined
    const m = await montar({ subir: () => new Promise<void>((r) => (terminar = r)) })

    const a = m.subidas.subir(m.id)
    const b = m.subidas.subir(m.id)
    await vi.waitFor(() => expect(m.subir).toHaveBeenCalled())
    terminar()
    expect(await a).toEqual(await b)

    expect(m.pedirUrlDeSubida).toHaveBeenCalledTimes(1)
    expect(m.subir).toHaveBeenCalledTimes(1)
  })
})

describe('AC4 · 403: se pide una URL nueva, hasta 2 veces', () => {
  it('si vence una vez y luego sube, funciona con la segunda URL y queda subida', async () => {
    const respuestas: Array<() => Promise<void>> = [fallo('vencida', 403), async () => undefined]
    const m = await montar({ subir: () => respuestas.shift()!() })

    const resultado = await m.subidas.subir(m.id)

    expect(m.pedirUrlDeSubida).toHaveBeenCalledTimes(2)
    expect(m.subir).toHaveBeenCalledTimes(2)
    expect(m.subir.mock.calls[0]![0]).not.toBe(m.subir.mock.calls[1]![0]) // la segunda es una URL nueva
    expect(resultado.tipo).toBe('subida')
    expect((await m.estado()).estado).toBe('uploaded')
  })

  it('con 403 tres veces seguidas se rinde: 1 + 2 renovaciones, y queda fallida con el mensaje', async () => {
    const m = await montar({ subir: fallo('vencida', 403) })

    const resultado = await m.subidas.subir(m.id)

    expect(RENOVACIONES_DE_URL).toBe(2)
    expect(m.pedirUrlDeSubida).toHaveBeenCalledTimes(3)
    expect(m.subir).toHaveBeenCalledTimes(3)
    expect(resultado).toEqual({ tipo: 'fallida', mensaje: 'fallo vencida', reintentable: true })
    expect(await m.estado()).toMatchObject({ estado: 'failed_upload', errorMessage: 'fallo vencida' })
  })
})

describe('los demás fallos: un intento y «Reintentar»', () => {
  it.each([
    ['red', 'red', true],
    ['servidor', 'servidor', true],
  ] as const)('AC6 · un fallo de %s no se repite solo: un solo intento, queda fallida y reintentable', async (_nombre, tipo, reintentable) => {
    const m = await montar({ subir: fallo(tipo, tipo === 'servidor' ? 503 : null) })

    const resultado = await m.subidas.subir(m.id)

    expect(m.subir).toHaveBeenCalledTimes(1)
    expect(m.pedirUrlDeSubida).toHaveBeenCalledTimes(1)
    expect(resultado).toMatchObject({ tipo: 'fallida', reintentable })
    expect((await m.estado()).estado).toBe('failed_upload')
  })

  it('AC5 · un 4xx distinto de 403 se aborta sin reintentar y se dice que reintentar no sirve', async () => {
    const m = await montar({ subir: fallo('rechazada', 400) })

    const resultado = await m.subidas.subir(m.id)

    expect(m.subir).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual({ tipo: 'fallida', mensaje: 'fallo rechazada', reintentable: false })
    expect(await m.estado()).toMatchObject({ estado: 'failed_upload', errorMessage: 'fallo rechazada' })
  })

  it('un error que no es de subida (algo imprevisto) se trata como falla de red, sin perder la foto', async () => {
    const m = await montar({ subir: () => Promise.reject(new TypeError('raro')) })
    const resultado = await m.subidas.subir(m.id)
    expect(resultado).toMatchObject({ tipo: 'fallida', reintentable: true })
    expect((await m.estado()).estado).toBe('failed_upload')
  })
})

describe('fallos al pedir la URL firmada', () => {
  it('sin conexión: «Sin conexión», reintentable, y no se intenta subir', async () => {
    const m = await montar({ pedir: () => Promise.reject(new ApiError('Sin conexión al backend o internet.')) })
    const resultado = await m.subidas.subir(m.id)
    expect(resultado).toEqual({ tipo: 'fallida', mensaje: 'Sin conexión: no se pudo subir la foto.', reintentable: true })
    expect(m.subir).not.toHaveBeenCalled()
    expect((await m.estado()).estado).toBe('failed_upload')
  })

  it.each([
    [503, 'Storage no configurado', true],
    [500, 'Error interno', true],
    [429, 'Demasiados intentos', true],
    [400, 'storage_key inválido', false],
    [422, 'content_type no soportado', false],
  ])('un %i del backend (%s) se muestra con su mensaje; reintentable: %s', async (status, mensaje, reintentable) => {
    const m = await montar({ pedir: () => Promise.reject(new ApiError(mensaje, { status })) })
    expect(await m.subidas.subir(m.id)).toEqual({ tipo: 'fallida', mensaje, reintentable })
    expect(m.subir).not.toHaveBeenCalled()
  })

  it('un error imprevisto al pedir la URL tiene un mensaje general', async () => {
    const m = await montar({ pedir: () => Promise.reject(new TypeError('raro')) })
    expect(await m.subidas.subir(m.id)).toMatchObject({ tipo: 'fallida', mensaje: 'No se pudo preparar la subida de la foto.' })
  })
})

describe('AC7 · cada intento lee el archivo del almacén', () => {
  it('lee el blob del almacén al empezar, no una copia en memoria', async () => {
    const leerBlob = vi.fn(async () => new Blob([new Uint8Array(3)], { type: 'image/jpeg' }))
    const m = await montar({ store: (real) => almacenDelegando(real, { leerBlob }) })

    await m.subidas.subir(m.id)

    expect(leerBlob).toHaveBeenCalledWith(m.id)
    expect(m.subir.mock.calls[0]![1].size).toBe(3) // lo que devolvió el almacén
  })

  it('si el archivo ya no está, falla SIN reintentar, sin pedir URL y dice que hay que volver a tomarla', async () => {
    const m = await montar({ store: (real) => almacenDelegando(real, { leerBlob: async () => null }) })

    const resultado = await m.subidas.subir(m.id)

    expect(resultado).toEqual({ tipo: 'fallida', mensaje: 'La foto ya no está en este teléfono. Vuelve a tomarla.', reintentable: false })
    expect(m.pedirUrlDeSubida).not.toHaveBeenCalled()
    expect(m.subir).not.toHaveBeenCalled()
  })

  it('si el almacén falla al leer, se avisa sin dejar la foto a medias', async () => {
    const m = await montar({ store: (real) => almacenDelegando(real, { leerBlob: () => Promise.reject(new Error('IndexedDB')) }) })
    expect(await m.subidas.subir(m.id)).toMatchObject({ tipo: 'fallida', mensaje: 'No se pudo leer la foto de este teléfono.', reintentable: true })
  })
})

describe('Reintentar', () => {
  it('devuelve la foto fallida a «pending» y la sube; si sale bien, queda subida', async () => {
    const respuestas: Array<() => Promise<void>> = [fallo('red'), async () => undefined]
    const m = await montar({ subir: () => respuestas.shift()!() })
    await m.subidas.subir(m.id)
    expect((await m.estado()).estado).toBe('failed_upload')

    const resultado = await m.subidas.reintentar(m.id)

    expect(resultado.tipo).toBe('subida')
    expect(await m.estado()).toMatchObject({ estado: 'uploaded', errorMessage: null })
  })

  it('si vuelve a fallar, sigue fallida con el motivo nuevo', async () => {
    const respuestas: Array<() => Promise<void>> = [fallo('red'), fallo('servidor', 503)]
    const m = await montar({ subir: () => respuestas.shift()!() })
    await m.subidas.subir(m.id)

    await m.subidas.reintentar(m.id)

    expect(await m.estado()).toMatchObject({ estado: 'failed_upload', errorMessage: 'fallo servidor' })
  })

  it('una foto que no está fallida (ya subida) no se vuelve a subir', async () => {
    const m = await montar()
    await m.subidas.subir(m.id)
    m.subir.mockClear()

    expect(await m.subidas.reintentar(m.id)).toEqual({ tipo: 'ausente' })
    expect(m.subir).not.toHaveBeenCalled()
  })

  it('pulsar «Reintentar» dos veces seguidas es una sola subida', async () => {
    let terminar: () => void = () => undefined
    const primera: () => Promise<void> = fallo('red')
    const respuestas: Array<() => Promise<void>> = [primera, () => new Promise<void>((r) => (terminar = r))]
    const m = await montar({ subir: () => respuestas.shift()!() })
    await m.subidas.subir(m.id)

    const a = m.subidas.reintentar(m.id)
    const b = m.subidas.reintentar(m.id)
    await vi.waitFor(() => expect(m.subir).toHaveBeenCalledTimes(2))
    terminar()
    await Promise.all([a, b])

    expect(m.subir).toHaveBeenCalledTimes(2) // la original y UN reintento
  })

  it('un fallo del almacén al preparar el reintento se avisa y no lanza', async () => {
    const m = await montar({ store: (real) => almacenDelegando(real, { prepararReintento: () => Promise.reject(new Error('IndexedDB')) }) })
    expect(await m.subidas.reintentar(m.id)).toMatchObject({ tipo: 'fallida', reintentable: true })
  })
})

describe('la foto desaparece o la resuelve otra pestaña', () => {
  it('si se repitió la zona mientras subía, el resultado no marca la foto nueva y no es un error', async () => {
    let terminar: () => void = () => undefined
    const m = await montar({ subir: () => new Promise<void>((r) => (terminar = r)) })
    const subida = m.subidas.subir(m.id)
    await vi.waitFor(() => expect(m.subir).toHaveBeenCalled())

    await m.real.guardar(CLAVE, 'FRONTAL', foto()) // la zona se repite: la foto vieja deja de existir
    terminar()

    expect(await subida).toEqual({ tipo: 'ausente' })
    expect(await m.estado()).toMatchObject({ estado: 'pending', storageKey: null })
  })

  it('un fallo de una foto que ya no existe no lanza', async () => {
    let fallar: (e: unknown) => void = () => undefined
    const m = await montar({ subir: () => new Promise<void>((_ok, no) => (fallar = no)) })
    const subida = m.subidas.subir(m.id)
    await vi.waitFor(() => expect(m.subir).toHaveBeenCalled())
    await m.real.guardar(CLAVE, 'FRONTAL', foto())

    fallar(new SubidaError('red', 'sin red'))

    expect(await subida).toMatchObject({ tipo: 'fallida' })
    expect(await m.estado()).toMatchObject({ estado: 'pending', errorMessage: null }) // la foto nueva no heredó el fallo
  })
})

describe('nunca se manda el token de sesión a GCS', () => {
  it('la función de subida solo recibe la URL firmada, el archivo y el tipo', async () => {
    const m = await montar()
    await m.subidas.subir(m.id)
    expect(m.subir.mock.calls[0]).toHaveLength(3)
    expect(m.subir.mock.calls[0]![2]).toBe('image/jpeg')
  })
})
