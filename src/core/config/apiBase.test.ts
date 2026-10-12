import { describe, expect, it } from 'vitest'
import { buildApiUrl, getApiBaseUrl } from './apiBase'

describe('apiBase', () => {
  it('sin configuración, la base es vacía (ruta relativa) y no localhost:8050', () => {
    expect(getApiBaseUrl()).toBe('')
    expect(buildApiUrl('/mobile/traslado/mis-ordenes')).toBe('/mobile/traslado/mis-ordenes')
  })

  it('agrega la barra inicial cuando falta', () => {
    expect(buildApiUrl('api/login')).toBe('/api/login')
  })

  it('con una base explícita, quita las barras finales', () => {
    expect(getApiBaseUrl()).toBe('')
    expect(buildApiUrl('/api/login', 'https://api.ejemplo.test/'.replace(/\/+$/, ''))).toBe('https://api.ejemplo.test/api/login')
  })

  it('deja pasar tal cual una URL absoluta', () => {
    expect(buildApiUrl('https://storage.googleapis.com/x', 'https://api.ejemplo.test')).toBe('https://storage.googleapis.com/x')
  })
})
