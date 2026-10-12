/** E4-01 en pantalla: cada zona muestra cómo va la subida de su foto y permite «Reintentar». */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { StorageApi, UrlDeSubida } from '../api/storageApi'
import { SubidaError, type subirBlobAGcs } from '../api/subidaGcs'
import { CameraSession } from '../camera/cameraSession'
import type { ResultadoCaptura } from '../camera/captureFrame'
import { ENTORNO_SEGURO, FakeDocument, FakeStream } from '../camera/testing/fakes'
import { AlmacenEnMemoria } from '../data/almacenEnMemoria'
import { SubidaFotos } from '../data/subidaFotos'
import { FormularioCaptura } from './FormularioCaptura'

type Subir = typeof subirBlobAGcs

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

let n = 0
const permiso = async (): Promise<UrlDeSubida> => {
  n++
  return { urlDeSubida: `https://storage.googleapis.com/b/${n}.jpg`, storageKey: `traslado/${n}.jpg`, venceEnSegundos: 900 }
}

async function montarFormulario(subir: Subir) {
  const store = new AlmacenEnMemoria()
  const subidas = new SubidaFotos({ store, storage: { pedirUrlDeSubida: permiso } as StorageApi, subir: vi.fn<Subir>(subir) })
  const documento = new FakeDocument()
  let disparos = 0
  let ahora = 0
  const crearSesion = () =>
    new CameraSession({
      abrirCamara: async () => new FakeStream().como(),
      entorno: ENTORNO_SEGURO,
      documento,
      capturarFrame: async (): Promise<ResultadoCaptura> => ({
        ok: true,
        foto: { blob: new Blob([new Uint8Array([++disparos])], { type: 'image/jpeg' }), ancho: 1280, alto: 720, creadaEn: disparos },
      }),
      crearUrl: () => `blob:vista-previa-${disparos}`,
      revocarUrl: () => undefined,
      reloj: () => (ahora += 10_000),
    })
  const vista = render(<FormularioCaptura momento="salida" ordenId={812} store={store} subidas={subidas} crearSesion={crearSesion} />)
  await screen.findByText('Iniciando la cámara…')
  mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeEnabled())
  return { store, subidas, ...vista }
}

async function tomarYUsar() {
  await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))
  await screen.findByRole('button', { name: 'Tomar foto' })
}

const frontal = () => screen.getByRole('button', { name: /^Frontal:/ })

describe('estado de subida en cada zona', () => {
  it('la zona pasa a «Subida» sola, y el resumen cuenta 1/6 fotos subidas', async () => {
    await montarFormulario(async () => undefined)
    expect(screen.getByText('0/6 fotos subidas')).toBeInTheDocument()

    await tomarYUsar()

    await waitFor(() => expect(frontal()).toHaveTextContent('Subida'))
    expect(screen.getByText('1/6 fotos subidas')).toBeInTheDocument()
  })

  it('mientras sube dice «Subiendo…» y se puede seguir tomando la siguiente foto', async () => {
    let terminar: () => void = () => undefined
    await montarFormulario(() => new Promise<void>((r) => (terminar = r)))

    await tomarYUsar()
    await waitFor(() => expect(frontal()).toHaveTextContent('Subiendo…'))
    await tomarYUsar() // la captura no espera a la subida

    expect(screen.getByRole('button', { name: /^Lateral izquierdo:/ })).toHaveTextContent(/Subiendo|Tomada/)
    terminar()
  })

  it('si falla: «No se pudo subir», el motivo, un banner y un botón «Reintentar» aparte de la ficha', async () => {
    await montarFormulario(async () => {
      throw new SubidaError('red', 'Sin conexión: no se pudo subir la foto.')
    })

    await tomarYUsar()

    await waitFor(() => expect(frontal()).toHaveTextContent('No se pudo subir'))
    const fichaFrontal = frontal().closest('li') as HTMLElement
    expect(within(fichaFrontal).getByRole('alert')).toHaveTextContent('Sin conexión: no se pudo subir la foto.')
    expect(screen.getByText(/Una foto no se pudo subir/)).toBeInTheDocument()
    const reintentar = screen.getByRole('button', { name: 'Reintentar subida: Frontal' })
    expect(frontal()).not.toContainElement(reintentar) // hermanos, no un botón dentro de otro
  })

  it('«Reintentar» vuelve a subir y, si ahora sale bien, la zona queda «Subida» y desaparece el aviso', async () => {
    let falla = true
    await montarFormulario(async () => {
      if (falla) throw new SubidaError('red', 'Sin conexión: no se pudo subir la foto.')
    })
    await tomarYUsar()
    await screen.findByRole('button', { name: 'Reintentar subida: Frontal' })

    falla = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar subida: Frontal' }))

    await waitFor(() => expect(frontal()).toHaveTextContent('Subida'))
    expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/no se pudo subir/i)).not.toBeInTheDocument()
  })

  it('con las 6 subidas aparece el aviso de que están subidas', async () => {
    await montarFormulario(async () => undefined)

    for (let i = 0; i < 6; i++) await tomarYUsar()

    await waitFor(() => expect(screen.getByText(/Las 6 fotos están subidas/)).toBeInTheDocument())
    expect(screen.getByText('6/6 fotos subidas')).toBeInTheDocument()
  })

  it('sin accesibilidad rota con una foto fallida', async () => {
    const { container } = await montarFormulario(async () => {
      throw new SubidaError('red', 'Sin conexión: no se pudo subir la foto.')
    })
    await tomarYUsar()
    await screen.findByRole('button', { name: 'Reintentar subida: Frontal' })

    expect(await axe(container)).toHaveNoViolations()
    expect(within(screen.getByRole('list', { name: 'Zonas a fotografiar' })).getAllByRole('listitem')).toHaveLength(6)
  })
})
