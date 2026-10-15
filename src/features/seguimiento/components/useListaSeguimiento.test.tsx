import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearListaSeguimientoDePrueba } from '../data/testing/fakes'
import { useListaSeguimiento } from './useListaSeguimiento'

function Arnes({ lista, idUsuario }: { lista: Parameters<typeof useListaSeguimiento>[0]; idUsuario: number | null }) {
  const instantanea = useListaSeguimiento(lista, idUsuario)
  return <p data-testid="n">{instantanea.traslados.length}</p>
}

function ponerVisibilidad(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  ponerVisibilidad('visible')
})
afterEach(() => {
  vi.useRealTimers()
  ponerVisibilidad('visible')
})

async function montar(idUsuario: number | null = 7) {
  const m = crearListaSeguimientoDePrueba()
  const vista = render(<Arnes lista={m.lista} idUsuario={idUsuario} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return { ...m, ...vista }
}

const pasar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

describe('cuándo pide la lista', () => {
  it('al abrirse pide una vez y muestra lo que llega', async () => {
    const m = await montar()
    expect(m.estado.llamadas).toBe(1)
    expect(m.getByTestId('n')).toHaveTextContent('7')
  })

  it('NO vuelve a pedir por su cuenta: pasa el tiempo (horas) y no hay una segunda petición', async () => {
    const m = await montar()
    await pasar(60_000)
    await pasar(60 * 60_000)
    await pasar(24 * 60 * 60_000)
    expect(m.estado.llamadas).toBe(1)
  })

  it('volver a ver la pestaña no pide nada', async () => {
    const m = await montar()
    ponerVisibilidad('hidden')
    await pasar(5 * 60_000)
    ponerVisibilidad('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(m.estado.llamadas).toBe(1)
  })

  it('volver la conexión no pide nada', async () => {
    const m = await montar()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(m.estado.llamadas).toBe(1)
  })

  it('solo se vuelve a pedir cuando el usuario lo pide («Actualizar»)', async () => {
    const m = await montar()
    await act(async () => {
      await m.lista.actualizar()
    })
    expect(m.estado.llamadas).toBe(2)
  })
})

describe('al cerrarse la pantalla', () => {
  it('al cerrarse no queda nada vivo que pida: ni tiempo ni eventos', async () => {
    const m = await montar()
    m.unmount()

    await pasar(3 * 60_000)
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await pasar(0)

    expect(m.estado.llamadas).toBe(1)
  })

  it('una respuesta que llega tarde se descarta', async () => {
    const m = crearListaSeguimientoDePrueba()
    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))
    const vista = render(<Arnes lista={m.lista} idUsuario={7} />)
    vista.unmount()

    abrir()
    await pasar(0)

    expect(m.lista.getSnapshot().traslados).toEqual([])
  })
})

describe('de quién son los datos', () => {
  it('si la sesión pasa a otra persona, se vacía lo de la anterior antes de mostrar lo nuevo', async () => {
    const m = await montar(7)
    expect(m.getByTestId('n')).toHaveTextContent('7')

    let abrir: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrir = r))
    m.rerender(<Arnes lista={m.lista} idUsuario={8} />)
    await pasar(0)

    expect(m.getByTestId('n')).toHaveTextContent('0') // nada de la persona 7 mientras llega lo de la 8
    abrir()
    await pasar(0)
    expect(m.getByTestId('n')).toHaveTextContent('7')
  })
})
