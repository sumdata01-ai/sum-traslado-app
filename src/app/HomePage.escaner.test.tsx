/** O-05 en la home: el botón «Escanear» llena el filtro de VIN sin consultar al servidor. */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { CameraSession } from '@/features/traslado/camera/cameraSession'
import type { DecodificadorCodigos } from '@/features/traslado/camera/escaneo'
import { ENTORNO_SEGURO, FakeDocument, FakeStream } from '@/features/traslado/camera/testing/fakes'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaConServidor, ordenRemota } from '@/features/traslado/data/testing/fakes'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }

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

async function montar(leido: string | null = 'LSCABN3E2VE840638') {
  const m = crearListaConServidor([ordenRemota(1, { vin: 'LSCABN3E2VE840638' }), ordenRemota(2, { vin: 'LSCABN3E2VE840999' })])
  const ident = crearIdentificadorDePrueba()
  const stream = new FakeStream()
  const decodificador: DecodificadorCodigos = { decodificar: () => leido }
  const vista = render(
    <HomePage
      sesion={sesion}
      lista={m.lista}
      catalogo={crearCatalogoDePrueba().catalogo}
      identificador={ident.identificador}
      escaner={{
        crearSesion: () => new CameraSession({ abrirCamara: async () => stream.como(), entorno: ENTORNO_SEGURO, documento: new FakeDocument() }),
        cargarDecodificador: async () => decodificador,
        crearLienzo: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }) }) as unknown as HTMLCanvasElement,
      }}
      onCerrarSesion={() => undefined}
    />,
  )
  await screen.findByText('LSCABN3E2VE840638')
  return { ...m, ...vista, ident, stream }
}

const filtro = () => screen.getByLabelText('Filtrar por VIN') as HTMLInputElement
const botonEscanear = () => screen.getByRole('button', { name: 'Escanear VIN con la cámara' })

async function abrirYMostrarImagen() {
  await userEvent.click(botonEscanear())
  await screen.findByText('Iniciando la cámara…')
  mostrarFrame(screen.getByLabelText('Vista de la cámara') as HTMLVideoElement)
}

describe('el botón «Escanear» junto al filtro', () => {
  it('está al lado del campo, con un nombre accesible claro', async () => {
    await montar()
    expect(botonEscanear()).toBeEnabled()
    expect(filtro()).toBeInTheDocument()
  })

  it('abre el escáner sin tocar el filtro ni consultar al servidor', async () => {
    const m = await montar(null)
    await userEvent.click(botonEscanear())
    expect(await screen.findByRole('dialog', { name: 'Escanear VIN' })).toBeInTheDocument()
    expect(filtro()).toHaveValue('')
    expect(m.ident.buscarVin).not.toHaveBeenCalled()
    expect(m.ident.identificarVin).not.toHaveBeenCalled()
  })
})

describe('AC1 · al leer un VIN, llena el filtro y no consulta al servidor', () => {
  it('escribe el VIN en el filtro, cierra el escáner y deja solo la orden que coincide', async () => {
    const m = await montar('LSCABN3E2VE840638')
    const peticiones = m.servidor.api.misOrdenes as unknown as { mock: { calls: unknown[] } }
    const antes = peticiones.mock.calls.length

    await abrirYMostrarImagen()

    await waitFor(() => expect(filtro()).toHaveValue('LSCABN3E2VE840638'))
    expect(screen.queryByRole('dialog', { name: 'Escanear VIN' })).not.toBeInTheDocument()
    expect(screen.getByText('LSCABN3E2VE840638')).toBeInTheDocument()
    expect(screen.queryByText('LSCABN3E2VE840999')).not.toBeInTheDocument()
    expect(m.ident.buscarVin).not.toHaveBeenCalled()
    expect(m.ident.identificarVin).not.toHaveBeenCalled()
    expect(peticiones.mock.calls.length).toBe(antes) // ni siquiera actualiza la lista
  })

  it('el QR con una dirección o rótulo deja solo el VIN en el filtro', async () => {
    await montar('https://sum.example/traslado/LSCABN3E2VE840638?x=1')
    await abrirYMostrarImagen()
    await waitFor(() => expect(filtro()).toHaveValue('LSCABN3E2VE840638'))
  })

  it('un VIN que el teléfono no tiene muestra la búsqueda en el sistema, sin lanzarla sola', async () => {
    const m = await montar('1HGCM82633A004352')
    await abrirYMostrarImagen()

    await waitFor(() => expect(filtro()).toHaveValue('1HGCM82633A004352'))
    expect((await screen.findAllByText(/Ningún traslado coincide/)).length).toBeGreaterThan(0)
    expect(m.ident.identificarVin).not.toHaveBeenCalled()
  })

  it('cuando ya había algo escrito en el filtro, lo reemplaza', async () => {
    await montar('LSCABN3E2VE840999')
    await userEvent.type(filtro(), 'lsca')
    await abrirYMostrarImagen()
    await waitFor(() => expect(filtro()).toHaveValue('LSCABN3E2VE840999'))
  })
})

describe('cerrar sin leer', () => {
  it('«Cerrar» deja el filtro como estaba y apaga la cámara', async () => {
    const m = await montar(null)
    await userEvent.type(filtro(), 'abc')
    await abrirYMostrarImagen()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByRole('dialog', { name: 'Escanear VIN' })).not.toBeInTheDocument()
    expect(filtro()).toHaveValue('abc')
    await waitFor(() => expect(m.stream.track.detenciones).toBe(1))
  })

  it('el foco vuelve al botón «Escanear»', async () => {
    await montar(null)
    botonEscanear().focus()
    await userEvent.click(botonEscanear())
    await screen.findByRole('dialog', { name: 'Escanear VIN' })

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(botonEscanear()).toHaveFocus()
  })
})

describe('accesibilidad', () => {
  it('sin violaciones con el botón en la home', async () => {
    const m = await montar()
    expect(await axe(m.container)).toHaveNoViolations()
  })
})
