/** «Marcar llegada»: la pantalla del conductor, con la cámara, el GPS y el servidor simulados. */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { type ResultadoLlegada } from '@/features/llegada/domain'
import { LlegadaApiFalsa, QR_DE_PRUEBA, UbicacionFalsa, AHORA_DE_PRUEBA, fixDePrueba, llegadaConfirmada } from '@/features/llegada/data/testing/fakes'
import { CameraSession } from '@/features/traslado/camera/cameraSession'
import type { DecodificadorCodigos } from '@/features/traslado/camera/escaneo'
import { ENTORNO_SEGURO, FakeDocument, FakeStream, errorDeDom } from '@/features/traslado/camera/testing/fakes'
import { LlegadaPage } from './LlegadaPage'

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

const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }) }) as unknown as HTMLCanvasElement

function montar(opciones: { qr?: string | null; abrirCamara?: () => Promise<MediaStream>; fix?: boolean } = {}) {
  const api = new LlegadaApiFalsa()
  const ubicacion = new UbicacionFalsa()
  const streams: FakeStream[] = []
  const sesiones = vi.fn()
  let leido: string | null = opciones.qr === undefined ? QR_DE_PRUEBA : opciones.qr
  const decodificador: DecodificadorCodigos = { decodificar: () => leido }
  const onVolver = vi.fn()
  const vista = render(
    <LlegadaPage
      llegada={{ api, ubicacion, opciones: { ahora: () => AHORA_DE_PRUEBA, topeEsperaMs: 30_000 } }}
      escaner={{
        crearSesion: () => {
          sesiones()
          return new CameraSession({
            abrirCamara:
              opciones.abrirCamara ??
              (async () => {
                const s = new FakeStream()
                streams.push(s)
                return s.como()
              }),
            entorno: ENTORNO_SEGURO,
            documento: new FakeDocument(),
          })
        },
        cargarDecodificador: async () => decodificador,
        crearLienzo: lienzoFalso,
      }}
      onVolver={onVolver}
    />,
  )
  return { api, ubicacion, streams, sesiones, onVolver, ...vista, leer: (texto: string | null) => (leido = texto) }
}

type Montaje = ReturnType<typeof montar>

const permitir = () => userEvent.click(screen.getByRole('button', { name: 'Permitir cámara y ubicación' }))

/** Pasa de la explicación al visor con imagen y un fix reciente, listo para leer. */
async function aEscanear(m: Montaje) {
  await permitir()
  await screen.findByText('Iniciando la cámara…')
  m.ubicacion.emitir(fixDePrueba())
  mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)
}

/** Recorre el camino completo hasta que el servidor contesta `resultado`. */
async function hastaResultado(m: Montaje, resultado: ResultadoLlegada) {
  m.api.responder(resultado)
  await aEscanear(m)
  await waitFor(() => expect(m.api.llamadas).toHaveLength(1))
}

const titulo = () => screen.getByRole('heading', { level: 2 })

describe('la explicación', () => {
  it('dice para qué son la cámara y la ubicación, y todavía no pide nada', () => {
    const m = montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Marcar llegada' })).toBeInTheDocument()
    expect(titulo()).toHaveTextContent('Necesitamos la cámara y tu ubicación')
    expect(screen.getByText(/La cámara lee el QR de la tablet/)).toBeInTheDocument()
    expect(m.sesiones).not.toHaveBeenCalled()
    expect(m.ubicacion.inicios).toBe(0)
  })

  it('«Permitir» abre la cámara y empieza a buscar la ubicación', async () => {
    const m = montar()
    await permitir()
    expect(await screen.findByLabelText('Vista de la cámara')).toBeInTheDocument()
    expect(screen.getByText('Apunta al QR de la tablet')).toBeInTheDocument()
    expect(m.ubicacion.inicios).toBe(1)
  })

  it('«Volver» sale sin pedir nada', async () => {
    const m = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(m.onVolver).toHaveBeenCalledTimes(1)
    expect(m.ubicacion.inicios).toBe(0)
  })

  it('no tiene fallos de accesibilidad', async () => {
    const m = montar()
    expect(await axe(m.container)).toHaveNoViolations()
  })
})

describe('el camino feliz', () => {
  it('lee el QR, manda el texto tal cual con la ubicación y muestra el punto, el turno y la hora de Lima', async () => {
    const crudo = ' sum1|1|59733450|zQG61jRaGQCSUy_8-vyeVQ\n'
    const m = montar({ qr: crudo })
    m.api.responder(llegadaConfirmada({ turno: 3, punto: 'Patio de llegada' }))

    await aEscanear(m)

    expect(await screen.findByText('Patio de llegada')).toBeInTheDocument()
    expect(m.api.llamadas).toEqual([{ payload: crudo, latitud: -11.902172, longitud: -77.122394, precisionM: 10 }])
    expect(screen.getByRole('heading', { level: 1, name: 'Llegada registrada' })).toBeInTheDocument()
    expect(screen.getByText('Tu turno').nextSibling).toHaveTextContent('3')
    // La llegada fue un minuto antes de «ahora» (14:35 en Lima) y el mismo día.
    expect(screen.getByText('Hora de llegada').nextSibling).toHaveTextContent('Hoy 14:34')
    expect(screen.getByText('Hora de Lima')).toBeInTheDocument()
  })

  it('no muestra los flags aunque el servidor los mande', async () => {
    const m = montar()
    m.api.responder(llegadaConfirmada())
    await aEscanear(m)
    await screen.findByText('Patio de llegada')
    expect(document.body.textContent).not.toMatch(/OUT_OF_WINDOW|flag/i)
  })

  it('«Listo» vuelve a la home', async () => {
    const m = montar()
    await aEscanear(m)
    await userEvent.click(await screen.findByRole('button', { name: 'Listo' }))
    expect(m.onVolver).toHaveBeenCalledTimes(1)
  })

  it('al confirmar la cámara queda apagada y el GPS suelto', async () => {
    const m = montar()
    await aEscanear(m)
    await screen.findByText('Patio de llegada')
    expect(m.streams[0]?.track.detenciones).toBe(1)
    expect(m.ubicacion.escuchando).toBe(false)
  })

  it('la confirmación no tiene fallos de accesibilidad', async () => {
    const m = montar()
    await aEscanear(m)
    await screen.findByText('Patio de llegada')
    expect(await axe(m.container)).toHaveNoViolations()
  })

  it('el foco pasa al título de cada pantalla nueva', async () => {
    const m = montar()
    await aEscanear(m)
    await screen.findByText('Patio de llegada')
    expect(titulo()).toHaveFocus()
  })
})

describe('esperas', () => {
  it('sin ubicación todavía muestra «Buscando tu ubicación…» y no manda nada', async () => {
    const m = montar()
    await permitir()
    await screen.findByText('Iniciando la cámara…')
    mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)

    expect(await screen.findByText('Buscando tu ubicación…')).toBeInTheDocument()
    expect(screen.getByText('No cierres la pantalla.')).toBeInTheDocument()
    expect(m.api.llamadas).toHaveLength(0)

    m.ubicacion.emitir(fixDePrueba())
    expect(await screen.findByText('Patio de llegada')).toBeInTheDocument()
  })

  it('mientras envía muestra «Registrando tu llegada…»', async () => {
    const m = montar()
    let contestar: (r: ResultadoLlegada) => void = () => undefined
    m.api.responder(new Promise<ResultadoLlegada>((r) => (contestar = r)))
    await aEscanear(m)

    expect(await screen.findByText('Registrando tu llegada…')).toBeInTheDocument()
    expect(m.api.llamadas).toHaveLength(1)
    await act(async () => contestar(llegadaConfirmada()))
    expect(await screen.findByText('Patio de llegada')).toBeInTheDocument()
  })

  it('con precisión insuficiente dice cuánta hay y cuánta se necesita, y reenvía solo al mejorar', async () => {
    const m = montar()
    m.api.responder({ tipo: 'precisionInsuficiente', precisionMaxM: 50 }, llegadaConfirmada())
    await permitir()
    await screen.findByText('Iniciando la cámara…')
    m.ubicacion.emitir(fixDePrueba({ precisionM: 80 }))
    mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)

    expect(await screen.findByText('Esperando una mejor señal de GPS…')).toBeInTheDocument()
    expect(screen.getByText('Precisión actual').nextSibling).toHaveTextContent('80 m')
    expect(screen.getByText('Se necesita').nextSibling).toHaveTextContent('50 m o menos')

    m.ubicacion.emitir(fixDePrueba({ precisionM: 30, momento: AHORA_DE_PRUEBA + 1000 }))
    expect(await screen.findByText('Patio de llegada')).toBeInTheDocument()
    expect(m.api.llamadas).toHaveLength(2)
  })
})

describe('los rechazos y fallos, con su texto y su botón', () => {
  it('código no válido: dice qué hacer y «Escanear de nuevo» reabre la cámara', async () => {
    const m = montar()
    await hastaResultado(m, { tipo: 'codigoInvalido' })

    expect(await screen.findByText('El código no es válido.')).toBeInTheDocument()
    expect(screen.getByText('Escanea de nuevo el QR que muestra la tablet.')).toBeInTheDocument()
    expect(m.streams[0]?.track.detenciones).toBe(1) // la cámara se soltó al leer

    await userEvent.click(screen.getByRole('button', { name: 'Escanear de nuevo' }))
    expect(await screen.findByLabelText('Vista de la cámara')).toBeInTheDocument()
    expect(m.sesiones).toHaveBeenCalledTimes(2) // una sesión de cámara nueva
  })

  it('fuera de zona: «Reintentar con mi posición» y «Escanear de nuevo»', async () => {
    const m = montar()
    await hastaResultado(m, { tipo: 'fueraDeZona' })

    expect(await screen.findByText('Aún no estás en la zona de llegada.')).toBeInTheDocument()
    expect(screen.getByText('Acércate al punto y vuelve a intentarlo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escanear de nuevo' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar con mi posición' }))
    expect(await screen.findByText('Buscando tu ubicación…')).toBeInTheDocument()
    m.ubicacion.emitir(fixDePrueba({ latitud: -11.9021, momento: AHORA_DE_PRUEBA + 500 }))
    expect(await screen.findByText('Patio de llegada')).toBeInTheDocument()
    expect(m.api.llamadas[1]).toMatchObject({ payload: QR_DE_PRUEBA, latitud: -11.9021 })
  })

  it('403: no tiene permiso, sin botón de reintento y con «Volver»', async () => {
    const m = montar()
    await hastaResultado(m, { tipo: 'sinPermiso' })

    expect(await screen.findByText('No tienes permiso para marcar llegada.')).toBeInTheDocument()
    expect(screen.getByText('Si crees que es un error, avisa a tu supervisor.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reintentar|Escanear de nuevo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
  })

  it('sin conexión: dice que hace falta internet y «Reintentar» manda el mismo QR', async () => {
    const m = montar()
    await hastaResultado(m, { tipo: 'sinRed' })

    expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
    expect(screen.getByText(/hace falta internet/)).toBeInTheDocument()
    m.ubicacion.emitir(fixDePrueba({ momento: AHORA_DE_PRUEBA + 500 }))
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Patio de llegada')).toBeInTheDocument()
    expect(m.api.llamadas.map((l) => l.payload)).toEqual([QR_DE_PRUEBA, QR_DE_PRUEBA])
  })

  it('error del servidor: «No se pudo registrar la llegada» con reintento', async () => {
    const m = montar()
    await hastaResultado(m, { tipo: 'error', status: 500 })
    expect(await screen.findByText('No se pudo registrar la llegada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('sesión vencida: lo dice', async () => {
    const m = montar()
    await hastaResultado(m, { tipo: 'sesionVencida' })
    expect(await screen.findByText('Tu sesión venció')).toBeInTheDocument()
  })

  it('ubicación no disponible (422 dos veces): «Recalcular posición»', async () => {
    const m = montar()
    m.api.responder({ tipo: 'ubicacionNoLeida' }, { tipo: 'ubicacionNoLeida' })
    await aEscanear(m)
    await waitFor(() => expect(m.api.llamadas).toHaveLength(1))
    m.ubicacion.emitir(fixDePrueba({ momento: AHORA_DE_PRUEBA + 500 }))

    expect(await screen.findByText('No se pudo leer tu ubicación.')).toBeInTheDocument()
    expect(screen.getByText('Revisa que el GPS esté activo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recalcular posición' })).toBeInTheDocument()

    // «Recalcular posición» espera una ubicación nueva con el mismo QR; no vuelve a la cámara.
    await userEvent.click(screen.getByRole('button', { name: 'Recalcular posición' }))
    expect(await screen.findByText('Buscando tu ubicación…')).toBeInTheDocument()
    m.ubicacion.emitir(fixDePrueba({ momento: AHORA_DE_PRUEBA + 1000 }))
    expect(await screen.findByText('Patio de llegada')).toBeInTheDocument()
    expect(m.api.llamadas.map((l) => l.payload)).toEqual([QR_DE_PRUEBA, QR_DE_PRUEBA, QR_DE_PRUEBA])
  })

  it.each<[string, ResultadoLlegada]>([
    ['código no válido', { tipo: 'codigoInvalido' }],
    ['fuera de zona', { tipo: 'fueraDeZona' }],
    ['sin permiso', { tipo: 'sinPermiso' }],
    ['sin conexión', { tipo: 'sinRed' }],
    ['error', { tipo: 'error', status: 500 }],
  ])('la pantalla de «%s» no tiene fallos de accesibilidad', async (_caso, resultado) => {
    const m = montar()
    await hastaResultado(m, resultado)
    await waitFor(() => expect(titulo()).toBeInTheDocument())
    expect(await axe(m.container)).toHaveNoViolations()
  })
})

describe('sin permiso de ubicación', () => {
  it('explica cómo permitirla y «Reintentar» vuelve a pedirla', async () => {
    const m = montar()
    await permitir()
    await screen.findByText('Iniciando la cámara…')
    act(() => m.ubicacion.fallar('denegada'))

    expect(await screen.findByText('Sin permiso de ubicación')).toBeInTheDocument()
    expect(screen.getByText(/ajustes del navegador/)).toBeInTheDocument()
    expect(m.ubicacion.escuchando).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('Vista de la cámara')).toBeInTheDocument()
    expect(m.ubicacion.inicios).toBe(2)
  })

  it('la pantalla no tiene fallos de accesibilidad', async () => {
    const m = montar()
    await permitir()
    act(() => m.ubicacion.fallar('denegada'))
    await screen.findByText('Sin permiso de ubicación')
    expect(await axe(m.container)).toHaveNoViolations()
  })
})

describe('sin permiso de cámara', () => {
  it('el visor lo explica y no lee nada; el GPS sigue buscando', async () => {
    const m = montar({ abrirCamara: () => Promise.reject(errorDeDom('NotAllowedError')) })
    await permitir()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(m.api.llamadas).toHaveLength(0)
  })
})

describe('salir', () => {
  it('«Volver» a mitad del escaneo suelta la cámara y el GPS', async () => {
    const m = montar({ qr: null })
    await aEscanear(m)
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(m.onVolver).toHaveBeenCalledTimes(1)

    m.unmount() // la home deja de dibujarla
    expect(m.streams[0]?.track.detenciones).toBe(1)
    expect(m.ubicacion.escuchando).toBe(false)
  })

  it('no manda nada si el conductor sale antes de leer el QR', async () => {
    const m = montar({ qr: null })
    await aEscanear(m)
    m.unmount()
    expect(m.api.llamadas).toHaveLength(0)
  })
})
