// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Zona } from '../domain'
import { AlmacenError, esErrorDeCuota } from './almacenError'
import type { FotoParaGuardar } from './fotoStorePort'
import { FotoStoreDexie } from './fotoStoreDexie'
import { type FilaEnEscritura, TrasladoDb } from './trasladoDb'

const abiertas: TrasladoDb[] = []

function montar(opciones: { nombre?: string; ahora?: () => number } = {}) {
  const nombre = opciones.nombre ?? `prueba-${globalThis.crypto.randomUUID()}`
  const db = new TrasladoDb(nombre)
  abiertas.push(db)
  const store = new FotoStoreDexie(db, { ahora: opciones.ahora ?? (() => 5_000) })
  return { db, store, nombre }
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of abiertas.splice(0)) {
    db.close()
    await db.delete()
  }
})

const CLAVE = { ordenId: 812, momento: 'salida' as const }
const cuota = () => new DOMException('sin espacio', 'QuotaExceededError')

/** Una foto cuyo contenido es una repetición de `marca`, para poder comprobar los bytes. */
const foto = (marca = 1, bytes = 8): FotoParaGuardar => ({
  blob: new Blob([new Uint8Array(bytes).fill(marca)], { type: 'image/jpeg' }),
  ancho: 1280,
  alto: 720,
  creadaEn: 1_700_000_000_000 + marca,
})

const bytesDe = async (blob: Blob) => [...new Uint8Array(await blob.arrayBuffer())]

describe('AC1 · escribir con verificación', () => {
  it('la fila «writing» existe, sin el Blob, ANTES de escribir el Blob', async () => {
    const { db, store } = montar()
    const original = db.enEscritura.update.bind(db.enEscritura)
    let alEscribir: FilaEnEscritura[] = []
    vi.spyOn(db.enEscritura, 'update').mockImplementation(((...args: Parameters<typeof original>) =>
      db.enEscritura.toArray().then((filas) => {
        alEscribir = filas
        return original(...args)
      })) as typeof original)

    await store.guardar(CLAVE, 'FRONTAL', foto())

    expect(alEscribir).toHaveLength(1)
    expect(alEscribir[0]).toMatchObject({ estado: 'writing', blob: null, zona: 'FRONTAL', ordenId: 812, momento: 'salida' })
  })

  it('al terminar, la foto está en «fotos» como «pending», con su contenido intacto, y no queda nada en tránsito', async () => {
    const { db, store } = montar()

    const guardada = await store.guardar(CLAVE, 'FRONTAL', foto(7, 8))

    expect(await db.enEscritura.count()).toBe(0)
    const filas = await db.fotos.toArray()
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      clientId: guardada.clientId,
      estado: 'pending',
      storageKey: null,
      errorMessage: null,
      zona: 'FRONTAL',
      ancho: 1280,
      alto: 720,
      creadaEn: 1_700_000_000_007,
      actualizadoEn: 5_000,
    })
    expect(filas[0]?.blob.size).toBe(8)
    expect(await bytesDe(filas[0]!.blob)).toEqual(Array(8).fill(7))
  })

  it('devuelve la foto guardada con su instante medido', async () => {
    const { store } = montar()
    const guardada = await store.guardar(CLAVE, 'POSTERIOR', foto(3))
    expect(guardada).toMatchObject({ zona: 'POSTERIOR', ancho: 1280, alto: 720, creadaEn: 1_700_000_000_003 })
    expect(guardada.clientId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('solo da la foto por buena si al leerla de vuelta tiene el mismo tamaño', async () => {
    const { db, store } = montar()
    const get = db.enEscritura.get.bind(db.enEscritura)
    // La primera lectura de vuelta devuelve un Blob truncado; la segunda, el real.
    vi.spyOn(db.enEscritura, 'get').mockImplementationOnce((async (...args: Parameters<typeof get>) => {
      const fila = await get(...args)
      return fila && { ...fila, blob: new Blob([new Uint8Array(2)], { type: 'image/jpeg' }) }
    }) as typeof get)

    const guardada = await store.guardar(CLAVE, 'FRONTAL', foto(1, 8))

    expect((await db.fotos.get(guardada.clientId))?.blob.size).toBe(8)
  })

  it('una foto vacía se rechaza sin tocar el almacén', async () => {
    const { db, store } = montar()
    const vacia: FotoParaGuardar = { ...foto(), blob: new Blob([], { type: 'image/jpeg' }) }

    await expect(store.guardar(CLAVE, 'FRONTAL', vacia)).rejects.toMatchObject({ codigo: 'FOTO_VACIA' })

    expect(await db.fotos.count()).toBe(0)
    expect(await db.enEscritura.count()).toBe(0)
  })
})

describe('AC2 · fallos de escritura', () => {
  it('un fallo pasajero se reintenta una vez y la foto se guarda', async () => {
    const { db, store } = montar()
    const update = db.enEscritura.update.bind(db.enEscritura)
    const espia = vi.spyOn(db.enEscritura, 'update').mockImplementationOnce(() => Promise.reject(new Error('fallo pasajero')) as never)
    espia.mockImplementation(update)

    const guardada = await store.guardar(CLAVE, 'FRONTAL', foto())

    expect(espia).toHaveBeenCalledTimes(2)
    expect(await db.fotos.get(guardada.clientId)).toBeDefined()
    expect(await db.enEscritura.count()).toBe(0)
  })

  it('si falla las dos veces, la fila queda «failed_local» con el motivo y la foto NO se acepta', async () => {
    const { db, store } = montar()
    const espia = vi.spyOn(db.enEscritura, 'update')
    espia.mockRejectedValueOnce(new Error('disco raro')).mockRejectedValueOnce(new Error('disco raro')).mockImplementation(
      (async (clave: string, cambios: object) => db.enEscritura.where('clientId').equals(clave).modify(cambios)) as never,
    )

    const error = await store.guardar(CLAVE, 'FRONTAL', foto()).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AlmacenError)
    expect(error).toMatchObject({ codigo: 'ESCRITURA_FALLIDA' })
    expect(await db.fotos.count()).toBe(0)
    const enTransito = await db.enEscritura.toArray()
    expect(enTransito).toHaveLength(1)
    expect(enTransito[0]).toMatchObject({ estado: 'failed_local', blob: null, zona: 'FRONTAL' })
    expect(enTransito[0]?.errorMessage).toContain('No se pudo guardar la foto')
  })

  it('si la lectura de vuelta no coincide las dos veces, es VERIFICACION_FALLIDA y no se acepta', async () => {
    const { db, store } = montar()
    const get = db.enEscritura.get.bind(db.enEscritura)
    vi.spyOn(db.enEscritura, 'get').mockImplementation((async (...args: Parameters<typeof get>) => {
      const fila = await get(...args)
      return fila && { ...fila, blob: new Blob([new Uint8Array(1)]) }
    }) as typeof get)

    await expect(store.guardar(CLAVE, 'FRONTAL', foto(1, 8))).rejects.toMatchObject({ codigo: 'VERIFICACION_FALLIDA' })

    expect(await db.fotos.count()).toBe(0)
    expect((await db.enEscritura.toArray())[0]).toMatchObject({ estado: 'failed_local', blob: null })
  })
})

describe('AC3 · sin espacio', () => {
  it('un error de cuota se avisa como «Espacio insuficiente» y NO se reintenta', async () => {
    const { db, store } = montar()
    const espia = vi.spyOn(db.enEscritura, 'update').mockRejectedValue(cuota())

    const error = await store.guardar(CLAVE, 'FRONTAL', foto()).catch((e: unknown) => e)

    expect(error).toMatchObject({ codigo: 'ESPACIO_INSUFICIENTE' })
    expect((error as AlmacenError).mensajeParaElOperario).toContain('Espacio insuficiente')
    // Una sola escritura del Blob (la otra llamada a `update` es la que anota el fallo).
    const escriturasDelBlob = espia.mock.calls.filter(([, cambios]) => (cambios as { blob?: Blob | null }).blob instanceof Blob)
    expect(escriturasDelBlob).toHaveLength(1)
    expect(await db.fotos.count()).toBe(0)
  })

  it('un fallo que no es de cuota sí se reintenta: dos escrituras del Blob', async () => {
    const { db, store } = montar()
    const espia = vi.spyOn(db.enEscritura, 'update').mockRejectedValue(new Error('disco raro'))

    await expect(store.guardar(CLAVE, 'FRONTAL', foto())).rejects.toMatchObject({ codigo: 'ESCRITURA_FALLIDA' })

    const escriturasDelBlob = espia.mock.calls.filter(([, cambios]) => (cambios as { blob?: Blob | null }).blob instanceof Blob)
    expect(escriturasDelBlob).toHaveLength(2)
  })

  it('si ya no cabe ni la fila inicial, también se avisa del espacio y no queda nada a medias', async () => {
    const { db, store } = montar()
    vi.spyOn(db.enEscritura, 'put').mockRejectedValue(cuota())

    await expect(store.guardar(CLAVE, 'FRONTAL', foto())).rejects.toMatchObject({ codigo: 'ESPACIO_INSUFICIENTE' })

    expect(await db.fotos.count()).toBe(0)
    expect(await db.enEscritura.count()).toBe(0)
  })

  it('un error de cuota que Dexie envuelve (en «inner») también se reconoce', () => {
    expect(esErrorDeCuota(cuota())).toBe(true)
    expect(esErrorDeCuota({ name: 'AbortError', inner: cuota() })).toBe(true)
    expect(esErrorDeCuota({ name: 'AbortError', inner: { name: 'OtroError' } })).toBe(false)
    expect(esErrorDeCuota(new Error('otra cosa'))).toBe(false)
    expect(esErrorDeCuota(undefined)).toBe(false)
    expect(esErrorDeCuota('QuotaExceededError')).toBe(false)
  })
})

describe('AC4 · repetir una zona (falla C15)', () => {
  it('la foto nueva reemplaza a la anterior de esa zona', async () => {
    const { db, store } = montar()
    const vieja = await store.guardar(CLAVE, 'FRONTAL', foto(1))

    const nueva = await store.guardar(CLAVE, 'FRONTAL', foto(2))

    const filas = await db.fotos.toArray()
    expect(filas).toHaveLength(1)
    expect(filas[0]?.clientId).toBe(nueva.clientId)
    expect(filas[0]?.clientId).not.toBe(vieja.clientId)
    expect(await bytesDe(filas[0]!.blob)).toEqual(Array(8).fill(2))
  })

  it('si la nueva no se puede guardar, la anterior sigue INTACTA', async () => {
    const { db, store } = montar()
    const vieja = await store.guardar(CLAVE, 'FRONTAL', foto(1))
    const antes = await db.fotos.get(vieja.clientId)
    vi.spyOn(db.enEscritura, 'update').mockRejectedValue(new Error('disco raro'))

    await expect(store.guardar(CLAVE, 'FRONTAL', foto(2))).rejects.toBeInstanceOf(AlmacenError)

    const filas = await db.fotos.toArray()
    expect(filas).toHaveLength(1)
    expect(filas[0]?.clientId).toBe(vieja.clientId)
    expect(filas[0]?.creadaEn).toBe(antes?.creadaEn)
    expect(await bytesDe(filas[0]!.blob)).toEqual(Array(8).fill(1))
  })

  it('la promoción es todo o nada: si falla a mitad, la anterior no se pierde', async () => {
    const { db, store } = montar()
    const vieja = await store.guardar(CLAVE, 'FRONTAL', foto(1))
    // La transacción borra la anterior y falla al publicar la nueva: debe deshacerse el borrado.
    vi.spyOn(db.fotos, 'put').mockRejectedValueOnce(new Error('falla al publicar'))

    await expect(store.guardar(CLAVE, 'FRONTAL', foto(2))).rejects.toBeInstanceOf(AlmacenError)

    const filas = await db.fotos.toArray()
    expect(filas.map((f) => f.clientId)).toEqual([vieja.clientId])
    expect(await bytesDe(filas[0]!.blob)).toEqual(Array(8).fill(1))
  })

  it('si falla toda la transacción por cuota, la anterior sigue ahí y se avisa del espacio', async () => {
    const { db, store } = montar()
    const vieja = await store.guardar(CLAVE, 'FRONTAL', foto(1))
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(cuota() as never)

    await expect(store.guardar(CLAVE, 'FRONTAL', foto(2))).rejects.toMatchObject({ codigo: 'ESPACIO_INSUFICIENTE' })

    expect((await db.fotos.toArray()).map((f) => f.clientId)).toEqual([vieja.clientId])
  })
})

describe('AC5 · una sola foto viva por zona', () => {
  it('el índice único rechaza una segunda fila para la misma orden, momento y zona', async () => {
    const { db, store } = montar()
    await store.guardar(CLAVE, 'FRONTAL', foto(1))
    const [existente] = await db.fotos.toArray()

    await expect(db.fotos.add({ ...existente!, clientId: 'otro-id' })).rejects.toThrow()

    expect(await db.fotos.count()).toBe(1)
  })

  it('guardar dos veces la misma zona deja exactamente una fila viva', async () => {
    const { db, store } = montar()
    for (let i = 1; i <= 4; i++) await store.guardar(CLAVE, 'FRONTAL', foto(i))
    expect(await db.fotos.count()).toBe(1)
  })

  it('misma zona en otro momento, o en otra orden, sí es otra foto', async () => {
    const { db, store } = montar()
    await store.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto(1))
    await store.guardar({ ordenId: 812, momento: 'entrega' }, 'FRONTAL', foto(2))
    await store.guardar({ ordenId: 999, momento: 'salida' }, 'FRONTAL', foto(3))
    expect(await db.fotos.count()).toBe(3)
  })

  it('cada foto lleva un clientId único', async () => {
    const { store } = montar()
    const ids = new Set<string>()
    for (const zona of ['FRONTAL', 'POSTERIOR', 'LATERAL_DERECHO'] as const) ids.add((await store.guardar(CLAVE, zona, foto())).clientId)
    ids.add((await store.guardar(CLAVE, 'FRONTAL', foto())).clientId) // repetir también da un id nuevo
    expect(ids.size).toBe(4)
  })
})

describe('T4b · reconciliar lo que quedó a medias', () => {
  const AHORA = 100_000
  const montarReconciliando = () => montar({ ahora: () => AHORA })

  const fila = (zona: Zona, estado: 'writing' | 'failed_local', actualizadoEn: number, extra: Partial<FilaEnEscritura> = {}): FilaEnEscritura => ({
    clientId: `fila-${zona}-${estado}-${actualizadoEn}`,
    ordenId: 812,
    momento: 'salida',
    zona,
    blob: null,
    ancho: 1,
    alto: 1,
    creadaEn: 1,
    estado,
    errorMessage: null,
    actualizadoEn,
    ...extra,
  })

  it('AC1: una fila «writing» abandonada pasa a «failed_local», sin Blob y con el motivo, y se pide retomar esa zona', async () => {
    const { db, store } = montarReconciliando()
    await db.enEscritura.bulkPut([
      fila('POSTERIOR', 'writing', 0),
      // Murió justo después de escribir el Blob: igual no se acepta, y el Blob se suelta.
      fila('FRONTAL', 'writing', 0, { blob: new Blob([new Uint8Array(4)]) }),
    ])

    const resultado = await store.reconciliar(CLAVE)

    expect(resultado.zonasARetomar).toEqual(['FRONTAL', 'POSTERIOR']) // en el orden del formulario
    const filas = await db.enEscritura.toArray()
    expect(filas).toHaveLength(2)
    for (const f of filas) {
      expect(f).toMatchObject({ estado: 'failed_local', blob: null, actualizadoEn: AHORA })
      expect(f.errorMessage).toContain('a medias')
    }
    expect(await db.fotos.count()).toBe(0) // nada se aceptó
  })

  it('una fila «writing» reciente se deja en paz: puede ser de otra pestaña a medio guardar', async () => {
    const { db, store } = montarReconciliando()
    await db.enEscritura.put(fila('FRONTAL', 'writing', AHORA - 5_000))

    const resultado = await store.reconciliar(CLAVE)

    expect(resultado.zonasARetomar).toEqual([])
    expect((await db.enEscritura.toArray())[0]).toMatchObject({ estado: 'writing' })
  })

  it('el umbral es de 30 segundos: justo ahí ya es huérfana, un milisegundo antes no', async () => {
    const { db, store } = montarReconciliando()
    await db.enEscritura.bulkPut([fila('FRONTAL', 'writing', AHORA - 30_000), fila('POSTERIOR', 'writing', AHORA - 29_999)])

    const resultado = await store.reconciliar(CLAVE)

    expect(resultado.zonasARetomar).toEqual(['FRONTAL'])
    expect((await db.enEscritura.get('fila-POSTERIOR-writing-70001'))?.estado).toBe('writing')
  })

  it('una foto que falló al guardarse antes (failed_local) también se pide retomar', async () => {
    const { db, store } = montarReconciliando()
    await db.enEscritura.put(fila('LATERAL_DERECHO', 'failed_local', 1, { errorMessage: 'disco lleno' }))

    expect((await store.reconciliar(CLAVE)).zonasARetomar).toEqual(['LATERAL_DERECHO'])
    expect((await db.enEscritura.toArray())[0]?.errorMessage).toBe('disco lleno') // no se pisa el motivo original
  })

  it('si la zona ya tiene una foto aceptada, el intento fallido no pide nada y se limpia', async () => {
    const { db, store } = montarReconciliando()
    const aceptada = await store.guardar(CLAVE, 'FRONTAL', foto(1)) // el intento de repetirla falló después
    await db.enEscritura.bulkPut([fila('FRONTAL', 'writing', 0), fila('FRONTAL', 'failed_local', 1)])

    const resultado = await store.reconciliar(CLAVE)

    expect(resultado.zonasARetomar).toEqual([])
    expect(await db.enEscritura.count()).toBe(0)
    expect((await db.fotos.toArray()).map((f) => f.clientId)).toEqual([aceptada.clientId]) // la foto aceptada, intacta
  })

  it('solo toca la orden y el momento indicados', async () => {
    const { db, store } = montarReconciliando()
    await db.enEscritura.bulkPut([
      fila('FRONTAL', 'writing', 0, { clientId: 'otra-orden', ordenId: 999 }),
      fila('FRONTAL', 'writing', 0, { clientId: 'otro-momento', momento: 'entrega' }),
      fila('POSTERIOR', 'writing', 0, { clientId: 'esta' }),
    ])

    const resultado = await store.reconciliar(CLAVE)

    expect(resultado.zonasARetomar).toEqual(['POSTERIOR'])
    expect((await db.enEscritura.get('otra-orden'))?.estado).toBe('writing')
    expect((await db.enEscritura.get('otro-momento'))?.estado).toBe('writing')
    expect((await db.enEscritura.get('esta'))?.estado).toBe('failed_local')
  })

  it('no toca las fotos aceptadas', async () => {
    const { db, store } = montarReconciliando()
    await store.guardar(CLAVE, 'FRONTAL', foto(1))
    await store.guardar(CLAVE, 'POSTERIOR', foto(2))
    const antes = (await db.fotos.toArray()).map((f) => [f.clientId, f.estado, f.actualizadoEn])
    await db.enEscritura.put(fila('LATERAL_DERECHO', 'writing', 0))

    await store.reconciliar(CLAVE)

    expect((await db.fotos.toArray()).map((f) => [f.clientId, f.estado, f.actualizadoEn])).toEqual(antes)
  })

  it('es idempotente: reconciliar otra vez da lo mismo y no duplica nada', async () => {
    const { db, store } = montarReconciliando()
    await db.enEscritura.bulkPut([fila('FRONTAL', 'writing', 0), fila('POSTERIOR', 'failed_local', 1)])

    const primera = await store.reconciliar(CLAVE)
    const filasTrasLaPrimera = await db.enEscritura.toArray()
    const segunda = await store.reconciliar(CLAVE)

    expect(segunda).toEqual(primera)
    expect(await db.enEscritura.toArray()).toEqual(filasTrasLaPrimera)
  })

  it('sin nada a medias, no hay nada que retomar', async () => {
    const { store } = montarReconciliando()
    expect(await store.reconciliar(CLAVE)).toEqual({ zonasARetomar: [] })
  })

  it('al guardar con éxito una zona, sus intentos fallidos se borran; los de otras zonas y una escritura ajena en curso no', async () => {
    const { db, store } = montarReconciliando()
    await db.enEscritura.bulkPut([
      fila('FRONTAL', 'failed_local', 1, { clientId: 'fallida-frontal' }),
      fila('POSTERIOR', 'failed_local', 1, { clientId: 'fallida-posterior' }),
      fila('FRONTAL', 'writing', AHORA - 1_000, { clientId: 'ajena-en-curso' }), // otra pestaña, a medio guardar
    ])

    await store.guardar(CLAVE, 'FRONTAL', foto(1))

    expect((await db.enEscritura.toArray()).map((f) => f.clientId).sort()).toEqual(['ajena-en-curso', 'fallida-posterior'])
    expect((await store.reconciliar(CLAVE)).zonasARetomar).toEqual(['POSTERIOR'])
  })

  it('una escritura que muere a medias de verdad se recupera en la siguiente apertura', async () => {
    const { db, store, nombre } = montarReconciliando()
    // La fila `writing` se inserta antes que el Blob; si el proceso muere en esa ventana, queda así.
    vi.spyOn(db.enEscritura, 'update').mockImplementation((() => new Promise(() => undefined)) as never) // la escritura nunca termina
    void store.guardar(CLAVE, 'LATERAL_IZQUIERDO', foto(1))
    await vi.waitFor(async () => expect(await db.enEscritura.count()).toBe(1))
    db.close()

    // «Reapertura»: otra instancia, mucho tiempo después.
    const reabierta = new TrasladoDb(nombre)
    abiertas.push(reabierta)
    const despues = new FotoStoreDexie(reabierta, { ahora: () => AHORA + 60_000 })

    expect((await despues.reconciliar(CLAVE)).zonasARetomar).toEqual(['LATERAL_IZQUIERDO'])
    expect((await reabierta.enEscritura.toArray())[0]).toMatchObject({ estado: 'failed_local', blob: null })
    expect(await despues.listar(CLAVE)).toEqual([]) // la foto a medias no cuenta como aceptada
  })
})

describe('listar', () => {
  it('devuelve solo las fotos de esa orden y ese momento', async () => {
    const { store } = montar()
    await store.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto(1))
    await store.guardar({ ordenId: 812, momento: 'salida' }, 'POSTERIOR', foto(2))
    await store.guardar({ ordenId: 812, momento: 'entrega' }, 'VIN', foto(3))
    await store.guardar({ ordenId: 999, momento: 'salida' }, 'FRONTAL', foto(4))

    const fotos = await store.listar({ ordenId: 812, momento: 'salida' })

    expect(fotos.map((f) => f.zona).sort()).toEqual(['FRONTAL', 'POSTERIOR'])
  })

  it('no incluye las filas que siguen en tránsito o fallaron', async () => {
    const { db, store } = montar()
    await store.guardar(CLAVE, 'FRONTAL', foto(1))
    await db.enEscritura.put({
      clientId: 'a-medias',
      ordenId: 812,
      momento: 'salida',
      zona: 'POSTERIOR',
      blob: null,
      ancho: 1,
      alto: 1,
      creadaEn: 1,
      estado: 'writing',
      errorMessage: null,
      actualizadoEn: 1,
    })

    expect((await store.listar(CLAVE)).map((f) => f.zona)).toEqual(['FRONTAL'])
  })

  it('las fotos sobreviven a cerrar y volver a abrir la base (una recarga de la página)', async () => {
    const { db, store, nombre } = montar()
    await store.guardar(CLAVE, 'FRONTAL', foto(9, 16))
    db.close()

    const reabierta = new TrasladoDb(nombre)
    abiertas.push(reabierta)
    const fotos = await new FotoStoreDexie(reabierta).listar(CLAVE)

    expect(fotos).toHaveLength(1)
    expect(await bytesDe(fotos[0]!.blob)).toEqual(Array(16).fill(9))
    expect(fotos[0]?.creadaEn).toBe(1_700_000_000_009)
  })
})
