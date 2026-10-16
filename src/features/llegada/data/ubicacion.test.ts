import { describe, expect, it, vi } from 'vitest'
import { crearUbicacionDelNavegador } from './ubicacion'

type Posicion = { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }

function geolocalizacionFalsa() {
  let alOk: (p: Posicion) => void = () => undefined
  let alError: (e: { code: number }) => void = () => undefined
  let opciones: PositionOptions | undefined
  const clearWatch = vi.fn()
  const watchPosition = vi.fn((ok: typeof alOk, error: typeof alError, op: PositionOptions) => {
    alOk = ok
    alError = error
    opciones = op
    return 42
  })
  return {
    geo: { watchPosition, clearWatch },
    clearWatch,
    posicion: (coords: Posicion['coords'], timestamp: number) => alOk({ coords, timestamp }),
    error: (code: number) => alError({ code }),
    opciones: () => opciones,
  }
}

describe('crearUbicacionDelNavegador', () => {
  it('pide alta precisión y nunca una posición en caché', () => {
    const g = geolocalizacionFalsa()
    crearUbicacionDelNavegador(g.geo).iniciar(vi.fn(), vi.fn())
    expect(g.opciones()).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 })
  })

  it('entrega cada lectura con su precisión y el instante en que se midió', () => {
    const g = geolocalizacionFalsa()
    const alFix = vi.fn()
    crearUbicacionDelNavegador(g.geo).iniciar(alFix, vi.fn())

    g.posicion({ latitude: -11.9, longitude: -77.1, accuracy: 12.5 }, 1_760_000_000_000)

    expect(alFix).toHaveBeenCalledWith({ latitud: -11.9, longitud: -77.1, precisionM: 12.5, momento: 1_760_000_000_000 })
  })

  it.each([
    [1, 'denegada'],
    [2, 'noDisponible'],
    [3, 'tiempo'],
  ])('el código de error %i es «%s»', (code, esperado) => {
    const g = geolocalizacionFalsa()
    const alError = vi.fn()
    crearUbicacionDelNavegador(g.geo).iniciar(vi.fn(), alError)
    g.error(code)
    expect(alError).toHaveBeenCalledWith(esperado)
  })

  it('dejar de escuchar cancela la vigilancia del GPS', () => {
    const g = geolocalizacionFalsa()
    const parar = crearUbicacionDelNavegador(g.geo).iniciar(vi.fn(), vi.fn())
    expect(g.clearWatch).not.toHaveBeenCalled()
    parar()
    expect(g.clearWatch).toHaveBeenCalledWith(42)
  })

  it('un navegador sin geolocalización avisa «no disponible» y no falla', () => {
    const alError = vi.fn()
    const parar = crearUbicacionDelNavegador(undefined).iniciar(vi.fn(), alError)
    expect(alError).toHaveBeenCalledWith('noDisponible')
    expect(() => parar()).not.toThrow()
  })
})
