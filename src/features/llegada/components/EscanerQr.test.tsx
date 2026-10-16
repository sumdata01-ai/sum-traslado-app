/** El visor del QR de la llegada: abre la cámara, entrega el texto CRUDO del primer código y suelta la cámara. */
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { CameraSession } from '@/features/traslado/camera/cameraSession'
import type { DecodificadorCodigos } from '@/features/traslado/camera/escaneo'
import { ENTORNO_SEGURO, FakeDocument, FakeStream, errorDeDom } from '@/features/traslado/camera/testing/fakes'
import { EscanerQr, type EscanerQrProps } from './EscanerQr'

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

/** Un lienzo de mentira: jsdom no dibuja. */
const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }) }) as unknown as HTMLCanvasElement

function montar(opciones: { lecturas?: Array<string | null | Error>; abrirCamara?: () => Promise<MediaStream> } = {}) {
  const streams: FakeStream[] = []
  const abrirCamara = vi.fn(
    opciones.abrirCamara ??
      (async () => {
        const stream = new FakeStream()
        streams.push(stream)
        return stream.como()
      }),
  )
  const documento = new FakeDocument()
  const lecturas = [...(opciones.lecturas ?? [])]
  const decodificar = vi.fn((): string | null => {
    const r = lecturas.length > 0 ? lecturas.shift()! : null
    if (r instanceof Error) throw r
    return r
  })
  const decodificador: DecodificadorCodigos = { decodificar }
  const onDetectado = vi.fn()
  const cargarDecodificador = vi.fn(async () => decodificador)
  const props: EscanerQrProps = {
    onDetectado,
    cargarDecodificador,
    crearLienzo: lienzoFalso,
    crearSesion: () => new CameraSession({ abrirCamara, entorno: ENTORNO_SEGURO, documento }),
  }
  return { props, abrirCamara, streams, decodificar, onDetectado, cargarDecodificador }
}

const video = () => screen.getByLabelText('Vista de la cámara') as HTMLVideoElement

async function abrirLista(opciones: Parameters<typeof montar>[0] = {}) {
  const m = montar(opciones)
  const vista = render(<EscanerQr {...m.props} />)
  await screen.findByText('Iniciando la cámara…')
  mostrarFrame(video())
  return { ...m, ...vista }
}

describe('leer el QR', () => {
  it('entrega el texto TAL CUAL: sin recortar, sin mayúsculas y sin extraer nada', async () => {
    const crudo = '  sum1|7|59698271|S4eYGtymJsriCiZYxmdpHA\n'
    const m = await abrirLista({ lecturas: [null, crudo] })

    await waitFor(() => expect(m.onDetectado).toHaveBeenCalledTimes(1))
    expect(m.onDetectado).toHaveBeenCalledWith(crudo)
  })

  it('un texto con un VIN dentro no se reduce al VIN (esa normalización es del escáner de VIN)', async () => {
    const crudo = 'SUM1|1|59733450|LSCABN3E2VE840638'
    const m = await abrirLista({ lecturas: [crudo] })
    await waitFor(() => expect(m.onDetectado).toHaveBeenCalledWith(crudo))
  })

  it('lee un solo código aunque la cámara siga viendo más', async () => {
    const m = await abrirLista({ lecturas: ['PRIMERO', 'SEGUNDO'] })
    await waitFor(() => expect(m.onDetectado).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 400))
    expect(m.onDetectado).toHaveBeenCalledTimes(1)
    expect(m.onDetectado).toHaveBeenCalledWith('PRIMERO')
  })

  it('no empieza a leer hasta que la cámara tiene imagen', async () => {
    const m = montar()
    render(<EscanerQr {...m.props} />)
    await screen.findByText('Iniciando la cámara…')
    expect(m.cargarDecodificador).not.toHaveBeenCalled()
    expect(m.decodificar).not.toHaveBeenCalled()
    mostrarFrame(video())
    await waitFor(() => expect(m.cargarDecodificador).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(m.decodificar).toHaveBeenCalled())
  })

  it('al desmontarse deja de revisar la cámara', async () => {
    const m = await abrirLista()
    await waitFor(() => expect(m.decodificar).toHaveBeenCalled())
    m.unmount()
    const lecturas = m.decodificar.mock.calls.length
    await new Promise((r) => setTimeout(r, 500))
    expect(m.decodificar.mock.calls.length).toBe(lecturas)
  })

  it('indica a qué apuntar y no tiene fallos de accesibilidad', async () => {
    const m = await abrirLista()
    expect(screen.getByText('Apunta al QR de la tablet')).toBeInTheDocument()
    expect(video()).toHaveAttribute('playsinline')
    expect(await axe(m.container)).toHaveNoViolations()
  })

  it('si el lector falla de verdad, lo dice y deja de leer', async () => {
    const m = await abrirLista({ lecturas: [new Error('roto')] })
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el código')
    expect(m.onDetectado).not.toHaveBeenCalled()
  })

  it('si no carga el lector, lo dice', async () => {
    const m = montar()
    render(<EscanerQr {...m.props} cargarDecodificador={() => Promise.reject(new Error('sin red'))} />)
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(video())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo preparar el lector de códigos')
  })
})

describe('la cámara', () => {
  it('al desmontarse queda apagada', async () => {
    const m = await abrirLista()
    await waitFor(() => expect(m.decodificar).toHaveBeenCalled())
    m.unmount()
    expect(m.streams[0]?.track.detenciones).toBe(1)
  })

  it('si se desmonta antes de que cargue el lector, cuando llega ya no se pone a leer', async () => {
    const m = montar({ lecturas: ['TARDE'] })
    let llegar: (d: DecodificadorCodigos) => void = () => undefined
    const vista = render(<EscanerQr {...m.props} cargarDecodificador={() => new Promise<DecodificadorCodigos>((r) => (llegar = r))} />)
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(video())
    await waitFor(() => expect(m.streams).toHaveLength(1))

    vista.unmount()
    await act(async () => llegar({ decodificar: m.decodificar }))
    await new Promise((r) => setTimeout(r, 400))

    expect(m.decodificar).not.toHaveBeenCalled()
    expect(m.onDetectado).not.toHaveBeenCalled()
  })

  it('con la cámara denegada explica qué hacer y ofrece reintentar', async () => {
    const m = montar({ abrirCamara: () => Promise.reject(errorDeDom('NotAllowedError')) })
    render(<EscanerQr {...m.props} />)
    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).not.toBe('')
    expect(screen.getByText('Cámara no disponible')).toBeInTheDocument()
    expect(m.onDetectado).not.toHaveBeenCalled()
  })

  it('un navegador sin cámara lo dice', async () => {
    const m = montar()
    render(<EscanerQr {...m.props} crearSesion={() => new CameraSession({ abrirCamara: m.abrirCamara, entorno: { ...ENTORNO_SEGURO, mediaDevices: undefined }, documento: new FakeDocument() })} />)
    expect(await screen.findByText('Cámara no disponible')).toBeInTheDocument()
  })
})
