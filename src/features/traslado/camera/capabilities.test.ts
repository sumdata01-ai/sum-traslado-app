// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { detectarSoporte } from './capabilities'
import { ENTORNO_SEGURO } from './testing/fakes'

describe('detectarSoporte', () => {
  it('con contexto seguro y getUserMedia, se puede intentar', () => {
    expect(detectarSoporte(ENTORNO_SEGURO)).toEqual({ ok: true })
  })

  it('sin contexto seguro (HTTP en la red) no se puede, y el error no es reintentable', () => {
    const soporte = detectarSoporte({ ...ENTORNO_SEGURO, isSecureContext: false })
    expect(soporte.ok).toBe(false)
    if (soporte.ok) return
    expect(soporte.error.codigo).toBe('CONTEXTO_INSEGURO')
    expect(soporte.error.message).toContain('HTTPS')
    expect(soporte.error.reintentable).toBe(false)
  })

  it.each([
    ['sin mediaDevices', undefined],
    ['mediaDevices sin getUserMedia', {}],
    ['getUserMedia que no es una función', { getUserMedia: 'no' }],
  ])('%s: el navegador no sirve', (_nombre, mediaDevices) => {
    const soporte = detectarSoporte({ ...ENTORNO_SEGURO, mediaDevices })
    expect(soporte.ok).toBe(false)
    if (soporte.ok) return
    expect(soporte.error.codigo).toBe('SIN_SOPORTE')
    expect(soporte.error.reintentable).toBe(false)
  })

  it('el contexto inseguro pesa más que la falta de API: es lo que hay que decirle al operario', () => {
    const soporte = detectarSoporte({ ...ENTORNO_SEGURO, isSecureContext: false, mediaDevices: undefined })
    expect(!soporte.ok && soporte.error.codigo).toBe('CONTEXTO_INSEGURO')
  })
})
