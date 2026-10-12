/** O-05 · el escáner de VIN: abre la cámara, lee un código, entrega el VIN y suelta la cámara. */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { CameraSession } from '../camera/cameraSession'
import type { DecodificadorCodigos } from '../camera/escaneo'
import { ENTORNO_SEGURO, FakeDocument, FakeStream, USER_AGENT_IPHONE, errorDeDom } from '../camera/testing/fakes'
import { EscanerVin, type EscanerVinProps } from './EscanerVin'

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
const lienzoFalso = () =>
  ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }) }) as unknown as HTMLCanvasElement

function montar(opciones: { lecturas?: Array<string | null | Error>; abrirCamara?: () => Promise<MediaStream>; entorno?: object } = {}) {
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
  const cargarDecodificador = vi.fn(async () => decodificador)
  const onDetectado = vi.fn()
  const onCerrar = vi.fn()
  const props: EscanerVinProps = {
    onDetectado,
    onCerrar,
    cargarDecodificador,
    crearLienzo: lienzoFalso,
    crearSesion: () => new CameraSession({ abrirCamara, entorno: { ...ENTORNO_SEGURO, ...opciones.entorno }, documento }),
  }
  return { props, abrirCamara, streams, decodificar, cargarDecodificador, onDetectado, onCerrar }
}

const video = () => screen.getByLabelText('Vista de la cámara') as HTMLVideoElement

async function abrirLista(opciones: Parameters<typeof montar>[0] = {}) {
  const m = montar(opciones)
  const vista = render(<EscanerVin {...m.props} />)
  await screen.findByText('Iniciando la cámara…')
  mostrarFrame(video())
  return { ...m, ...vista }
}

describe('leer un código', () => {
  it('entrega el VIN extraído del texto leído y no lo hace dos veces', async () => {
    const m = await abrirLista({ lecturas: [null, 'https://sum.example/traslado/LSCABN3E2VE840638', 'OTRO'] })

    await waitFor(() => expect(m.onDetectado).toHaveBeenCalledTimes(1))
    expect(m.onDetectado).toHaveBeenCalledWith('LSCABN3E2VE840638')
    await new Promise((r) => setTimeout(r, 400))
    expect(m.onDetectado).toHaveBeenCalledTimes(1)
  })

  it('un texto que no es un VIN llega en mayúsculas y sin espacios (como la app móvil)', async () => {
    const m = await abrirLista({ lecturas: ['  abc 123  '] })
    await waitFor(() => expect(m.onDetectado).toHaveBeenCalledWith('ABC123'))
  })

  it('no empieza a leer hasta que la cámara tiene imagen, y entonces carga el lector', async () => {
    const m = montar()
    render(<EscanerVin {...m.props} />)
    await screen.findByText('Iniciando la cámara…')
    expect(m.cargarDecodificador).not.toHaveBeenCalled()
    expect(m.decodificar).not.toHaveBeenCalled()

    mostrarFrame(video())

    await waitFor(() => expect(m.cargarDecodificador).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(m.decodificar).toHaveBeenCalled())
  })

  it('si se cierra antes de que cargue el lector, cuando llega ya no se pone a leer', async () => {
    const m = montar({ lecturas: ['TARDE'] })
    let llegar: (d: DecodificadorCodigos) => void = () => undefined
    const props = { ...m.props, cargarDecodificador: () => new Promise<DecodificadorCodigos>((r) => (llegar = r)) }
    const vista = render(<EscanerVin {...props} />)
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(video())
    await waitFor(() => expect(m.streams).toHaveLength(1))

    vista.unmount()
    await act(async () => llegar({ decodificar: m.decodificar }))
    await new Promise((r) => setTimeout(r, 400))

    expect(m.decodificar).not.toHaveBeenCalled()
    expect(m.onDetectado).not.toHaveBeenCalled()
  })

  it('muestra la guía y la indicación para el operario', async () => {
    await abrirLista()
    expect(screen.getByRole('dialog', { name: 'Escanear VIN' })).toBeInTheDocument()
    expect(screen.getByText('Apunta al QR o código de barras del VIN')).toBeInTheDocument()
    expect(video()).toHaveAttribute('playsinline')
  })
})

describe('cerrar y soltar la cámara', () => {
  it('«Cerrar» avisa y, al desmontarse, la cámara queda apagada', async () => {
    const m = await abrirLista()
    await waitFor(() => expect(m.decodificar).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(m.onCerrar).toHaveBeenCalledTimes(1)

    m.unmount()
    expect(m.streams[0]?.track.detenciones).toBe(1)
  })

  it('Escape también cierra', async () => {
    const m = await abrirLista()
    await userEvent.keyboard('{Escape}')
    expect(m.onCerrar).toHaveBeenCalledTimes(1)
  })

  it('al desmontarse deja de leer: no se entrega un VIN tarde', async () => {
    const m = await abrirLista({ lecturas: [null, null, null, null, null, 'TARDE'] })
    await waitFor(() => expect(m.decodificar).toHaveBeenCalled())
    m.unmount()
    await new Promise((r) => setTimeout(r, 1_200))
    expect(m.onDetectado).not.toHaveBeenCalled()
  })

  it('el foco entra al diálogo (a «Cerrar») y vuelve a quien lo abrió', async () => {
    const abridor = document.createElement('button')
    document.body.append(abridor)
    abridor.focus()
    const m = montar()
    const vista = render(<EscanerVin {...m.props} />)
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()

    vista.unmount()

    expect(abridor).toHaveFocus()
    abridor.remove()
  })
})

describe('cuando algo falla', () => {
  it('con el permiso denegado explica qué hacer y deja reintentar; no lee nada', async () => {
    const m = montar({
      entorno: { userAgent: USER_AGENT_IPHONE, platform: 'iPhone', maxTouchPoints: 5 },
      abrirCamara: () => Promise.reject(errorDeDom('NotAllowedError')),
    })
    render(<EscanerVin {...m.props} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ajustes › Safari › Cámara')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(m.cargarDecodificador).not.toHaveBeenCalled()
  })

  it('sin contexto seguro dice lo del HTTPS y no ofrece reintentar', async () => {
    const m = montar({ entorno: { isSecureContext: false } })
    render(<EscanerVin {...m.props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('La cámara solo funciona con HTTPS')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('si el lector no se puede cargar (sin red) lo dice y no se queda colgado', async () => {
    const m = montar()
    const props = { ...m.props, cargarDecodificador: vi.fn(async (): Promise<DecodificadorCodigos> => Promise.reject(new Error('Failed to fetch dynamically imported module'))) }
    render(<EscanerVin {...props} />)
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(video())

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo preparar el lector de códigos')
  })

  it('si el lector se rompe a mitad lo avisa en vez de seguir sin leer', async () => {
    const m = await abrirLista({ lecturas: [new Error('se rompió')] })
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el código')
    expect(m.onDetectado).not.toHaveBeenCalled()
  })
})

describe('accesibilidad', () => {
  it('sin violaciones con la cámara lista', async () => {
    const m = await abrirLista()
    expect(await axe(m.container)).toHaveNoViolations()
  })
})
