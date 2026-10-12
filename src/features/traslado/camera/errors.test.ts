// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CamaraError, errorDeNavegador, esErrorDeRestricciones } from './errors'
import { detectarPlataforma } from './plataforma'
import { USER_AGENT_ANDROID, USER_AGENT_IPHONE, errorDeDom } from './testing/fakes'

describe('errorDeNavegador', () => {
  it.each([
    ['NotAllowedError', 'PERMISO_DENEGADO', true],
    ['PermissionDeniedError', 'PERMISO_DENEGADO', true],
    ['SecurityError', 'PERMISO_DENEGADO', true],
    ['NotFoundError', 'SIN_CAMARA', false],
    ['DevicesNotFoundError', 'SIN_CAMARA', false],
    ['NotReadableError', 'CAMARA_OCUPADA', true],
    ['TrackStartError', 'CAMARA_OCUPADA', true],
    ['OverconstrainedError', 'RESTRICCIONES_IMPOSIBLES', true],
    ['AbortError', 'DESCONOCIDO', true],
    ['AlgoRaro', 'DESCONOCIDO', true],
  ] as const)('%s → %s (reintentable: %s)', (nombre, codigo, reintentable) => {
    const error = errorDeNavegador(errorDeDom(nombre), 'otra')
    expect(error).toBeInstanceOf(CamaraError)
    expect(error.codigo).toBe(codigo)
    expect(error.reintentable).toBe(reintentable)
  })

  it('un valor que no es un error igual produce un error desconocido, sin lanzar', () => {
    expect(errorDeNavegador(undefined, 'otra').codigo).toBe('DESCONOCIDO')
    expect(errorDeNavegador('texto', 'otra').codigo).toBe('DESCONOCIDO')
    expect(errorDeNavegador(null, 'otra').codigo).toBe('DESCONOCIDO')
  })

  it('el permiso denegado trae instrucciones distintas según la plataforma', () => {
    const ios = errorDeNavegador(errorDeDom('NotAllowedError'), 'ios').message
    const android = errorDeNavegador(errorDeDom('NotAllowedError'), 'android').message
    const otra = errorDeNavegador(errorDeDom('NotAllowedError'), 'otra').message

    expect(ios).toContain('Ajustes › Safari › Cámara')
    expect(android).toContain('candado')
    expect(otra).toContain('configuración del navegador')
    expect(new Set([ios, android, otra]).size).toBe(3)
  })

  it('conserva el error original como causa, para poder depurarlo', () => {
    const original = errorDeDom('NotReadableError')
    expect(errorDeNavegador(original, 'otra').cause).toBe(original)
  })

  it('reconoce los errores de restricciones, que se resuelven con un reintento más simple', () => {
    expect(esErrorDeRestricciones(errorDeDom('OverconstrainedError'))).toBe(true)
    expect(esErrorDeRestricciones(errorDeDom('ConstraintNotSatisfiedError'))).toBe(true)
    expect(esErrorDeRestricciones(errorDeDom('NotAllowedError'))).toBe(false)
  })
})

describe('detectarPlataforma', () => {
  it.each([
    ['iPhone', USER_AGENT_IPHONE, 'iPhone', 5, 'ios'],
    ['Android', USER_AGENT_ANDROID, 'Linux armv81', 5, 'android'],
    ['iPad con Safari de escritorio (se presenta como Mac)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5, 'ios'],
    ['un Mac de verdad', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0, 'otra'],
    ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0', 'Win32', 0, 'otra'],
  ] as const)('%s → %s', (_nombre, userAgent, platform, maxTouchPoints, esperada) => {
    expect(detectarPlataforma({ userAgent, platform, maxTouchPoints })).toBe(esperada)
  })
})
