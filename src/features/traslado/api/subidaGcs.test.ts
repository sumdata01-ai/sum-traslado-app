// @vitest-environment node
import { Blob } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { createApiClient } from '@/core/http/apiClient'
import { MODULO_STORAGE, TIPO_FOTO, crearStorageApi } from './storageApi'
import { MENSAJES_SUBIDA, SubidaError, subirBlobAGcs } from './subidaGcs'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

const URL_GCS = 'https://storage.googleapis.com/bucket/traslado/abc.jpg?X-Goog-Signature=firma'
const foto = () => new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }) as unknown as globalThis.Blob

describe('pedirUrlDeSubida', () => {
  function api(respuesta: () => Response | Promise<Response>, getToken: () => string | null = () => 'token-de-sesion') {
    const fetchImpl = vi.fn<typeof fetch>(async () => respuesta())
    const cliente = createApiClient({ getToken, refreshSession: async () => 'expirada', limpiarSesion: () => undefined, fetchImpl })
    return { storage: crearStorageApi(cliente), fetchImpl }
  }

  it('AC1 · pide la URL con `module: traslado` y `content_type: image/jpeg`, con POST', async () => {
    const { storage, fetchImpl } = api(() => json(200, { upload_url: URL_GCS, storage_key: 'traslado/abc.jpg', expires_in: 900 }))

    await storage.pedirUrlDeSubida()

    const [ruta, init] = fetchImpl.mock.calls[0]!
    expect(ruta).toBe('/mobile/storage/upload-url')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ module: 'traslado', content_type: 'image/jpeg' })
    expect([MODULO_STORAGE, TIPO_FOTO]).toEqual(['traslado', 'image/jpeg'])
  })

  it('lee la URL, la ruta del archivo y cuánto dura el permiso', async () => {
    const { storage } = api(() => json(200, { upload_url: URL_GCS, storage_key: 'traslado/2026/abc-123.jpg', expires_in: 900 }))
    expect(await storage.pedirUrlDeSubida()).toEqual({ urlDeSubida: URL_GCS, storageKey: 'traslado/2026/abc-123.jpg', venceEnSegundos: 900 })
  })

  it.each([
    ['sin la URL', { storage_key: 'traslado/a.jpg', expires_in: 900 }],
    ['sin la ruta', { upload_url: URL_GCS, expires_in: 900 }],
    ['con una URL que no es una URL', { upload_url: 'no es una url', storage_key: 'traslado/a.jpg', expires_in: 900 }],
    ['con una ruta vacía', { upload_url: URL_GCS, storage_key: '', expires_in: 900 }],
    ['con una ruta que intenta salirse de la carpeta', { upload_url: URL_GCS, storage_key: 'traslado/../secreto.jpg', expires_in: 900 }],
    ['con una ruta con caracteres raros', { upload_url: URL_GCS, storage_key: 'traslado/a b?.jpg', expires_in: 900 }],
    ['un cuerpo nulo', null],
  ])('una respuesta %s es un 502, no una red caída', async (_nombre, cuerpo) => {
    const { storage } = api(() => json(200, cuerpo))
    const error = await storage.pedirUrlDeSubida().catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502 })
    expect((error as ApiError).isNetwork).toBe(false)
  })

  it('un 503 («Storage no configurado») llega como error con código', async () => {
    const { storage } = api(() => json(503, { detail: 'Storage no configurado' }))
    await expect(storage.pedirUrlDeSubida()).rejects.toMatchObject({ status: 503, message: 'Storage no configurado' })
  })

  it('sin red falla como red caída (sin código)', async () => {
    const cliente = createApiClient({
      getToken: () => 't',
      refreshSession: async () => 'ok',
      limpiarSesion: () => undefined,
      fetchImpl: vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
    })
    const error = await crearStorageApi(cliente).pedirUrlDeSubida().catch((e: unknown) => e)
    expect((error as ApiError).isNetwork).toBe(true)
  })
})

describe('subirBlobAGcs', () => {
  const respuesta = (status: number) => new Response(null, { status })

  it('AC2 · hace PUT con el MISMO Content-Type, el archivo como cuerpo y sin credenciales', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => respuesta(200))
    const archivo = foto()

    await subirBlobAGcs(URL_GCS, archivo, 'image/jpeg', { fetchImpl })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(URL_GCS)
    expect(init?.method).toBe('PUT')
    expect(init?.body).toBe(archivo)
    expect(init?.credentials).toBe('omit')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('image/jpeg')
  })

  it('AC2 · NUNCA manda el token de sesión ni cookies al dominio del almacenamiento', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => respuesta(200))
    await subirBlobAGcs(URL_GCS, foto(), 'image/jpeg', { fetchImpl })
    const encabezados = new Headers(fetchImpl.mock.calls[0]![1]?.headers)
    expect([...encabezados.keys()]).toEqual(['content-type'])
    expect(encabezados.has('authorization')).toBe(false)
  })

  it.each([200, 201, 204])('un %i es éxito', async (status) => {
    await expect(subirBlobAGcs(URL_GCS, foto(), 'image/jpeg', { fetchImpl: async () => respuesta(status) })).resolves.toBeUndefined()
  })

  it('AC4 · un 403 es «vencida» (se pide otra URL), no un error de red', async () => {
    const error = await subirBlobAGcs(URL_GCS, foto(), 'image/jpeg', { fetchImpl: async () => respuesta(403) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SubidaError)
    expect(error).toMatchObject({ tipo: 'vencida', status: 403, reintentable: true, message: MENSAJES_SUBIDA.vencida })
  })

  it.each([400, 401, 404, 412])('AC5 · un %i es «rechazada» y reintentar no lo arregla', async (status) => {
    const error = await subirBlobAGcs(URL_GCS, foto(), 'image/jpeg', { fetchImpl: async () => respuesta(status) }).catch((e: unknown) => e)
    expect(error).toMatchObject({ tipo: 'rechazada', status, reintentable: false })
  })

  it.each([500, 502, 503])('un %i es «servidor» y sí vale la pena reintentar', async (status) => {
    const error = await subirBlobAGcs(URL_GCS, foto(), 'image/jpeg', { fetchImpl: async () => respuesta(status) }).catch((e: unknown) => e)
    expect(error).toMatchObject({ tipo: 'servidor', status, reintentable: true })
  })

  it('AC6 · un TypeError sin código (red caída o CORS) dice «conexión o permisos del almacenamiento»', async () => {
    const error = await subirBlobAGcs(URL_GCS, foto(), 'image/jpeg', {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch')
      },
    }).catch((e: unknown) => e)
    expect(error).toMatchObject({ tipo: 'red', status: null, reintentable: true })
    expect((error as Error).message).toMatch(/conexión o los permisos del almacenamiento/)
  })

  it('se corta si tarda demasiado, y se dice como una falla de red', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_ok, no) => {
          init?.signal?.addEventListener('abort', () => no(new DOMException('tiempo agotado', 'TimeoutError')))
        }),
    )
    const error = await subirBlobAGcs(URL_GCS, foto(), 'image/jpeg', { fetchImpl, tiempoMaximoMs: 20 }).catch((e: unknown) => e)
    expect(error).toMatchObject({ tipo: 'red' })
  })
})
