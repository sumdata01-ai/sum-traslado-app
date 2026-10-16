import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RUTA_TABLERO, navegar, normalizarRuta, rutaActual, useRuta } from './ruta'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => window.history.replaceState(null, '', '/'))

describe('normalizarRuta', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/dashboard', '/dashboard'],
    ['/dashboard/', '/dashboard'],
    ['/dashboard//', '/dashboard'],
    ['/Dashboard', '/dashboard'],
    ['/dashboard?dia=2026-10-15', '/dashboard'],
    ['/dashboard#detalle', '/dashboard'],
    ['/?x=1', '/'],
    ['/otra/ruta/', '/otra/ruta'],
  ])('«%s» → «%s»', (entrada, esperada) => {
    expect(normalizarRuta(entrada)).toBe(esperada)
  })

  it('la ruta del tablero no es del backend (`/api` y `/mobile`)', () => {
    expect(RUTA_TABLERO).toBe('/dashboard')
    expect(RUTA_TABLERO.startsWith('/api')).toBe(false)
    expect(RUTA_TABLERO.startsWith('/mobile')).toBe(false)
  })
})

describe('navegar', () => {
  it('cambia la dirección sin recargar y deja una entrada en el historial', () => {
    const antes = window.history.length
    navegar('/dashboard')
    expect(rutaActual()).toBe('/dashboard')
    expect(window.location.pathname).toBe('/dashboard')
    expect(window.history.length).toBe(antes + 1)
  })

  it('«reemplazar» corrige la dirección sin dejar una entrada nueva', () => {
    const antes = window.history.length
    navegar('/dashboard', { reemplazar: true })
    expect(rutaActual()).toBe('/dashboard')
    expect(window.history.length).toBe(antes)
  })

  it('ir adonde ya se está no hace nada (ni historial ni aviso)', () => {
    navegar('/dashboard')
    const antes = window.history.length
    let avisos = 0
    const escucha = () => avisos++
    window.addEventListener('ruta:cambio', escucha)
    navegar('/dashboard/')
    window.removeEventListener('ruta:cambio', escucha)
    expect(window.history.length).toBe(antes)
    expect(avisos).toBe(0)
  })

  it('una ruta con barra final cuenta como la misma', () => {
    navegar('/dashboard/')
    expect(rutaActual()).toBe('/dashboard')
  })
})

describe('useRuta', () => {
  it('lee la ruta de la dirección y se actualiza al navegar', () => {
    window.history.replaceState(null, '', '/dashboard/')
    const { result } = renderHook(() => useRuta())
    expect(result.current.ruta).toBe('/dashboard')
    act(() => result.current.navegar('/'))
    expect(result.current.ruta).toBe('/')
  })

  it('se actualiza con el botón «atrás» del navegador', () => {
    const { result } = renderHook(() => useRuta())
    act(() => result.current.navegar('/dashboard'))
    expect(result.current.ruta).toBe('/dashboard')
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.ruta).toBe('/')
  })

  it('dos componentes ven la misma ruta', async () => {
    function Ruta({ nombre }: { nombre: string }) {
      const { ruta, navegar: ir } = useRuta()
      return (
        <button type="button" onClick={() => ir(RUTA_TABLERO)}>
          {nombre}: {ruta}
        </button>
      )
    }
    render(
      <>
        <Ruta nombre="uno" />
        <Ruta nombre="dos" />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: /uno/ }))
    expect(screen.getByRole('button', { name: 'uno: /dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'dos: /dashboard' })).toBeInTheDocument()
  })

  it('al desmontarse deja de escuchar (no quedan oyentes colgados)', () => {
    const quitados: string[] = []
    const original = window.removeEventListener.bind(window)
    window.removeEventListener = ((tipo: string, ...resto: unknown[]) => {
      quitados.push(tipo)
      return (original as (...a: unknown[]) => void)(tipo, ...resto)
    }) as typeof window.removeEventListener
    try {
      const { unmount } = renderHook(() => useRuta())
      unmount()
    } finally {
      window.removeEventListener = original
    }
    expect(quitados).toEqual(expect.arrayContaining(['popstate', 'ruta:cambio']))
  })
})
