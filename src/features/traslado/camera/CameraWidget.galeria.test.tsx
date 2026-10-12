/** T12 · «Elegir de la galería» en el widget de cámara. */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { CameraSession } from './cameraSession'
import { CameraWidget, type CameraWidgetProps } from './CameraWidget'
import { CapturaError, type FotoCapturada, type ResultadoCaptura } from './captureFrame'
import { ENTORNO_SEGURO, FakeDocument, FakeStream, errorDeDom } from './testing/fakes'

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

const fotoDeGaleria = (): FotoCapturada => ({
  blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/jpeg' }),
  ancho: 1920,
  alto: 1440,
  creadaEn: 1_700_000_000_000,
})
const archivo = (nombre = 'IMG_0001.jpg', tipo = 'image/jpeg') => new File([new Uint8Array([1, 2, 3])], nombre, { type: tipo })

function montar(opciones: { abrirCamara?: () => Promise<MediaStream> } = {}) {
  const documento = new FakeDocument()
  const abrirCamara = vi.fn(opciones.abrirCamara ?? (async () => new FakeStream().como()))
  let ahora = 0
  const crearSesion = () =>
    new CameraSession({
      abrirCamara,
      entorno: ENTORNO_SEGURO,
      documento,
      capturarFrame: async (): Promise<ResultadoCaptura> => ({
        ok: true,
        foto: { blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), ancho: 1280, alto: 720, creadaEn: 1 },
      }),
      crearUrl: () => 'blob:camara',
      revocarUrl: () => undefined,
      reloj: () => (ahora += 10_000),
    })
  return { crearSesion, abrirCamara }
}

async function montarConGaleria(props: Partial<CameraWidgetProps> = {}, camara: Parameters<typeof montar>[0] = {}) {
  const m = montar(camara)
  const convertirArchivo = vi.fn(async (): Promise<ResultadoCaptura> => ({ ok: true, foto: fotoDeGaleria() }))
  const onUsar = vi.fn<(foto: unknown) => Promise<void>>(async () => undefined)
  const onCapturada = vi.fn()
  const vista = render(<CameraWidget crearSesion={m.crearSesion} permitirGaleria convertirArchivo={convertirArchivo} onUsar={onUsar} onCapturada={onCapturada} {...props} />)
  return { ...m, ...vista, convertirArchivo, onUsar, onCapturada }
}

const entrada = (contenedor: HTMLElement) => contenedor.querySelector('input[type="file"]') as HTMLInputElement
const botonGaleria = () => screen.getByRole('button', { name: 'Elegir de la galería' })
const elegir = async (contenedor: HTMLElement, f = archivo()) => userEvent.upload(entrada(contenedor), f)
/** Algunos sistemas dejan elegir archivos que `accept` no anuncia (p. ej. «Todos los archivos»): así se llega a la validación propia. */
const elegirSinFiltro = async (contenedor: HTMLElement, f: File) => userEvent.setup({ applyAccept: false }).upload(entrada(contenedor), f)

describe('el botón de la galería', () => {
  it('no existe si no se pide: los usos anteriores del widget no cambian', async () => {
    const m = montar()
    const { container } = render(<CameraWidget crearSesion={m.crearSesion} />)
    await screen.findByText('Iniciando la cámara…')
    expect(screen.queryByRole('button', { name: 'Elegir de la galería' })).not.toBeInTheDocument()
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  it('con permitirGaleria hay un botón y una entrada de archivos de imágenes SIN `capture` (abre la galería, no la cámara)', async () => {
    const { container } = await montarConGaleria()
    expect(botonGaleria()).toBeInTheDocument()
    expect(entrada(container)).toHaveAttribute('accept', 'image/*')
    expect(entrada(container)).not.toHaveAttribute('capture')
  })

  it('el botón abre el selector de archivos', async () => {
    const { container } = await montarConGaleria()
    const abrir = vi.spyOn(entrada(container), 'click')
    await userEvent.click(botonGaleria())
    expect(abrir).toHaveBeenCalledTimes(1)
  })

  it('está bloqueado cuando ya no hay zona a fotografiar (disparoDeshabilitado)', async () => {
    await montarConGaleria({ disparoDeshabilitado: true })
    expect(botonGaleria()).toBeDisabled()
  })
})

describe('elegir una foto', () => {
  it('queda en revisión con «Usar» y «Descartar», avisa a quien llama y no abre ninguna captura de cámara', async () => {
    const { container, convertirArchivo, onCapturada } = await montarConGaleria()
    const archivoElegido = archivo()

    await elegir(container, archivoElegido)

    expect(await screen.findByRole('img', { name: 'Foto tomada, pendiente de revisión' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Elegir de la galería' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomar foto' })).not.toBeInTheDocument()
    expect(convertirArchivo).toHaveBeenCalledWith(archivoElegido)
    expect(onCapturada).toHaveBeenCalledTimes(1)
  })

  it('«Usar» entrega la foto convertida (no el archivo original) y vuelve al estado normal', async () => {
    const { container, onUsar } = await montarConGaleria()
    await elegir(container)

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    await waitFor(() => expect(onUsar).toHaveBeenCalledTimes(1))
    const entregada = onUsar.mock.calls[0]?.[0] as FotoCapturada & { urlVistaPrevia: string }
    expect(entregada.ancho).toBe(1920)
    expect(entregada.blob.type).toBe('image/jpeg')
    expect(entregada.urlVistaPrevia).toMatch(/^blob:/)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Usar' })).not.toBeInTheDocument())
    expect(botonGaleria()).toBeInTheDocument()
  })

  it('«Descartar» tira la foto sin usarla y se puede elegir otra', async () => {
    const { container, onUsar } = await montarConGaleria()
    await elegir(container)

    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }))

    expect(screen.queryByRole('img', { name: 'Foto tomada, pendiente de revisión' })).not.toBeInTheDocument()
    expect(onUsar).not.toHaveBeenCalled()
    expect(botonGaleria()).toBeEnabled()
  })

  it('la URL de la vista previa se suelta al descartar y al usar', async () => {
    const revocar = vi.spyOn(URL, 'revokeObjectURL')
    const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:galeria-1')
    const { container } = await montarConGaleria()
    await elegir(container)
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(crear).toHaveBeenCalledTimes(1)
    expect(revocar).toHaveBeenCalledWith('blob:galeria-1')
  })

  it('se puede elegir la MISMA foto otra vez después de descartarla', async () => {
    const { container, convertirArchivo } = await montarConGaleria()
    const f = archivo()
    await elegir(container, f)
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    await elegir(container, f)
    await screen.findByRole('button', { name: 'Usar' })
    expect(convertirArchivo).toHaveBeenCalledTimes(2)
  })

  it('mientras se prepara dice «Preparando la foto…» y bloquea los dos botones', async () => {
    let terminar: (r: ResultadoCaptura) => void = () => undefined
    const { container } = await montarConGaleria({ convertirArchivo: () => new Promise<ResultadoCaptura>((r) => (terminar = r)) })

    await elegir(container)

    expect(await screen.findByText('Preparando la foto…')).toBeInTheDocument()
    expect(botonGaleria()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDisabled()
    await act(async () => terminar({ ok: true, foto: fotoDeGaleria() }))
    expect(await screen.findByRole('button', { name: 'Usar' })).toBeInTheDocument()
    expect(screen.queryByText('Preparando la foto…')).not.toBeInTheDocument()
  })

  it('con la cámara LISTA, «Tomar foto» también se bloquea mientras se prepara la foto de la galería', async () => {
    let terminar: (r: ResultadoCaptura) => void = () => undefined
    const { container } = await montarConGaleria({ convertirArchivo: () => new Promise<ResultadoCaptura>((r) => (terminar = r)) })
    mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeEnabled())

    await elegir(container)

    expect(await screen.findByText('Preparando la foto…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDisabled()
    await act(async () => terminar({ ok: true, foto: fotoDeGaleria() }))
    await screen.findByRole('button', { name: 'Usar' })
  })

  it('la guía de la zona se muestra con la cámara lista y se oculta sobre la foto elegida', async () => {
    const { container } = await montarConGaleria({ guia: { etiqueta: 'Frontal' } })
    mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)
    expect(await screen.findByText('Frontal')).toBeInTheDocument()

    await elegir(container)
    await screen.findByRole('button', { name: 'Usar' })

    expect(screen.queryByText('Frontal')).not.toBeInTheDocument()
  })

  it('si «Usar» no puede guardar muestra el motivo y la foto sigue en revisión', async () => {
    const guardar = vi.fn(async () => {
      throw Object.assign(new Error('x'), { mensajeParaElOperario: 'Espacio insuficiente en el dispositivo.' })
    })
    const { container } = await montarConGaleria({ onUsar: guardar })
    await elegir(container)

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    expect(await screen.findByText('Espacio insuficiente en el dispositivo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar' })).toBeEnabled()
  })
})

describe('archivos que no sirven', () => {
  it('un archivo inválido muestra el motivo, no abre ninguna revisión y deja volver a elegir', async () => {
    const convertirArchivo = vi.fn(async (): Promise<ResultadoCaptura> => ({ ok: false, error: new CapturaError('ARCHIVO_INVALIDO') }))
    const { container, onCapturada } = await montarConGaleria({ convertirArchivo })

    await elegirSinFiltro(container, archivo('nota.pdf', 'application/pdf'))

    expect(await screen.findByText(/Elige una foto/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usar' })).not.toBeInTheDocument()
    expect(onCapturada).not.toHaveBeenCalled()
    expect(botonGaleria()).toBeEnabled()
  })

  it('si la conversión lanza una excepción inesperada tampoco rompe el widget', async () => {
    const convertirArchivo = vi.fn(async (): Promise<ResultadoCaptura> => {
      throw new Error('boom')
    })
    const { container } = await montarConGaleria({ convertirArchivo })

    await elegir(container)

    expect(await screen.findByText('No se pudo usar ese archivo. Elige otra foto.')).toBeInTheDocument()
    expect(botonGaleria()).toBeEnabled()
  })

  it('el aviso de error se borra al elegir otra foto', async () => {
    const convertirArchivo = vi
      .fn<() => Promise<ResultadoCaptura>>()
      .mockResolvedValueOnce({ ok: false, error: new CapturaError('ARCHIVO_INVALIDO') })
      .mockResolvedValueOnce({ ok: true, foto: fotoDeGaleria() })
    const { container } = await montarConGaleria({ convertirArchivo })
    await elegirSinFiltro(container, archivo('a.pdf', 'application/pdf'))
    await screen.findByText(/Elige una foto/)

    await elegir(container)

    await screen.findByRole('button', { name: 'Usar' })
    expect(screen.queryByText(/Elige una foto/)).not.toBeInTheDocument()
  })
})

describe('sin cámara', () => {
  it('con el permiso denegado la galería sigue funcionando: se puede elegir y usar una foto', async () => {
    const { container, onUsar } = await montarConGaleria({}, { abrirCamara: () => Promise.reject(errorDeDom('NotAllowedError')) })
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDisabled()
    expect(botonGaleria()).toBeEnabled()

    await elegir(container)
    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    await waitFor(() => expect(onUsar).toHaveBeenCalledTimes(1))
  })
})

describe('accesibilidad', () => {
  it('sin violaciones con el botón y con una foto en revisión', async () => {
    const { container } = await montarConGaleria()
    mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)
    expect(await axe(container)).toHaveNoViolations()

    await elegir(container)
    await screen.findByRole('button', { name: 'Usar' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
