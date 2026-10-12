import { Blob as NodeBlob } from 'node:buffer'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { CameraSession } from '../camera/cameraSession'
import type { ResultadoCaptura } from '../camera/captureFrame'
import { ENTORNO_SEGURO, FakeDocument, FakeStream } from '../camera/testing/fakes'
import type { EstadoAlmacenamiento } from '@/core/storage/persistencia'
import { AlmacenEnMemoria } from '../data/almacenEnMemoria'
import { almacenDelegando, fotoRecienGuardada } from '../data/testing/almacenes'
import type { FotoGuardada, FotoParaGuardar, FotoStorePort } from '../data/fotoStorePort'
import { FotoStoreDexie } from '../data/fotoStoreDexie'
import { TrasladoDb } from '../data/trasladoDb'
import type { Momento, Zona } from '../domain'
import { FormularioCaptura } from './FormularioCaptura'

// jsdom no tiene cámara ni reproduce video: se simulan `play`/`pause`, el primer frame y las URL.
let contadorDeUrls = 0
beforeEach(() => {
  contadorDeUrls = 0
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:url-${++contadorDeUrls}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

function mostrarFrame(video: HTMLVideoElement) {
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 })
  Object.defineProperty(video, 'readyState', { configurable: true, value: 4 })
  act(() => {
    video.dispatchEvent(new Event('loadeddata'))
  })
}

// Con IndexedDB simulado hay que usar el Blob de Node: el de jsdom no sobrevive al clonado que hace
// `fake-indexeddb` y la verificación de lectura de vuelta lo rechaza. En un navegador real no pasa.
const nuevoBlob = (marca: number): Blob => new NodeBlob([new Uint8Array([marca])], { type: 'image/jpeg' }) as unknown as Blob

const foto = (marca: number): FotoParaGuardar => ({
  blob: nuevoBlob(marca),
  ancho: 1280,
  alto: 720,
  creadaEn: 1_700_000_000_000 + marca,
})

function montar(opciones: { store?: FotoStorePort } = {}) {
  const store = opciones.store ?? new AlmacenEnMemoria()
  const documento = new FakeDocument()
  let disparos = 0
  let ahora = 0
  const crearSesion = () =>
    new CameraSession({
      abrirCamara: async () => new FakeStream().como(),
      entorno: ENTORNO_SEGURO,
      documento,
      capturarFrame: async (): Promise<ResultadoCaptura> => ({ ok: true, foto: { ...foto(++disparos), blob: nuevoBlob(disparos) } }),
      crearUrl: () => `blob:vista-previa-${disparos}`,
      revocarUrl: () => undefined,
      reloj: () => (ahora += 10_000), // la protección de toque accidental nunca estorba aquí
    })
  return { store, documento, crearSesion }
}

async function montarFormulario(momento: Momento = 'salida', opciones: { store?: FotoStorePort } = {}) {
  const m = montar(opciones)
  const vista = render(<FormularioCaptura momento={momento} ordenId={812} store={m.store} crearSesion={m.crearSesion} />)
  await screen.findByText('Iniciando la cámara…')
  mostrarFrame(video())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeEnabled())
  return { ...m, ...vista }
}

const video = () => screen.getByLabelText('Vista de la cámara') as HTMLVideoElement
const disparo = () => screen.getByRole('button', { name: 'Tomar foto' })
const ficha = (nombre: RegExp | string) => screen.getByRole('button', { name: nombre })
const contador = () => screen.getByText(/^\d\/\d$/).textContent

/**
 * Toma una foto y la usa. Espera a que el guardado termine de verdad: el botón «Tomar foto» solo
 * vuelve a aparecer cuando la cámara regresa a «lista». (Esperar a que «Usar» desaparezca no
 * sirve: pasa a «Guardando…» al instante, y con un almacén lento eso es antes de terminar.)
 */
async function tomarYUsar() {
  await userEvent.click(disparo())
  await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))
  await screen.findByRole('button', { name: 'Tomar foto' })
}

describe('AC4: contador y zonas por momento', () => {
  it('la salida arranca en 0/6 con seis fichas vacías y la primera zona como guía', async () => {
    await montarFormulario('salida')

    expect(contador()).toBe('0/6')
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('Frontal', { selector: 'span.rounded-chip' })).toBeInTheDocument() // la guía sobre el video
    expect(ficha(/^Frontal: sin foto/)).toHaveAttribute('aria-pressed', 'true')
    expect(ficha(/^Posterior: sin foto/)).toHaveAttribute('aria-pressed', 'false')
  })

  it('AC6: la entrega arranca en 0/5, incluye VIN y no incluye las dos de placa', async () => {
    await montarFormulario('entrega')

    expect(contador()).toBe('0/5')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(ficha(/^Número de VIN/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Placa/ })).not.toBeInTheDocument()
  })
})

describe('AC3: «Usar» guarda y avanza a la siguiente zona sin foto', () => {
  it('tras usar la primera foto: 1/6, miniatura en Frontal, y la guía pasa a Lateral izquierdo', async () => {
    await montarFormulario('salida')

    await tomarYUsar()

    expect(contador()).toBe('1/6')
    const frontal = ficha(/^Frontal: foto tomada/)
    expect(frontal.querySelector('img')).not.toBeNull()
    expect(frontal).toHaveTextContent('Tomada')
    expect(ficha(/^Lateral izquierdo: sin foto/)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Lateral izquierdo', { selector: 'span.rounded-chip' })).toBeInTheDocument()
  })

  it('con las 6 fotos: 6/6, aviso de completo y el disparo bloqueado', async () => {
    await montarFormulario('salida')

    for (let i = 0; i < 6; i++) await tomarYUsar()

    expect(contador()).toBe('6/6')
    expect(screen.getByText(/Las 6 fotos están tomadas/)).toBeInTheDocument()
    expect(disparo()).toBeDisabled()
    expect(screen.queryByText('Posterior', { selector: 'span.rounded-chip' })).not.toBeInTheDocument() // sin guía
  })

  it('con las 5 de la entrega: 5/5 y completo', async () => {
    await montarFormulario('entrega')
    for (let i = 0; i < 5; i++) await tomarYUsar()
    expect(contador()).toBe('5/5')
    expect(screen.getByText(/Las 5 fotos están tomadas/)).toBeInTheDocument()
  })
})

describe('repetir una zona', () => {
  it('tocar una ficha con foto la elige; usar la nueva la reemplaza y el contador no cambia', async () => {
    await montarFormulario('salida')
    for (let i = 0; i < 6; i++) await tomarYUsar()
    const miniaturaVieja = ficha(/^Posterior: foto tomada/).querySelector('img')?.getAttribute('src')

    await userEvent.click(ficha(/^Posterior: foto tomada/))
    expect(ficha(/^Posterior: foto tomada/)).toHaveAttribute('aria-pressed', 'true')
    expect(disparo()).toBeEnabled()
    await tomarYUsar()

    expect(contador()).toBe('6/6')
    expect(ficha(/^Posterior: foto tomada/).querySelector('img')?.getAttribute('src')).not.toBe(miniaturaVieja)
  })

  it('al repetir una zona del medio, la guía sigue por el hueco que faltaba', async () => {
    await montarFormulario('salida')
    await tomarYUsar() // Frontal
    await tomarYUsar() // Lateral izquierdo → ahora toca Lateral derecho
    await userEvent.click(ficha(/^Frontal: foto tomada/))

    await tomarYUsar() // repite Frontal

    expect(contador()).toBe('2/6')
    expect(ficha(/^Lateral derecho: sin foto/)).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('integridad de la zona', () => {
  it('mientras la foto está en revisión las fichas están bloqueadas, y se desbloquean al repetir', async () => {
    await montarFormulario('salida')
    await userEvent.click(disparo())
    await screen.findByRole('button', { name: 'Usar' })

    expect(ficha(/^Posterior: sin foto/)).toBeDisabled()
    expect(ficha(/^Frontal: sin foto/)).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Repetir' }))
    await waitFor(() => expect(ficha(/^Posterior: sin foto/)).toBeEnabled())
  })

  it('la foto queda en la zona que estaba activa al tomarla', async () => {
    await montarFormulario('salida')
    await userEvent.click(ficha(/^Posterior: sin foto/)) // el operario elige Posterior antes de disparar

    await tomarYUsar()

    expect(ficha(/^Posterior: foto tomada/)).toBeInTheDocument()
    expect(ficha(/^Frontal: sin foto/)).toBeInTheDocument()
    expect(contador()).toBe('1/6')
    // Y la guía sigue por la zona que viene detrás de Posterior, no vuelve a Frontal.
    expect(ficha(/^Placa — estado físico: sin foto/)).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('si no se puede guardar', () => {
  it('avisa, no cuenta la foto, la deja en revisión y el siguiente intento sí la guarda', async () => {
    const real = new AlmacenEnMemoria()
    let fallar = true
    const store: FotoStorePort = almacenDelegando(real, {
      guardar: (c, zona, f) => (fallar ? Promise.reject(new Error('disco lleno')) : real.guardar(c, zona, f)),
    })
    await montarFormulario('salida', { store })
    await userEvent.click(disparo())

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la foto')
    expect(contador()).toBe('0/6')
    expect(screen.getByAltText('Foto tomada, pendiente de revisión')).toBeInTheDocument()
    expect((await real.listar({ ordenId: 812, momento: 'salida' })).length).toBe(0)

    fallar = false
    await userEvent.click(screen.getByRole('button', { name: 'Usar' }))
    await waitFor(() => expect(contador()).toBe('1/6'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('lo que ya estaba guardado', () => {
  it('al montarse muestra las fotos guardadas y sigue por el primer hueco', async () => {
    const store = new AlmacenEnMemoria()
    const clave = { ordenId: 812, momento: 'salida' as const }
    await store.guardar(clave, 'FRONTAL', foto(1))
    await store.guardar(clave, 'LATERAL_IZQUIERDO', foto(2))

    await montarFormulario('salida', { store })

    await waitFor(() => expect(contador()).toBe('2/6'))
    expect(ficha(/^Frontal: foto tomada/)).toBeInTheDocument()
    expect(ficha(/^Lateral derecho: sin foto/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('si no puede leer lo guardado, lo avisa sin romper el formulario', async () => {
    const store: FotoStorePort = almacenDelegando(new AlmacenEnMemoria(), {
      listar: () => Promise.reject(new Error('IndexedDB no disponible')),
      guardar: async (_c, zona: Zona, f): Promise<FotoGuardada> => fotoRecienGuardada(f, zona),
    })
    await montarFormulario('salida', { store })

    expect(await screen.findByText('No se pudieron leer las fotos guardadas.')).toBeInTheDocument()
    expect(contador()).toBe('0/6')
    expect(disparo()).toBeEnabled()
  })
})

describe('T4a · con el almacén real (IndexedDB)', () => {
  const bases: TrasladoDb[] = []
  const nuevaBase = () => {
    const db = new TrasladoDb(`formulario-${globalThis.crypto.randomUUID()}`)
    bases.push(db)
    return db
  }
  afterEach(async () => {
    for (const db of bases.splice(0)) {
      db.close()
      await db.delete()
    }
  })

  it('una foto usada sobrevive a una recarga: al volver a montar el formulario sigue ahí', async () => {
    const db = nuevaBase()
    const primera = await montarFormulario('salida', { store: new FotoStoreDexie(db) })
    await tomarYUsar()
    expect(contador()).toBe('1/6')
    primera.unmount()

    // «Recarga»: otro formulario, otra instancia del almacén, la misma base.
    await montarFormulario('salida', { store: new FotoStoreDexie(db) })

    await waitFor(() => expect(contador()).toBe('1/6'))
    expect(ficha(/^Frontal: foto tomada/).querySelector('img')).not.toBeNull()
    expect(ficha(/^Lateral izquierdo: sin foto/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC3: sin espacio, avisa «Espacio insuficiente», no cuenta la foto y la deja en revisión', async () => {
    const db = nuevaBase()
    vi.spyOn(db.enEscritura, 'update').mockRejectedValue(new DOMException('sin espacio', 'QuotaExceededError'))
    await montarFormulario('salida', { store: new FotoStoreDexie(db) })
    await userEvent.click(disparo())

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Espacio insuficiente')
    expect(contador()).toBe('0/6')
    expect(screen.getByAltText('Foto tomada, pendiente de revisión')).toBeInTheDocument()
    expect(await db.fotos.count()).toBe(0)
  })

  it('AC4: repetir una zona con un fallo al guardar deja la foto anterior intacta en pantalla y en la base', async () => {
    const db = nuevaBase()
    await montarFormulario('salida', { store: new FotoStoreDexie(db) })
    await tomarYUsar() // Frontal guardada
    const [antes] = await db.fotos.toArray()
    vi.spyOn(db.enEscritura, 'update').mockRejectedValue(new Error('disco raro'))

    await userEvent.click(ficha(/^Frontal: foto tomada/))
    await userEvent.click(disparo())
    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Repetir' })) // el operario se rinde

    await waitFor(() => expect(ficha(/^Frontal: foto tomada/)).toBeInTheDocument())
    const filas = await db.fotos.toArray()
    expect(filas.map((f) => f.clientId)).toEqual([antes?.clientId])
    expect(contador()).toBe('1/6')
  })
})

describe('T4b · al abrir tras un cierre en plena escritura', () => {
  const bases: TrasladoDb[] = []
  const nuevaBase = () => {
    const db = new TrasladoDb(`reabrir-${globalThis.crypto.randomUUID()}`)
    bases.push(db)
    return db
  }
  afterEach(async () => {
    for (const db of bases.splice(0)) {
      db.close()
      await db.delete()
    }
  })

  const huerfana = (zona: Zona): Parameters<TrasladoDb['enEscritura']['put']>[0] => ({
    clientId: `huerfana-${zona}`,
    ordenId: 812,
    momento: 'salida',
    zona,
    blob: null,
    ancho: 1,
    alto: 1,
    creadaEn: 1,
    estado: 'writing',
    errorMessage: null,
    actualizadoEn: 0, // de hace mucho: de una sesión anterior
  })

  it('AC1: avisa qué fotos no se guardaron, marca solo esas zonas y empieza por ellas', async () => {
    const db = nuevaBase()
    await db.enEscritura.bulkPut([huerfana('POSTERIOR'), huerfana('LATERAL_DERECHO')])

    await montarFormulario('salida', { store: new FotoStoreDexie(db) })

    expect(await screen.findByRole('alert')).toHaveTextContent('volver a tomarlas: Lateral derecho, Posterior')
    expect(ficha(/^Posterior: la foto no se guardó/)).toBeInTheDocument()
    expect(ficha(/^Lateral derecho: la foto no se guardó/)).toBeInTheDocument()
    expect(ficha(/^Frontal: sin foto/)).toBeInTheDocument() // sin aviso: nunca se intentó
    expect(contador()).toBe('0/6')
    expect(ficha(/^Frontal: sin foto/)).toHaveAttribute('aria-pressed', 'true') // el primer hueco, como siempre
  })

  it('al volver a tomar una zona pendiente, el aviso se va y la base queda limpia', async () => {
    const db = nuevaBase()
    await db.enEscritura.put(huerfana('FRONTAL'))
    await montarFormulario('salida', { store: new FotoStoreDexie(db) })
    await screen.findByRole('alert')
    expect(ficha(/^Frontal: la foto no se guardó/)).toHaveAttribute('aria-pressed', 'true')

    await tomarYUsar()

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(contador()).toBe('1/6')
    expect(ficha(/^Frontal: foto tomada/)).toBeInTheDocument()
    expect(await db.enEscritura.count()).toBe(0)
  })

  it('si la zona ya tenía una foto aceptada, el intento fallido no molesta con ningún aviso', async () => {
    const db = nuevaBase()
    const store = new FotoStoreDexie(db)
    await store.guardar({ ordenId: 812, momento: 'salida' }, 'FRONTAL', foto(1))
    await db.enEscritura.put(huerfana('FRONTAL')) // un intento de repetirla que murió a medias

    await montarFormulario('salida', { store: new FotoStoreDexie(db) })

    await waitFor(() => expect(contador()).toBe('1/6'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(ficha(/^Frontal: foto tomada/)).toBeInTheDocument()
  })

  it('AC3: cada momento muestra solo sus fotos, también tras una recarga', async () => {
    const db = nuevaBase()
    const salida = await montarFormulario('salida', { store: new FotoStoreDexie(db) })
    await tomarYUsar()
    await tomarYUsar()
    expect(contador()).toBe('2/6')
    salida.unmount()

    const entrega = await montarFormulario('entrega', { store: new FotoStoreDexie(db) })
    await waitFor(() => expect(contador()).toBe('0/5'))
    expect(screen.queryByRole('button', { name: /foto tomada/ })).not.toBeInTheDocument()
    entrega.unmount()

    await montarFormulario('salida', { store: new FotoStoreDexie(db) })
    await waitFor(() => expect(contador()).toBe('2/6'))
  })
})

describe('AC6 · espacio y persistencia al abrir el formulario', () => {
  const estado = (parcial: Partial<EstadoAlmacenamiento> = {}): EstadoAlmacenamiento => ({
    soportado: true,
    persistente: true,
    usoBytes: 10,
    cuotaBytes: 1000,
    espacioBajo: false,
    ...parcial,
  })

  async function montarConAlmacenamiento(comprobar: () => Promise<EstadoAlmacenamiento>) {
    const m = montar()
    render(<FormularioCaptura momento="salida" ordenId={812} store={m.store} crearSesion={m.crearSesion} comprobarAlmacenamiento={comprobar} />)
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(video())
    await waitFor(() => expect(disparo()).toBeEnabled())
  }

  it('consulta el almacenamiento una sola vez al abrir', async () => {
    const comprobar = vi.fn(async () => estado())
    await montarConAlmacenamiento(comprobar)
    expect(comprobar).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Queda poco espacio/)).not.toBeInTheDocument()
  })

  it('con poco espacio avisa, pero el disparo sigue disponible', async () => {
    await montarConAlmacenamiento(async () => estado({ espacioBajo: true }))

    expect(await screen.findByText(/Queda poco espacio en el dispositivo/)).toBeInTheDocument()
    expect(disparo()).toBeEnabled()
  })

  it('si el navegador no promete conservar los datos (persistente: false), no se avisa ni se bloquea nada', async () => {
    await montarConAlmacenamiento(async () => estado({ persistente: false }))
    expect(screen.queryByText(/Queda poco espacio/)).not.toBeInTheDocument()
    expect(disparo()).toBeEnabled()
  })

  it('si la consulta falla, el formulario sigue funcionando', async () => {
    await montarConAlmacenamiento(() => Promise.reject(new Error('no disponible')))
    expect(disparo()).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('accesibilidad', () => {
  it('sin violaciones al inicio, a mitad de camino, con una foto en revisión y completo', async () => {
    const { container } = await montarFormulario('entrega')
    expect(await axe(container)).toHaveNoViolations()

    await tomarYUsar()
    expect(await axe(container)).toHaveNoViolations()

    await userEvent.click(disparo())
    await screen.findByRole('button', { name: 'Usar' })
    expect(await axe(container)).toHaveNoViolations()
    await userEvent.click(screen.getByRole('button', { name: 'Usar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Usar' })).not.toBeInTheDocument())

    for (let i = 0; i < 3; i++) await tomarYUsar()
    expect(await axe(container)).toHaveNoViolations()
  })
})
