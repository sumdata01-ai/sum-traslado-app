// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ESTADOS_CAMARA,
  type EstadoCamara,
  TransicionCamaraInvalidaError,
  esTransicionCamaraPermitida,
  transicionarCamara,
} from './estadoCamara'

// ARQUITECTURA-FRONT.md §5.1, más las cuatro transiciones añadidas (ver estadoCamara.ts).
const PERMITIDAS: ReadonlyArray<readonly [EstadoCamara, EstadoCamara]> = [
  ['inactiva', 'solicitando'],
  ['inactiva', 'sinSoporte'],
  ['sinSoporte', 'inactiva'],
  ['solicitando', 'iniciando'],
  ['solicitando', 'error'],
  ['solicitando', 'suspendida'],
  ['solicitando', 'inactiva'],
  ['iniciando', 'lista'],
  ['iniciando', 'error'],
  ['iniciando', 'suspendida'],
  ['iniciando', 'inactiva'],
  ['lista', 'capturando'],
  ['lista', 'suspendida'],
  ['lista', 'inactiva'],
  ['capturando', 'revisando'],
  ['capturando', 'lista'],
  ['capturando', 'suspendida'],
  ['capturando', 'inactiva'],
  ['revisando', 'lista'],
  ['revisando', 'suspendida'],
  ['revisando', 'inactiva'],
  ['suspendida', 'solicitando'],
  ['suspendida', 'iniciando'],
  ['suspendida', 'inactiva'],
  ['error', 'solicitando'],
  ['error', 'iniciando'],
  ['error', 'inactiva'],
]

const esPermitida = (desde: EstadoCamara, hacia: EstadoCamara) => PERMITIDAS.some(([d, h]) => d === desde && h === hacia)
const TODOS_LOS_PARES = ESTADOS_CAMARA.flatMap((desde) => ESTADOS_CAMARA.map((hacia) => [desde, hacia] as const))

describe('transicionarCamara (AC7)', () => {
  it('hay 9 estados y 81 pares, de los cuales 27 están permitidos', () => {
    expect(ESTADOS_CAMARA).toHaveLength(9)
    expect(TODOS_LOS_PARES).toHaveLength(81)
    expect(PERMITIDAS).toHaveLength(27)
  })

  it.each(PERMITIDAS)('permite %s → %s', (desde, hacia) => {
    expect(transicionarCamara(desde, hacia)).toBe(hacia)
  })

  it.each(TODOS_LOS_PARES.filter(([d, h]) => !esPermitida(d, h)))('rechaza %s → %s con un error de programación', (desde, hacia) => {
    expect(esTransicionCamaraPermitida(desde, hacia)).toBe(false)
    expect(() => transicionarCamara(desde, hacia)).toThrow(TransicionCamaraInvalidaError)
    expect(() => transicionarCamara(desde, hacia)).toThrow(`Cámara: ${desde} → ${hacia} no está permitida.`)
  })

  it('desde cualquier estado que no sea inactiva se puede cerrar la sesión', () => {
    for (const estado of ESTADOS_CAMARA.filter((e) => e !== 'inactiva')) {
      expect(esTransicionCamaraPermitida(estado, 'inactiva')).toBe(true)
    }
  })

  it('no se puede disparar sin haber pasado por «lista»', () => {
    for (const estado of ESTADOS_CAMARA.filter((e) => e !== 'lista')) {
      expect(esTransicionCamaraPermitida(estado, 'capturando')).toBe(false)
    }
  })

  it('sinSoporte es un callejón: solo se sale cerrando la sesión', () => {
    expect(ESTADOS_CAMARA.filter((hacia) => esTransicionCamaraPermitida('sinSoporte', hacia))).toEqual(['inactiva'])
  })
})
