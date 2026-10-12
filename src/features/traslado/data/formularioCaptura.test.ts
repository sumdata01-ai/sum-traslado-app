// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type Momento, ZONAS_ENTREGA, ZONAS_SALIDA, type Zona } from '../domain'
import { AlmacenEnMemoria } from './almacenEnMemoria'
import { almacenDelegando, fotoRecienGuardada } from './testing/almacenes'
import type { FotoParaGuardar, FotoStorePort } from './fotoStorePort'
import { FormularioCaptura } from './formularioCaptura'

const foto = (marca = 1): FotoParaGuardar => ({
  blob: new Blob([new Uint8Array([marca])], { type: 'image/jpeg' }),
  ancho: 1280,
  alto: 720,
  creadaEn: 1_700_000_000_000 + marca,
})

function montar(momento: Momento = 'salida', store: FotoStorePort = new AlmacenEnMemoria()) {
  const urls: string[] = []
  const revocadas: string[] = []
  const formulario = new FormularioCaptura({
    momento,
    ordenId: 812,
    store,
    crearUrl: () => {
      const url = `blob:miniatura-${urls.length + 1}`
      urls.push(url)
      return url
    },
    revocarUrl: (url) => revocadas.push(url),
  })
  const snap = () => formulario.getSnapshot()
  const zona = (z: Zona) => snap().zonas.find((v) => v.zona === z)
  return { formulario, store, urls, revocadas, snap, zona }
}

describe('estado inicial', () => {
  it('la salida pide 6 zonas, todas vacías, y empieza por la primera', () => {
    const { snap } = montar('salida')
    expect(snap().zonas.map((z) => z.zona)).toEqual([...ZONAS_SALIDA])
    expect(snap().zonas.every((z) => z.foto === null)).toBe(true)
    expect(snap()).toMatchObject({ zonaActiva: 'FRONTAL', tomadas: 0, total: 6, completo: false, cargando: false, errorCarga: null })
  })

  it('AC6: la entrega pide 5 zonas, incluye VIN y no las dos de placa', () => {
    const { snap } = montar('entrega')
    expect(snap().zonas.map((z) => z.zona)).toEqual([...ZONAS_ENTREGA])
    expect(snap().total).toBe(5)
    expect(snap().zonas.map((z) => z.zona)).toContain('VIN')
    expect(snap().zonas.map((z) => z.zona)).not.toContain('PLACA_ESTADO')
    expect(snap().zonas.map((z) => z.zona)).not.toContain('PLACA_INSTALADA')
  })

  it('cada zona trae su etiqueta legible', () => {
    const { zona } = montar('salida')
    expect(zona('LATERAL_IZQUIERDO')?.etiqueta).toBe('Lateral izquierdo')
    expect(zona('PLACA_INSTALADA')?.etiqueta).toBe('Placa — instalada en el vehículo')
  })
})

describe('AC3: guardar avanza a la siguiente zona sin foto', () => {
  it('guarda en la zona activa, muestra su miniatura y pasa a la siguiente', async () => {
    const { formulario, zona, snap, urls } = montar()

    await formulario.guardar(foto())

    expect(zona('FRONTAL')?.foto).toMatchObject({ urlMiniatura: 'blob:miniatura-1', ancho: 1280, alto: 720 })
    expect(snap().zonaActiva).toBe('LATERAL_IZQUIERDO')
    expect(snap().tomadas).toBe(1)
    expect(urls).toHaveLength(1)
  })

  it('si el operario eligió una zona del medio, sigue por la que viene detrás y deja el hueco de antes para después', async () => {
    const { formulario, snap, zona } = montar('salida')
    formulario.seleccionarZona('POSTERIOR')

    await formulario.guardar(foto())

    expect(snap().zonaActiva).toBe('PLACA_ESTADO')
    expect(zona('FRONTAL')?.foto).toBeNull() // sigue vacía; se recupera al dar la vuelta
    expect(snap().tomadas).toBe(1)
  })

  it('con las 6 de la salida, queda completo y sin zona activa', async () => {
    const { formulario, snap } = montar('salida')
    for (let i = 0; i < 6; i++) await formulario.guardar(foto(i))
    expect(snap()).toMatchObject({ tomadas: 6, total: 6, completo: true, zonaActiva: null })
  })

  it('con las 5 de la entrega, queda completo', async () => {
    const { formulario, snap } = montar('entrega')
    for (let i = 0; i < 5; i++) await formulario.guardar(foto(i))
    expect(snap()).toMatchObject({ tomadas: 5, total: 5, completo: true, zonaActiva: null })
  })

  it('guardar sin zona activa (formulario completo) es un error de programación', async () => {
    const { formulario } = montar('entrega')
    for (let i = 0; i < 5; i++) await formulario.guardar(foto(i))
    await expect(formulario.guardar(foto())).rejects.toThrow('zona activa')
  })
})

describe('repetir una zona', () => {
  it('seleccionar una zona con foto y guardar la reemplaza, sin cambiar el contador', async () => {
    const { formulario, zona, snap, revocadas } = montar()
    for (let i = 0; i < 6; i++) await formulario.guardar(foto(i))
    const miniaturaVieja = zona('POSTERIOR')?.foto?.urlMiniatura

    formulario.seleccionarZona('POSTERIOR')
    expect(snap().zonaActiva).toBe('POSTERIOR')
    await formulario.guardar(foto(99))

    expect(snap().tomadas).toBe(6)
    expect(zona('POSTERIOR')?.foto?.urlMiniatura).not.toBe(miniaturaVieja)
    expect(zona('POSTERIOR')?.foto?.creadaEn).toBe(1_700_000_000_099)
    expect(revocadas).toEqual([miniaturaVieja]) // la miniatura vieja se suelta
    expect(snap().zonaActiva).toBeNull()
  })

  it('al repetir una zona del medio, el formulario sigue por el hueco que faltaba', async () => {
    const { formulario, snap } = montar()
    await formulario.guardar(foto()) // FRONTAL
    await formulario.guardar(foto()) // LATERAL_IZQUIERDO → ahora toca LATERAL_DERECHO
    formulario.seleccionarZona('FRONTAL')

    await formulario.guardar(foto()) // repite FRONTAL

    expect(snap().zonaActiva).toBe('LATERAL_DERECHO') // el siguiente hueco, no la zona que sigue a FRONTAL ya tomada
    expect(snap().tomadas).toBe(2)
  })

  it('no se puede seleccionar una zona que no es del momento', () => {
    const { formulario } = montar('entrega')
    expect(() => formulario.seleccionarZona('PLACA_ESTADO')).toThrow(RangeError)
  })
})

describe('integridad: una foto solo aparece si el almacén la guardó', () => {
  it('si guardar falla, la vista no cambia y la foto anterior de esa zona sigue donde estaba', async () => {
    const real = new AlmacenEnMemoria()
    let fallar = false
    const store: FotoStorePort = almacenDelegando(real, {
      guardar: (clave, zona, f) => (fallar ? Promise.reject(new Error('disco lleno')) : real.guardar(clave, zona, f)),
    })
    const { formulario, zona, snap } = montar('salida', store)
    await formulario.guardar(foto(1)) // FRONTAL guardada
    const antes = zona('FRONTAL')?.foto

    formulario.seleccionarZona('FRONTAL')
    fallar = true
    await expect(formulario.guardar(foto(2))).rejects.toThrow('disco lleno')

    expect(zona('FRONTAL')?.foto).toEqual(antes) // intacta
    expect(snap().tomadas).toBe(1)
    expect(snap().zonaActiva).toBe('FRONTAL') // sigue pendiente de repetir, no avanzó
    const enAlmacen = await real.listar({ ordenId: 812, momento: 'salida' })
    expect(enAlmacen.map((f) => f.creadaEn)).toEqual([1_700_000_000_001])
  })

  it('la foto se guarda en la zona indicada aunque la selección haya cambiado mientras tanto', async () => {
    const { formulario, zona, snap } = montar()
    // El operario tomó la foto de FRONTAL y, mientras la revisa, toca otra ficha.
    formulario.seleccionarZona('POSTERIOR')

    await formulario.guardar(foto(7), 'FRONTAL')

    expect(zona('FRONTAL')?.foto).not.toBeNull()
    expect(zona('POSTERIOR')?.foto).toBeNull()
    expect(snap().tomadas).toBe(1)
  })

  it('el almacén recibe la clave de la orden y del momento', async () => {
    const guardar = vi.fn<FotoStorePort['guardar']>(async (_c, zona, f) => fotoRecienGuardada(f, zona))
    const { formulario } = montar('entrega', almacenDelegando(new AlmacenEnMemoria(), { listar: async () => [], guardar }))

    await formulario.guardar(foto())

    expect(guardar).toHaveBeenCalledWith({ ordenId: 812, momento: 'entrega' }, 'FRONTAL', expect.objectContaining({ ancho: 1280 }))
  })
})

describe('cargar lo guardado antes', () => {
  it('muestra las fotos que ya había y sigue por el primer hueco', async () => {
    const store = new AlmacenEnMemoria()
    const clave = { ordenId: 812, momento: 'salida' as const }
    await store.guardar(clave, 'FRONTAL', foto(1))
    await store.guardar(clave, 'LATERAL_IZQUIERDO', foto(2))
    await store.guardar(clave, 'POSTERIOR', foto(3))
    const { formulario, snap, zona } = montar('salida', store)

    await formulario.cargar()

    expect(snap().tomadas).toBe(3)
    expect(zona('POSTERIOR')?.foto).not.toBeNull()
    expect(snap().zonaActiva).toBe('LATERAL_DERECHO')
    expect(snap().cargando).toBe(false)
  })

  it('no mezcla los momentos: las fotos de la salida no aparecen en la entrega', async () => {
    const store = new AlmacenEnMemoria()
    await store.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto(1))
    const { formulario, snap } = montar('entrega', store)

    await formulario.cargar()

    expect(snap().tomadas).toBe(0)
  })

  it('ignora una zona guardada que no es del momento (dato viejo)', async () => {
    const store: FotoStorePort = almacenDelegando(new AlmacenEnMemoria(), {
      listar: async () => [fotoRecienGuardada(foto(), 'PLACA_ESTADO', 'a')],
      guardar: async (_c, zona, f) => fotoRecienGuardada(f, zona, 'b'),
    })
    const { formulario, snap } = montar('entrega', store)
    await formulario.cargar()
    expect(snap().tomadas).toBe(0)
  })

  it('marca «cargando» mientras lee y avisa si no pudo', async () => {
    const store: FotoStorePort = almacenDelegando(new AlmacenEnMemoria(), {
      listar: () => Promise.reject(new Error('IndexedDB no disponible')),
      guardar: async (_c, zona, f) => fotoRecienGuardada(f, zona, 'b'),
    })
    const { formulario, snap } = montar('salida', store)
    const durante: boolean[] = []
    formulario.suscribir(() => durante.push(snap().cargando))

    await formulario.cargar()

    expect(durante[0]).toBe(true)
    expect(snap().cargando).toBe(false)
    expect(snap().errorCarga).toBe('No se pudieron leer las fotos guardadas.')
  })
})

describe('T4b · lo que quedó a medias', () => {
  /** Un almacén en memoria que además dice qué zonas hay que retomar, y anota el orden de las llamadas. */
  function conReconciliacion(zonasARetomar: Zona[], opciones: { falla?: boolean } = {}) {
    const real = new AlmacenEnMemoria()
    const llamadas: string[] = []
    const store: FotoStorePort = almacenDelegando(real, {
      reconciliar: async () => {
        llamadas.push('reconciliar')
        if (opciones.falla) throw new Error('IndexedDB no disponible')
        return { zonasARetomar }
      },
      listar: async (c) => {
        llamadas.push('listar')
        return real.listar(c)
      },
    })
    return { store, real, llamadas }
  }

  it('cargar revisa primero lo que quedó a medias y después lista las fotos', async () => {
    const { store, llamadas } = conReconciliacion([])
    const { formulario } = montar('salida', store)
    await formulario.cargar()
    expect(llamadas).toEqual(['reconciliar', 'listar'])
  })

  it('las zonas a retomar quedan marcadas en la foto del estado y en su ficha', async () => {
    const { store } = conReconciliacion(['FRONTAL', 'POSTERIOR'])
    const { formulario, snap, zona } = montar('salida', store)

    await formulario.cargar()

    expect(snap().zonasARetomar).toEqual(['FRONTAL', 'POSTERIOR'])
    expect(zona('FRONTAL')?.aRetomar).toBe(true)
    expect(zona('POSTERIOR')?.aRetomar).toBe(true)
    expect(zona('LATERAL_DERECHO')?.aRetomar).toBe(false)
    expect(snap().zonaActiva).toBe('FRONTAL') // y la guía empieza por ahí
  })

  it('una zona que tiene foto no se marca como «a retomar» aunque el almacén la nombre', async () => {
    const { store, real } = conReconciliacion(['FRONTAL'])
    await real.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto(1))
    const { formulario, zona } = montar('salida', store)

    await formulario.cargar()

    expect(zona('FRONTAL')?.foto).not.toBeNull()
    expect(zona('FRONTAL')?.aRetomar).toBe(false)
  })

  it('al guardar una zona a retomar, deja de pedirse; las demás siguen pendientes', async () => {
    const { store } = conReconciliacion(['FRONTAL', 'POSTERIOR'])
    const { formulario, snap, zona } = montar('salida', store)
    await formulario.cargar()

    await formulario.guardar(foto(1), 'FRONTAL')

    expect(snap().zonasARetomar).toEqual(['POSTERIOR'])
    expect(zona('FRONTAL')?.aRetomar).toBe(false)
    expect(zona('POSTERIOR')?.aRetomar).toBe(true)
  })

  it('si revisar lo que quedó a medias falla, igual se muestran las fotos y no se marca un error de carga', async () => {
    const { store, real } = conReconciliacion([], { falla: true })
    await real.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto(1))
    const { formulario, snap } = montar('salida', store)

    await formulario.cargar()

    expect(snap().tomadas).toBe(1)
    expect(snap().errorCarga).toBeNull()
    expect(snap().zonasARetomar).toEqual([])
  })

  it('un almacén sin «reconciliar» (el de memoria) funciona igual', async () => {
    const { formulario, snap } = montar('salida', new AlmacenEnMemoria())
    await formulario.cargar()
    expect(snap().zonasARetomar).toEqual([])
    expect(snap().errorCarga).toBeNull()
  })

  it('una carga que termina después de liberar no deja zonas a retomar', async () => {
    let entregar: (r: { zonasARetomar: Zona[] }) => void = () => undefined
    const store: FotoStorePort = almacenDelegando(new AlmacenEnMemoria(), {
      reconciliar: () => new Promise((resolver) => (entregar = resolver)),
      listar: async () => [],
      guardar: async (_c, zona, f) => fotoRecienGuardada(f, zona),
    })
    const { formulario, snap } = montar('salida', store)

    const carga = formulario.cargar()
    formulario.liberar()
    entregar({ zonasARetomar: ['FRONTAL'] })
    await carga

    expect(snap().zonasARetomar).toEqual([])
  })
})

describe('liberar y suscripción', () => {
  it('liberar revoca todas las miniaturas y deja el formulario vacío', async () => {
    const { formulario, snap, urls, revocadas } = montar()
    await formulario.guardar(foto())
    await formulario.guardar(foto())

    formulario.liberar()

    expect(revocadas.sort()).toEqual([...urls].sort())
    expect(snap().tomadas).toBe(0)
  })

  it('una carga que termina después de liberar se descarta y no deja miniaturas colgadas', async () => {
    let entregar: (f: Awaited<ReturnType<FotoStorePort['listar']>>) => void = () => undefined
    const store: FotoStorePort = almacenDelegando(new AlmacenEnMemoria(), {
      listar: () => new Promise((r) => (entregar = r)),
      guardar: async (_c, zona, f) => fotoRecienGuardada(f, zona, 'b'),
    })
    const { formulario, snap, urls } = montar('salida', store)

    const carga = formulario.cargar()
    formulario.liberar()
    entregar([fotoRecienGuardada(foto(), 'FRONTAL', 'a')])
    await carga

    expect(snap().tomadas).toBe(0)
    expect(urls).toEqual([])
  })

  it('se puede liberar y volver a cargar (el modo estricto de React monta dos veces)', async () => {
    const store = new AlmacenEnMemoria()
    await store.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto())
    const { formulario, snap } = montar('salida', store)

    const primera = formulario.cargar()
    formulario.liberar()
    await primera
    await formulario.cargar()

    expect(snap().tomadas).toBe(1)
  })

  it('avisa de los cambios y la foto del estado solo cambia de identidad cuando cambia algo', async () => {
    const { formulario } = montar()
    const alAvisar = vi.fn()
    const baja = formulario.suscribir(alAvisar)
    const antes = formulario.getSnapshot()
    expect(formulario.getSnapshot()).toBe(antes)

    await formulario.guardar(foto())
    expect(alAvisar).toHaveBeenCalled()
    expect(formulario.getSnapshot()).not.toBe(antes)

    baja()
    alAvisar.mockClear()
    await formulario.guardar(foto())
    expect(alAvisar).not.toHaveBeenCalled()
  })
})
