// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { CatalogosLeidos } from '../api/trasladoApi'
import { ApiError } from '@/core/http/ApiError'
import type { Catalogos } from '../domain'
import { CatalogoEnMemoria } from './catalogoCache'
import { CatalogoTraslado } from './catalogoTraslado'

const catalogo = (extra: Partial<Catalogos> = {}): Catalogos => ({
  placas: [
    { id: 1, nombre: 'EEB190', estado: 'en_uso' },
    { id: 2, nombre: 'EEB191', estado: 'disponible' },
  ],
  proveedores: [{ id: 6, nombre: 'BENAVIDES', estado: null }],
  ...extra,
})

function montar(respuesta: () => Promise<CatalogosLeidos> = async () => ({ ...catalogo(), descartadas: 0 })) {
  const catalogos = vi.fn(respuesta)
  const cache = new CatalogoEnMemoria()
  const controlador = new CatalogoTraslado({
    api: { catalogos } as unknown as ConstructorParameters<typeof CatalogoTraslado>[0]['api'],
    cache,
  })
  return { controlador, catalogos, cache, snap: () => controlador.getSnapshot() }
}

const redCaida = () => Promise.reject(new ApiError('Sin conexión al backend o internet.'))

describe('primero lo guardado, después el servidor', () => {
  it('antes de leer nada está «cargando» y sin descargar', () => {
    expect(montar().snap()).toMatchObject({ cargando: true, nuncaDescargado: true, placas: [], proveedores: [] })
  })

  it('muestra lo guardado ANTES de que el servidor responda', async () => {
    let responder: (c: CatalogosLeidos) => void = () => undefined
    const m = montar(() => new Promise<CatalogosLeidos>((resolver) => (responder = resolver)))
    m.cache.guardado = catalogo({ placas: [{ id: 9, nombre: 'GUARDADA', estado: null }] })

    const carga = m.controlador.iniciar()
    await vi.waitFor(() => expect(m.snap().placas).toHaveLength(1))

    expect(m.snap()).toMatchObject({ cargando: false, actualizando: true, nuncaDescargado: false })
    responder({ ...catalogo(), descartadas: 0 })
    await carga
    expect(m.snap().placas.map((p) => p.nombre)).toEqual(['EEB190', 'EEB191'])
    expect(m.snap().actualizando).toBe(false)
  })

  it('lo que llega del servidor queda guardado para la próxima vez', async () => {
    const m = montar()
    await m.controlador.iniciar()
    expect(m.cache.guardado).toEqual(catalogo())
  })
})

describe('AC3 · sin conexión se usa el catálogo guardado', () => {
  it('con la red caída se siguen ofreciendo las placas guardadas y se avisa', async () => {
    const m = montar(redCaida)
    m.cache.guardado = catalogo()

    await m.controlador.iniciar()

    expect(m.snap()).toMatchObject({ sinConexion: true, error: null, nuncaDescargado: false })
    expect(m.snap().placas.map((p) => p.nombre)).toEqual(['EEB190', 'EEB191'])
    expect(m.cache.guardado).toEqual(catalogo()) // no se tocó
  })

  it('nunca descargado y sin red: queda vacío PERO dice que nunca se descargó', async () => {
    const m = montar(redCaida)
    await m.controlador.iniciar()
    expect(m.snap()).toMatchObject({ placas: [], proveedores: [], nuncaDescargado: true, sinConexion: true })
  })

  it('al volver la red, la siguiente actualización quita el aviso y trae lo nuevo', async () => {
    const respuestas: Array<() => Promise<CatalogosLeidos>> = [redCaida, async () => ({ ...catalogo(), descartadas: 0 })]
    const m = montar(() => respuestas.shift()!())
    await m.controlador.iniciar()
    await m.controlador.actualizar()
    expect(m.snap()).toMatchObject({ sinConexion: false, nuncaDescargado: false })
    expect(m.snap().placas).toHaveLength(2)
  })
})

describe('errores que no son falta de red', () => {
  it('un error del servidor se muestra aparte y no vacía lo que hay', async () => {
    const m = montar(() => Promise.reject(new ApiError('Error interno', { status: 500 })))
    m.cache.guardado = catalogo()
    await m.controlador.iniciar()
    expect(m.snap()).toMatchObject({ error: 'Error interno', sinConexion: false })
    expect(m.snap().placas).toHaveLength(2)
  })

  it('un 403 («sin permiso») se muestra como error, sin cerrar nada', async () => {
    const m = montar(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))
    await m.controlador.iniciar()
    expect(m.snap().error).toBe('Permisos insuficientes')
  })

  it('un error que no es de la API tiene un mensaje general', async () => {
    const m = montar(() => Promise.reject(new TypeError('raro')))
    await m.controlador.iniciar()
    expect(m.snap().error).toBe('No se pudieron traer las placas y proveedores.')
  })
})

describe('el disco no es imprescindible', () => {
  it('si no se puede leer lo guardado, igual se pide al servidor', async () => {
    const m = montar()
    m.cache.falla.leer = true
    await m.controlador.iniciar()
    expect(m.snap().placas).toHaveLength(2)
  })

  it('si no se puede escribir, igual se usa lo que trajo el servidor', async () => {
    const m = montar()
    m.cache.falla.reemplazar = true
    await m.controlador.iniciar()
    expect(m.snap().placas).toHaveLength(2)
    expect(m.snap().error).toBeNull()
  })
})

describe('una sola petición a la vez, y salir de la pantalla', () => {
  it('varias actualizaciones simultáneas comparten una sola petición', async () => {
    let responder: (c: CatalogosLeidos) => void = () => undefined
    const m = montar(() => new Promise<CatalogosLeidos>((resolver) => (responder = resolver)))
    const llamadas = [m.controlador.actualizar(), m.controlador.actualizar(), m.controlador.actualizar()]
    await vi.waitFor(() => expect(m.catalogos).toHaveBeenCalled())
    responder({ ...catalogo(), descartadas: 0 })
    await Promise.all(llamadas)
    expect(m.catalogos).toHaveBeenCalledTimes(1)
  })

  it('lo que llega después de liberar se descarta y no se guarda', async () => {
    let responder: (c: CatalogosLeidos) => void = () => undefined
    const m = montar(() => new Promise<CatalogosLeidos>((resolver) => (responder = resolver)))
    const carga = m.controlador.iniciar()
    await vi.waitFor(() => expect(m.catalogos).toHaveBeenCalled())

    m.controlador.liberar()
    responder({ ...catalogo(), descartadas: 0 })
    await carga

    expect(m.cache.guardado).toBeNull()
    expect(m.snap().placas).toEqual([])
  })

  it('el modo estricto de React (iniciar, liberar, iniciar) no deja el catálogo vacío', async () => {
    const m = montar()
    const a = m.controlador.iniciar()
    m.controlador.liberar()
    const b = m.controlador.iniciar()
    await Promise.all([a, b])
    expect(m.snap().placas).toHaveLength(2)
  })
})

describe('suscripción', () => {
  it('avisa de los cambios y deja de avisar al darse de baja', async () => {
    const m = montar()
    const aviso = vi.fn()
    const baja = m.controlador.suscribir(aviso)
    await m.controlador.iniciar()
    expect(aviso).toHaveBeenCalled()
    baja()
    aviso.mockClear()
    await m.controlador.actualizar()
    expect(aviso).not.toHaveBeenCalled()
  })
})
