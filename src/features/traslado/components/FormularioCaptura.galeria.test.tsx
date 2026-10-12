/** T12 en el formulario: una foto de la galería se guarda en la zona activa y se sube como cualquier otra. */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageApi, UrlDeSubida } from '../api/storageApi'
import type { subirBlobAGcs } from '../api/subidaGcs'
import { CameraSession } from '../camera/cameraSession'
import type { ResultadoCaptura } from '../camera/captureFrame'
import { ENTORNO_SEGURO, FakeDocument, FakeStream } from '../camera/testing/fakes'
import { AlmacenEnMemoria } from '../data/almacenEnMemoria'
import { SubidaFotos } from '../data/subidaFotos'
import { FormularioCaptura } from './FormularioCaptura'

type Subir = typeof subirBlobAGcs

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
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

let n = 0
const permiso = async (): Promise<UrlDeSubida> => {
  n++
  return { urlDeSubida: `https://storage.googleapis.com/b/${n}.jpg`, storageKey: `traslado/${n}.jpg`, venceEnSegundos: 900 }
}

const fotoElegida = (marca: number): ResultadoCaptura => ({
  ok: true,
  foto: { blob: new Blob([new Uint8Array([marca])], { type: 'image/jpeg' }), ancho: 1920, alto: 1440, creadaEn: 1_700_000_000_000 + marca },
})

async function montar() {
  const store = new AlmacenEnMemoria()
  const subir = vi.fn<Subir>(async () => undefined)
  const subidas = new SubidaFotos({ store, storage: { pedirUrlDeSubida: permiso } as StorageApi, subir })
  const documento = new FakeDocument()
  let ahora = 0
  const crearSesion = () =>
    new CameraSession({
      abrirCamara: async () => new FakeStream().como(),
      entorno: ENTORNO_SEGURO,
      documento,
      capturarFrame: async () => fotoElegida(1),
      crearUrl: () => 'blob:camara',
      revocarUrl: () => undefined,
      reloj: () => (ahora += 10_000),
    })
  let marca = 0
  const convertirArchivo = vi.fn(async () => fotoElegida(++marca))
  const vista = render(
    <FormularioCaptura momento="salida" ordenId={812} store={store} subidas={subidas} crearSesion={crearSesion} convertirArchivo={convertirArchivo} />,
  )
  await screen.findByText('Iniciando la cámara…')
  mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeEnabled())
  return { store, subir, convertirArchivo, ...vista }
}

const entrada = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement
const elegir = (c: HTMLElement) => userEvent.upload(entrada(c), new File([new Uint8Array([1])], 'IMG.jpg', { type: 'image/jpeg' }))
const ficha = (nombre: RegExp) => screen.getByRole('button', { name: nombre })

describe('una foto de la galería en el formulario', () => {
  it('se guarda en la zona activa, avanza a la siguiente y se sube sola', async () => {
    const m = await montar()
    expect(ficha(/^Frontal:/)).toHaveAttribute('aria-pressed', 'true')

    await elegir(m.container)
    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    await waitFor(() => expect(ficha(/^Frontal:/)).toHaveTextContent('Subida'))
    expect(screen.getByText('1/6')).toBeInTheDocument()
    expect(ficha(/^Lateral izquierdo:/)).toHaveAttribute('aria-pressed', 'true')
    expect(m.subir).toHaveBeenCalledTimes(1)
    const guardadas = await m.store.listar({ ordenId: 812, momento: 'salida' })
    expect(guardadas).toHaveLength(1)
    expect(guardadas[0]).toMatchObject({ zona: 'FRONTAL', estado: 'uploaded', ancho: 1920, creadaEn: 1_700_000_000_001 })
  })

  it('mientras la foto está en revisión no se puede cambiar de zona', async () => {
    const m = await montar()
    await elegir(m.container)
    await screen.findByRole('button', { name: 'Usar' })

    expect(ficha(/^Lateral izquierdo:/)).toBeDisabled()
    expect(ficha(/^Frontal:/)).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(ficha(/^Lateral izquierdo:/)).toBeEnabled())
  })

  it('al descartarla no se guarda ni se sube nada', async () => {
    const m = await montar()
    await elegir(m.container)
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }))

    expect(await m.store.listar({ ordenId: 812, momento: 'salida' })).toEqual([])
    expect(m.subir).not.toHaveBeenCalled()
    expect(screen.getByText('0/6')).toBeInTheDocument()
  })

  it('mezcla cámara y galería: la foto de la cámara va a la zona siguiente', async () => {
    const m = await montar()
    await elegir(m.container)
    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))
    await screen.findByRole('button', { name: 'Elegir de la galería' })

    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    await waitFor(() => expect(screen.getByText('2/6')).toBeInTheDocument())
    const zonas = (await m.store.listar({ ordenId: 812, momento: 'salida' })).map((f) => f.zona).sort()
    expect(zonas).toEqual(['FRONTAL', 'LATERAL_IZQUIERDO'])
  })

  it('con las 6 zonas tomadas ya no ofrece elegir más fotos', async () => {
    const m = await montar()
    for (let i = 0; i < 6; i++) {
      await elegir(m.container)
      await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))
      await waitFor(() => expect(screen.getByText(`${i + 1}/6`)).toBeInTheDocument())
    }
    expect(screen.getByRole('button', { name: 'Elegir de la galería' })).toBeDisabled()
  })
})
