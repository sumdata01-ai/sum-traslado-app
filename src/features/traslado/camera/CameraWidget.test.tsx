import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { CameraSession } from './cameraSession'
import { CameraWidget, type CameraWidgetProps } from './CameraWidget'
import { CapturaError, type ResultadoCaptura } from './captureFrame'
import type { EntornoNavegador } from './plataforma'
import { ENTORNO_SEGURO, FakeDocument, FakeStream, USER_AGENT_IPHONE, errorDeDom } from './testing/fakes'

// jsdom no tiene cámara ni reproduce video: se simulan `play`/`pause` y el primer frame del <video> real.
let jugar: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  jugar = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
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

const fotoBuena = (): ResultadoCaptura => ({
  ok: true,
  foto: { blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), ancho: 1280, alto: 720, creadaEn: 1_700_000_000_000 },
})

interface OpcionesMontaje {
  entorno?: Partial<EntornoNavegador>
  abrirCamara?: () => Promise<MediaStream>
  capturarFrame?: () => Promise<ResultadoCaptura>
  reloj?: () => number
}

function montar(opciones: OpcionesMontaje = {}) {
  const streams: FakeStream[] = []
  const abrirCamara = vi.fn(
    opciones.abrirCamara ??
      (async () => {
        const stream = new FakeStream()
        streams.push(stream)
        return stream.como()
      }),
  )
  const capturarFrame = vi.fn(opciones.capturarFrame ?? (async () => fotoBuena()))
  const revocarUrl = vi.fn()
  const documento = new FakeDocument()
  // Por defecto el reloj avanza 10 s en cada lectura: la protección de toque accidental nunca
  // estorba. Las pruebas de esa protección pasan su propio reloj.
  let ahora = 0
  const reloj = opciones.reloj ?? (() => (ahora += 10_000))
  const crearSesion = () =>
    new CameraSession({
      abrirCamara,
      entorno: { ...ENTORNO_SEGURO, ...opciones.entorno },
      documento,
      capturarFrame,
      crearUrl: () => 'blob:vista-previa',
      revocarUrl,
      reloj,
    })
  return { abrirCamara, capturarFrame, revocarUrl, documento, streams, crearSesion }
}

/** Monta el widget y lo lleva hasta tener la cámara lista para disparar. */
async function montarLista(opciones: OpcionesMontaje = {}, props: Partial<CameraWidgetProps> = {}) {
  const m = montar(opciones)
  const vista = render(<CameraWidget crearSesion={m.crearSesion} {...props} />)
  await screen.findByText('Iniciando la cámara…')
  mostrarFrame(video())
  await waitFor(() => expect(disparo()).toBeEnabled())
  return { ...m, ...vista }
}

const video = () => screen.getByLabelText('Vista de la cámara') as HTMLVideoElement
const disparo = () => screen.getByRole('button', { name: 'Tomar foto' })

describe('CameraWidget · estados', () => {
  it('sin contexto seguro: explica lo del HTTPS, no ofrece reintentar y el disparo está bloqueado', async () => {
    const m = montar({ entorno: { isSecureContext: false } })
    render(<CameraWidget crearSesion={m.crearSesion} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('La cámara solo funciona con HTTPS')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    expect(disparo()).toBeDisabled()
    expect(m.abrirCamara).not.toHaveBeenCalled()
  })

  it('permiso denegado: muestra las instrucciones y «Reintentar» vuelve a pedir la cámara', async () => {
    const m = montar({
      entorno: { userAgent: USER_AGENT_IPHONE, platform: 'iPhone', maxTouchPoints: 5 },
      abrirCamara: () => Promise.reject(errorDeDom('NotAllowedError')),
    })
    render(<CameraWidget crearSesion={m.crearSesion} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ajustes › Safari › Cámara')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(m.abrirCamara).toHaveBeenCalledTimes(2))
  })

  it('el disparo está bloqueado mientras la cámara inicia y se habilita con el primer frame', async () => {
    const m = montar()
    render(<CameraWidget crearSesion={m.crearSesion} />)

    expect(await screen.findByText('Iniciando la cámara…')).toBeInTheDocument()
    expect(disparo()).toBeDisabled()

    mostrarFrame(video())
    await waitFor(() => expect(disparo()).toBeEnabled())
    expect(screen.queryByText('Iniciando la cámara…')).not.toBeInTheDocument()
  })

  it('el <video> lleva playsinline, muted y autoplay (obligatorio en iOS)', async () => {
    const m = montar()
    render(<CameraWidget crearSesion={m.crearSesion} />)
    await screen.findByText('Iniciando la cámara…')

    expect(video().playsInline).toBe(true)
    expect(video().muted).toBe(true)
    expect(video().autoplay).toBe(true)
  })

  it('si el navegador rechaza play(): ofrece «Iniciar la cámara» y el toque la arranca sin pedir otra cámara', async () => {
    jugar.mockRejectedValueOnce(errorDeDom('NotAllowedError'))
    const m = montar()
    render(<CameraWidget crearSesion={m.crearSesion} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar la cámara' }))
    mostrarFrame(video())

    await waitFor(() => expect(disparo()).toBeEnabled())
    expect(m.abrirCamara).toHaveBeenCalledTimes(1)
  })

  it('al volver de segundo plano pide «Tocar para reactivar la cámara» si el navegador exige un gesto', async () => {
    let intento = 0
    const m = montar({
      abrirCamara: async () => {
        intento++
        if (intento === 2) throw errorDeDom('NotAllowedError')
        return new FakeStream().como()
      },
    })
    render(<CameraWidget crearSesion={m.crearSesion} />)
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(video())
    await waitFor(() => expect(disparo()).toBeEnabled())

    act(() => m.documento.cambiar('hidden'))
    expect(await screen.findByText('Cámara en pausa')).toBeInTheDocument()
    expect(disparo()).toBeDisabled()

    act(() => m.documento.cambiar('visible'))
    await userEvent.click(await screen.findByRole('button', { name: 'Tocar para reactivar la cámara' }))
    mostrarFrame(video())

    await waitFor(() => expect(disparo()).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Tocar para reactivar la cámara' })).not.toBeInTheDocument()
  })

  it('al desmontarse suelta la cámara', async () => {
    const m = montar()
    const { unmount } = render(<CameraWidget crearSesion={m.crearSesion} />)
    await screen.findByText('Iniciando la cámara…')

    unmount()

    expect(m.streams[0]?.track.detenciones).toBe(1)
  })

  it('en modo estricto (monta, desmonta y vuelve a montar) no deja ninguna cámara abierta de más', async () => {
    const m = montar()
    render(
      <StrictMode>
        <CameraWidget crearSesion={m.crearSesion} />
      </StrictMode>,
    )
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(video())
    await waitFor(() => expect(disparo()).toBeEnabled())

    const abiertas = m.streams.filter((s) => s.track.detenciones === 0)
    expect(abiertas).toHaveLength(1) // solo la cámara de la sesión viva
  })
})

describe('CameraWidget · T3 captura y vista previa', () => {
  it('AC1: al tocar «Tomar foto» se muestra la vista previa y se ofrece «Repetir»', async () => {
    const alCapturar = vi.fn()
    const m = await montarLista({}, { onCapturada: alCapturar })

    await userEvent.click(disparo())

    const foto = await screen.findByAltText('Foto tomada, pendiente de revisión')
    expect(foto).toHaveAttribute('src', 'blob:vista-previa')
    expect(screen.getByRole('button', { name: 'Repetir' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Tomar foto' })).not.toBeInTheDocument()
    expect(alCapturar).toHaveBeenCalledTimes(1)
    expect(alCapturar.mock.calls[0]?.[0]).toMatchObject({ ancho: 1280, alto: 720, creadaEn: 1_700_000_000_000 })
    expect(m.capturarFrame).toHaveBeenCalledTimes(1)
  })

  it('«Repetir» quita la vista previa, revoca su URL y vuelve a habilitar el disparo', async () => {
    const m = await montarLista()
    await userEvent.click(disparo())

    await userEvent.click(await screen.findByRole('button', { name: 'Repetir' }))

    expect(screen.queryByAltText('Foto tomada, pendiente de revisión')).not.toBeInTheDocument()
    expect(disparo()).toBeEnabled()
    expect(m.revocarUrl).toHaveBeenCalledWith('blob:vista-previa')
  })

  it('un toque accidental sobre «Repetir» justo después de la foto se ignora; pasado el plazo, funciona', async () => {
    let ahora = 1_000
    await montarLista({ reloj: () => ahora })
    await userEvent.click(disparo())
    const repetir = await screen.findByRole('button', { name: 'Repetir' })

    await userEvent.click(repetir) // segundo toque, a los 0 ms
    expect(screen.getByAltText('Foto tomada, pendiente de revisión')).toBeInTheDocument()

    ahora += 600
    await userEvent.click(repetir)
    await waitFor(() => expect(screen.queryByAltText('Foto tomada, pendiente de revisión')).not.toBeInTheDocument())
    expect(disparo()).toBeEnabled()
  })

  it('AC2: si la foto sale vacía, avisa «Vuelve a tomarla» y el disparo sigue disponible', async () => {
    const alCapturar = vi.fn()
    await montarLista({ capturarFrame: async () => ({ ok: false, error: new CapturaError('BLOB_VACIO') }) }, { onCapturada: alCapturar })

    await userEvent.click(disparo())

    expect(await screen.findByRole('alert')).toHaveTextContent('Vuelve a tomarla')
    expect(screen.queryByAltText('Foto tomada, pendiente de revisión')).not.toBeInTheDocument()
    expect(disparo()).toBeEnabled()
    expect(alCapturar).not.toHaveBeenCalled()
  })

  it('el aviso de error desaparece al volver a disparar con éxito', async () => {
    const capturarFrame = vi
      .fn<() => Promise<ResultadoCaptura>>()
      .mockResolvedValueOnce({ ok: false, error: new CapturaError('MEMORIA_AGOTADA') })
      .mockResolvedValue(fotoBuena())
    await montarLista({ capturarFrame })

    await userEvent.click(disparo())
    expect(await screen.findByRole('alert')).toHaveTextContent('memoria')
    await userEvent.click(disparo())

    await screen.findByAltText('Foto tomada, pendiente de revisión')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC3: un doble toque procesa una sola captura', async () => {
    const m = await montarLista()

    await userEvent.dblClick(disparo())

    await screen.findByAltText('Foto tomada, pendiente de revisión')
    expect(m.capturarFrame).toHaveBeenCalledTimes(1)
  })

  it('al desmontarse con una foto en revisión, revoca su URL', async () => {
    const m = await montarLista()
    await userEvent.click(disparo())
    await screen.findByAltText('Foto tomada, pendiente de revisión')

    m.unmount()

    expect(m.revocarUrl).toHaveBeenCalledWith('blob:vista-previa')
  })
})

describe('CameraWidget · T5 «Usar», guía y disparo', () => {
  it('AC3: «Usar» entrega la foto, la quita de la revisión y vuelve a habilitar el disparo', async () => {
    const onUsar = vi.fn().mockResolvedValue(undefined)
    await montarLista({}, { onUsar })
    await userEvent.click(disparo())

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    await waitFor(() => expect(disparo()).toBeEnabled())
    expect(onUsar).toHaveBeenCalledTimes(1)
    expect(onUsar.mock.calls[0]?.[0]).toMatchObject({ urlVistaPrevia: 'blob:vista-previa', ancho: 1280 })
    expect(screen.queryByAltText('Foto tomada, pendiente de revisión')).not.toBeInTheDocument()
  })

  it('sin onUsar solo se ofrece «Repetir»', async () => {
    await montarLista()
    await userEvent.click(disparo())
    await screen.findByRole('button', { name: 'Repetir' })
    expect(screen.queryByRole('button', { name: 'Usar' })).not.toBeInTheDocument()
  })

  it('si no se pudo guardar, avisa, deja la foto en revisión y permite reintentar', async () => {
    const onUsar = vi.fn().mockRejectedValueOnce(new Error('disco lleno')).mockResolvedValue(undefined)
    await montarLista({}, { onUsar })
    await userEvent.click(disparo())

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la foto')
    expect(screen.getByAltText('Foto tomada, pendiente de revisión')).toBeInTheDocument() // no se perdió
    expect(screen.getByRole('button', { name: 'Usar' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Usar' }))
    await waitFor(() => expect(disparo()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onUsar).toHaveBeenCalledTimes(2)
  })

  it('AC3 de T4a: si el error trae su propio mensaje (por ejemplo sin espacio), se muestra ese y no el genérico', async () => {
    const sinEspacio = Object.assign(new Error('cuota'), {
      mensajeParaElOperario: 'Espacio insuficiente en el dispositivo. Libera espacio y vuelve a intentar.',
    })
    await montarLista({}, { onUsar: vi.fn().mockRejectedValue(sinEspacio) })
    await userEvent.click(disparo())

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Espacio insuficiente en el dispositivo')
    expect(screen.queryByText(/No se pudo guardar la foto\. Vuelve a intentar o repítela\./)).not.toBeInTheDocument()
  })

  it('un mensaje vacío o que no es texto cae al genérico', async () => {
    await montarLista({}, { onUsar: vi.fn().mockRejectedValue({ mensajeParaElOperario: 42 }) })
    await userEvent.click(disparo())

    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la foto')
  })

  it('un doble toque en «Usar» guarda una sola vez, y mientras guarda no deja repetir', async () => {
    let terminar: () => void = () => undefined
    const onUsar = vi.fn(() => new Promise<void>((resolver) => (terminar = resolver)))
    await montarLista({}, { onUsar })
    await userEvent.click(disparo())
    const usar = await screen.findByRole('button', { name: 'Usar' })

    await userEvent.dblClick(usar)

    expect(onUsar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Repetir' })).toBeDisabled()

    terminar()
    await waitFor(() => expect(disparo()).toBeEnabled())
  })

  it('un toque accidental en «Usar» justo después de la foto se ignora; pasado el plazo, funciona', async () => {
    let ahora = 1_000
    const onUsar = vi.fn().mockResolvedValue(undefined)
    await montarLista({ reloj: () => ahora }, { onUsar })
    await userEvent.click(disparo())
    const usar = await screen.findByRole('button', { name: 'Usar' })

    await userEvent.click(usar)
    expect(onUsar).not.toHaveBeenCalled()

    ahora += 600
    await userEvent.click(usar)
    await waitFor(() => expect(onUsar).toHaveBeenCalledTimes(1))
  })

  it('si la cámara se pausa mientras se guarda, no muestra un error falso ni se rompe', async () => {
    let terminar: () => void = () => undefined
    const onUsar = vi.fn(() => new Promise<void>((resolver) => (terminar = resolver)))
    const m = await montarLista({}, { onUsar })
    await userEvent.click(disparo())
    await userEvent.click(await screen.findByRole('button', { name: 'Usar' }))
    // No debe intentar cerrar una revisión que ya no existe: eso sería una transición inválida.
    const cerrarRevision = vi.spyOn(CameraSession.prototype, 'cerrarRevision')

    act(() => m.documento.cambiar('hidden')) // el operario cambia de app a mitad del guardado
    expect(await screen.findByText('Cámara en pausa')).toBeInTheDocument()
    await act(async () => terminar()) // el guardado termina igual

    expect(cerrarRevision).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Cámara en pausa')).toBeInTheDocument()
  })

  it('AC5: la guía con el nombre de la zona se ve solo cuando la cámara está lista', async () => {
    const m = montar()
    render(<CameraWidget crearSesion={m.crearSesion} guia={{ etiqueta: 'Lateral izquierdo' }} />)

    await screen.findByText('Iniciando la cámara…')
    expect(screen.queryByText('Lateral izquierdo')).not.toBeInTheDocument()

    mostrarFrame(video())
    expect(await screen.findByText('Lateral izquierdo')).toBeInTheDocument()

    await userEvent.click(disparo())
    await screen.findByAltText('Foto tomada, pendiente de revisión')
    expect(screen.queryByText('Lateral izquierdo')).not.toBeInTheDocument()
  })

  it('con disparoDeshabilitado, el botón sigue bloqueado aunque la cámara esté lista', async () => {
    const m = montar()
    render(<CameraWidget crearSesion={m.crearSesion} disparoDeshabilitado guia={{ etiqueta: 'Frontal' }} />)
    await screen.findByText('Iniciando la cámara…')

    mostrarFrame(video())

    // La cámara llegó a «lista» (aparece la guía) y aun así el disparo sigue bloqueado.
    expect(await screen.findByText('Frontal')).toBeInTheDocument()
    expect(disparo()).toBeDisabled()
  })

  it('una sesión recibida por props es la que se usa', async () => {
    const m = montar()
    const sesion = m.crearSesion()
    render(<CameraWidget sesion={sesion} />)
    await screen.findByText('Iniciando la cámara…')
    expect(sesion.getSnapshot().estado).toBe('iniciando')
    expect(m.abrirCamara).toHaveBeenCalledTimes(1)
  })
})

describe('CameraWidget · accesibilidad', () => {
  it('sin violaciones en sinSoporte, error, lista y revisando', async () => {
    const sinSoporte = montar({ entorno: { isSecureContext: false } })
    const a = render(<CameraWidget crearSesion={sinSoporte.crearSesion} />)
    await screen.findByRole('alert')
    expect(await axe(a.container)).toHaveNoViolations()
    a.unmount()

    const conError = montar({ abrirCamara: () => Promise.reject(errorDeDom('NotAllowedError')) })
    const b = render(<CameraWidget crearSesion={conError.crearSesion} />)
    await screen.findByRole('alert')
    expect(await axe(b.container)).toHaveNoViolations()
    b.unmount()

    const lista = await montarLista({}, { onUsar: async () => undefined, guia: { etiqueta: 'Frontal' } })
    expect(await axe(lista.container)).toHaveNoViolations()

    await userEvent.click(disparo())
    await screen.findByAltText('Foto tomada, pendiente de revisión')
    expect(await axe(lista.container)).toHaveNoViolations()
  })
})
