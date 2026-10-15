import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { crearListaSeguimientoDePrueba, trasladoDePrueba } from '../data/testing/fakes'
import { mensajeDeFalloDeConsulta, useConsultaVines } from './useConsultaVines'

const VIN = 'LVTDD24B6VDX00231'

function montar() {
  const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ vin: VIN, etapa: 'en_camino' })])
  const hook = renderHook(() => useConsultaVines(m.lista))
  return { ...m, ...hook }
}

describe('useConsultaVines', () => {
  it('empieza sin resultado, sin error y sin consultar', () => {
    const { result } = montar()
    expect(result.current.estado).toEqual({ consultando: false, resultados: null, descartados: 0, error: null })
  })

  it('consulta, y deja el resultado en el orden recibido', async () => {
    const { result } = montar()
    await act(async () => {
      await result.current.consultar([VIN, 'LVTDD24B6VDX99999'])
    })
    expect(result.current.estado.consultando).toBe(false)
    expect(result.current.estado.resultados?.map((r) => [r.vin, r.informacion])).toEqual([
      [VIN, 'disponible'],
      ['LVTDD24B6VDX99999', 'pendiente'],
    ])
  })

  it('mientras espera está «consultando»', async () => {
    const m = montar()
    let abrir: () => void = () => undefined
    m.estado.puertaConsulta = new Promise<void>((r) => (abrir = r))

    let promesa!: Promise<void>
    act(() => {
      promesa = m.result.current.consultar([VIN])
    })
    expect(m.result.current.estado.consultando).toBe(true)

    abrir()
    await act(async () => {
      await promesa
    })
    expect(m.result.current.estado.consultando).toBe(false)
  })

  it('lo que llega después de «limpiar» se descarta: no resucita un resultado que ya se borró', async () => {
    const m = montar()
    let abrir: () => void = () => undefined
    m.estado.puertaConsulta = new Promise<void>((r) => (abrir = r))

    let promesa!: Promise<void>
    act(() => {
      promesa = m.result.current.consultar([VIN])
    })
    act(() => m.result.current.limpiar())
    abrir()
    await act(async () => {
      await promesa
    })

    expect(m.result.current.estado).toEqual({ consultando: false, resultados: null, descartados: 0, error: null })
  })

  it('con dos consultas seguidas manda la última: la respuesta tardía de la primera no pisa a la segunda', async () => {
    const m = montar()
    let abrirPrimera: () => void = () => undefined
    m.estado.puertaConsulta = new Promise<void>((r) => (abrirPrimera = r))
    let primera!: Promise<void>
    act(() => {
      primera = m.result.current.consultar([VIN])
    })

    m.estado.puertaConsulta = null // la segunda responde enseguida
    await act(async () => {
      await m.result.current.consultar(['LVTDD24B6VDX99999'])
    })
    expect(m.result.current.estado.resultados?.map((r) => r.vin)).toEqual(['LVTDD24B6VDX99999'])

    abrirPrimera()
    await act(async () => {
      await primera
    })
    expect(m.result.current.estado.resultados?.map((r) => r.vin)).toEqual(['LVTDD24B6VDX99999'])
  })

  it('un fallo se dice con qué hacer y NO borra el último resultado que sí llegó', async () => {
    const m = montar()
    await act(async () => {
      await m.result.current.consultar([VIN])
    })
    m.estado.falloConsulta = new ApiError('Sin conexión al backend o internet.')
    await act(async () => {
      await m.result.current.consultar([VIN])
    })

    expect(m.result.current.estado.error).toBe('Sin conexión. Revisa tu internet y vuelve a consultar.')
    expect(m.result.current.estado.resultados).toHaveLength(1)
    expect(m.result.current.estado.consultando).toBe(false)
  })

  it('una consulta que sale bien borra el error anterior', async () => {
    const m = montar()
    m.estado.falloConsulta = new ApiError('boom', { status: 500 })
    await act(async () => {
      await m.result.current.consultar([VIN])
    })
    expect(m.result.current.estado.error).toBe('boom')

    await act(async () => {
      await m.result.current.consultar([VIN])
    })
    expect(m.result.current.estado.error).toBeNull()
  })
})

describe('mensajeDeFalloDeConsulta', () => {
  it('403: falta de permiso, diciendo a quién acudir', () => {
    expect(mensajeDeFalloDeConsulta(new ApiError('x', { status: 403 }))).toBe('Tu usuario no tiene permiso para hacer consultas. Pide a SUM que lo revise.')
  })
  it('sin red: revisar el internet', () => {
    expect(mensajeDeFalloDeConsulta(new ApiError('Sin conexión al backend o internet.'))).toBe('Sin conexión. Revisa tu internet y vuelve a consultar.')
  })
  it('otro error del servidor: su mensaje', () => {
    expect(mensajeDeFalloDeConsulta(new ApiError('El servidor falló.', { status: 500 }))).toBe('El servidor falló.')
  })
  it('algo que no es un ApiError: un mensaje genérico que dice qué hacer', () => {
    expect(mensajeDeFalloDeConsulta(new Error('raro'))).toBe('No se pudo hacer la consulta. Vuelve a intentarlo.')
  })
})
