// @vitest-environment node
/** E4-01 en el formulario de captura: cada foto se sube al guardarse y la vista refleja su estado. */
import { describe, expect, it, vi } from 'vitest'
import { SubidaError, type subirBlobAGcs } from '../api/subidaGcs'
import type { StorageApi, UrlDeSubida } from '../api/storageApi'
import type { Momento, Zona } from '../domain'
import { AlmacenEnMemoria } from './almacenEnMemoria'
import { FormularioCaptura } from './formularioCaptura'
import type { FotoParaGuardar } from './fotoStorePort'
import { SubidaFotos } from './subidaFotos'

type Subir = typeof subirBlobAGcs

const foto = (marca = 1): FotoParaGuardar => ({ blob: new Blob([new Uint8Array([marca])], { type: 'image/jpeg' }), ancho: 1280, alto: 720, creadaEn: marca })

let n = 0
const permiso = async (): Promise<UrlDeSubida> => {
  n++
  return { urlDeSubida: `https://storage.googleapis.com/b/${n}.jpg`, storageKey: `traslado/${n}.jpg`, venceEnSegundos: 900 }
}

function montar(momento: Momento = 'salida', opciones: { subir?: Subir; conSubidas?: boolean; store?: AlmacenEnMemoria } = {}) {
  const store = opciones.store ?? new AlmacenEnMemoria()
  const subir = vi.fn<Subir>(opciones.subir ?? (async () => undefined))
  const subidas = new SubidaFotos({ store, storage: { pedirUrlDeSubida: permiso } as StorageApi, subir })
  const urls: string[] = []
  const revocadas: string[] = []
  const formulario = new FormularioCaptura({
    momento,
    ordenId: 812,
    store,
    subidas: opciones.conSubidas === false ? undefined : subidas,
    crearUrl: () => {
      const url = `blob:${urls.length}`
      urls.push(url)
      return url
    },
    revocarUrl: (url) => revocadas.push(url),
  })
  const snap = () => formulario.getSnapshot()
  const zona = (z: Zona) => snap().zonas.find((v) => v.zona === z)
  const esperarSubida = (z: Zona, estado: string) => vi.waitFor(() => expect(zona(z)?.foto?.subida).toBe(estado))
  return { formulario, store, subir, subidas, snap, zona, urls, revocadas, esperarSubida }
}

describe('cada foto se sube en cuanto se guarda', () => {
  it('la foto pasa a «subida» sola, sin que nadie pulse nada', async () => {
    const m = montar()
    await m.formulario.guardar(foto())
    await m.esperarSubida('FRONTAL', 'subida')
    expect(m.subir).toHaveBeenCalledTimes(1)
    expect(m.snap().subidas).toBe(1)
  })

  it('mientras sube, la zona dice «subiendo»', async () => {
    let terminar: () => void = () => undefined
    const m = montar('salida', { subir: () => new Promise<void>((r) => (terminar = r)) })
    await m.formulario.guardar(foto())

    await m.esperarSubida('FRONTAL', 'subiendo')
    await vi.waitFor(() => expect(m.subir).toHaveBeenCalled()) // «subiendo» empieza antes del PUT: hay que esperar a que se llame
    expect(m.snap().subidas).toBe(0)
    terminar()
    await m.esperarSubida('FRONTAL', 'subida')
  })

  it('NO bloquea la captura: guardar termina aunque la subida siga en curso, y se puede guardar la siguiente', async () => {
    let terminar: () => void = () => undefined
    const m = montar('salida', { subir: () => new Promise<void>((r) => (terminar = r)) })

    await m.formulario.guardar(foto(1)) // resuelve sin esperar la subida
    await m.formulario.guardar(foto(2)) // y se puede seguir

    expect(m.snap().tomadas).toBe(2)
    expect(m.snap().zonaActiva).toBe('LATERAL_DERECHO') // la siguiente sin foto
    terminar()
  })

  it('las 6 fotos subidas: todasSubidas es verdadero y no antes', async () => {
    const m = montar()
    const zonas: Zona[] = ['FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR', 'PLACA_ESTADO', 'PLACA_INSTALADA']
    for (const [i, z] of zonas.entries()) {
      await m.formulario.guardar(foto(i + 1))
      await m.esperarSubida(z, 'subida')
      expect(m.snap().todasSubidas).toBe(i === zonas.length - 1)
    }
    expect(m.snap().subidas).toBe(6)
  })

  it('tomada pero sin subir NO cuenta como subida', async () => {
    let terminar: () => void = () => undefined
    const m = montar('salida', { subir: () => new Promise<void>((r) => (terminar = r)) })
    await m.formulario.guardar(foto())
    expect(m.snap()).toMatchObject({ tomadas: 1, subidas: 0, todasSubidas: false })
    terminar()
  })

  it('la entrega son 5 fotos: con las 5 subidas está completa', async () => {
    const m = montar('entrega')
    for (const [i, z] of (['FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR', 'VIN'] as Zona[]).entries()) {
      await m.formulario.guardar(foto(i + 1))
      await m.esperarSubida(z, 'subida')
    }
    expect(m.snap()).toMatchObject({ total: 5, subidas: 5, todasSubidas: true })
  })

  it('sin un subidor (las pruebas de captura), la foto solo se guarda y queda «en espera»', async () => {
    const m = montar('salida', { conSubidas: false })
    await m.formulario.guardar(foto())
    expect(m.zona('FRONTAL')?.foto?.subida).toBe('enEspera')
    expect(m.subir).not.toHaveBeenCalled()
  })
})

describe('si la subida falla: «Reintentar»', () => {
  it('la zona queda «fallida» con el motivo, la foto sigue tomada, y se cuenta como fallida', async () => {
    const m = montar('salida', { subir: () => Promise.reject(new SubidaError('red', 'No se pudo subir la foto: revisa tu conexión.')) })
    await m.formulario.guardar(foto())
    await m.esperarSubida('FRONTAL', 'fallida')

    expect(m.zona('FRONTAL')?.foto?.errorSubida).toBe('No se pudo subir la foto: revisa tu conexión.')
    expect(m.snap()).toMatchObject({ tomadas: 1, subidas: 0, fallidas: 1, todasSubidas: false })
  })

  it('un fallo NO se reintenta solo', async () => {
    const m = montar('salida', { subir: () => Promise.reject(new SubidaError('servidor', 'falló', 503)) })
    await m.formulario.guardar(foto())
    await m.esperarSubida('FRONTAL', 'fallida')
    await new Promise((r) => setTimeout(r, 30))
    expect(m.subir).toHaveBeenCalledTimes(1)
  })

  it('reintentarSubida la sube; si sale bien queda «subida» y el error desaparece', async () => {
    const respuestas: Array<() => Promise<void>> = [() => Promise.reject(new SubidaError('red', 'sin red')), async () => undefined]
    const m = montar('salida', { subir: () => respuestas.shift()!() })
    await m.formulario.guardar(foto())
    await m.esperarSubida('FRONTAL', 'fallida')

    m.formulario.reintentarSubida('FRONTAL')
    await m.esperarSubida('FRONTAL', 'subida')

    expect(m.zona('FRONTAL')?.foto?.errorSubida).toBeNull()
    expect(m.snap().fallidas).toBe(0)
  })

  it('una zona fallida no impide subir las demás: son independientes', async () => {
    let llamada = 0
    const m = montar('salida', { subir: () => (++llamada === 1 ? Promise.reject(new SubidaError('red', 'sin red')) : Promise.resolve()) })
    await m.formulario.guardar(foto(1))
    await m.formulario.guardar(foto(2))

    await m.esperarSubida('FRONTAL', 'fallida')
    await m.esperarSubida('LATERAL_IZQUIERDO', 'subida')
    expect(m.snap()).toMatchObject({ subidas: 1, fallidas: 1, tomadas: 2 })
  })

  it('reintentar la subida de una zona sin foto no hace nada ni lanza', () => {
    const m = montar()
    expect(() => m.formulario.reintentarSubida('FRONTAL')).not.toThrow()
    expect(m.subir).not.toHaveBeenCalled()
  })
})

describe('retomar al abrir: lo que quedó sin subir', () => {
  async function conUnaFotoYSinSubir(estado: 'pending' | 'failed_upload' | 'uploaded') {
    const store = new AlmacenEnMemoria()
    const { clientId } = await store.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto())
    if (estado === 'failed_upload') await store.marcarFalloSubida(clientId, 'falló antes de recargar')
    if (estado === 'uploaded') await store.marcarSubida(clientId, 'traslado/vieja.jpg')
    return { store, clientId }
  }

  it('una foto «pending» (se recargó la página a mitad) se sube sola al cargar', async () => {
    const { store } = await conUnaFotoYSinSubir('pending')
    const m = montar('salida', { store })

    await m.formulario.cargar()

    await m.esperarSubida('FRONTAL', 'subida')
    expect(m.subir).toHaveBeenCalledTimes(1)
  })

  it('una foto fallida NO se reintenta sola: espera el «Reintentar»', async () => {
    const { store } = await conUnaFotoYSinSubir('failed_upload')
    const m = montar('salida', { store })

    await m.formulario.cargar()

    expect(m.zona('FRONTAL')?.foto).toMatchObject({ subida: 'fallida', errorSubida: 'falló antes de recargar' })
    expect(m.subir).not.toHaveBeenCalled()
  })

  it('una foto ya subida se muestra como subida y no se vuelve a subir', async () => {
    const { store } = await conUnaFotoYSinSubir('uploaded')
    const m = montar('salida', { store })

    await m.formulario.cargar()

    expect(m.zona('FRONTAL')?.foto?.subida).toBe('subida')
    expect(m.subir).not.toHaveBeenCalled()
  })
})

describe('repetir una zona', () => {
  it('la foto nueva se sube sola aunque la anterior ya estuviera subida, y vuelve a empezar «en espera»', async () => {
    const m = montar()
    await m.formulario.guardar(foto(1))
    await m.esperarSubida('FRONTAL', 'subida')

    m.formulario.seleccionarZona('FRONTAL')
    await m.formulario.guardar(foto(2))
    await m.esperarSubida('FRONTAL', 'subida')

    expect(m.subir).toHaveBeenCalledTimes(2)
    expect(m.snap().subidas).toBe(1) // la zona cuenta una sola vez
  })

  it('la subida de la foto vieja que termina tarde no marca la nueva', async () => {
    const liberar: Array<() => void> = []
    const m = montar('salida', { subir: () => new Promise<void>((r) => liberar.push(r)) })
    await m.formulario.guardar(foto(1)) // sube la vieja (pendiente de terminar)
    await vi.waitFor(() => expect(liberar).toHaveLength(1))

    m.formulario.seleccionarZona('FRONTAL')
    await m.formulario.guardar(foto(2)) // sube la nueva
    await vi.waitFor(() => expect(liberar).toHaveLength(2))
    liberar[0]!() // la vieja termina primero
    await new Promise((r) => setTimeout(r, 20))

    expect(m.zona('FRONTAL')?.foto?.subida).toBe('subiendo') // la nueva sigue en curso: la vieja no la marcó
    liberar[1]!()
    await m.esperarSubida('FRONTAL', 'subida')
  })
})

describe('las miniaturas y el ciclo de vida', () => {
  it('el estado de subida cambia SIN volver a crear las miniaturas', async () => {
    const m = montar()
    await m.formulario.guardar(foto())
    await m.esperarSubida('FRONTAL', 'subida')
    expect(m.urls).toHaveLength(1)
    expect(m.revocadas).toEqual([])
  })

  it('después de liberar, los cambios de las subidas ya no tocan el formulario', async () => {
    let terminar: () => void = () => undefined
    const m = montar('salida', { subir: () => new Promise<void>((r) => (terminar = r)) })
    await m.formulario.guardar(foto())
    m.formulario.liberar()
    const avisos = vi.fn()
    m.formulario.suscribir(avisos)

    terminar()
    await new Promise((r) => setTimeout(r, 30))

    expect(avisos).not.toHaveBeenCalled()
    expect(m.snap().tomadas).toBe(0)
  })

  it('volver a cargar después de liberar vuelve a escuchar las subidas', async () => {
    const m = montar()
    await m.formulario.guardar(foto())
    await m.esperarSubida('FRONTAL', 'subida')
    m.formulario.liberar()

    await m.formulario.cargar()

    expect(m.zona('FRONTAL')?.foto?.subida).toBe('subida')
  })
})
