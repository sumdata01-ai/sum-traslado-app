// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ESTADOS_FOTO,
  type EstadoFoto,
  TransicionInvalidaError,
  esEstadoFoto,
  esTransicionPermitida,
  parsearEstadoFoto,
  transicionarFoto,
} from './estadoFoto'

// Fuente: docs/01-vision-y-alcance/patron-traslado-web.md §2.1 y `_transicionesFoto` de traslado_estado.dart.
const PERMITIDAS: ReadonlyArray<readonly [EstadoFoto, EstadoFoto]> = [
  ['writing', 'pending'],
  ['writing', 'failed_local'],
  ['pending', 'uploaded'],
  ['pending', 'failed_upload'],
  ['failed_upload', 'pending'],
]

const esPermitida = (desde: EstadoFoto, hacia: EstadoFoto) => PERMITIDAS.some(([d, h]) => d === desde && h === hacia)

const TODOS_LOS_PARES = ESTADOS_FOTO.flatMap((desde) => ESTADOS_FOTO.map((hacia) => [desde, hacia] as const))

describe('transicionarFoto', () => {
  it('hay 5 estados y 25 pares posibles, de los cuales 5 están permitidos', () => {
    expect(ESTADOS_FOTO).toHaveLength(5)
    expect(TODOS_LOS_PARES).toHaveLength(25)
    expect(PERMITIDAS).toHaveLength(5)
  })

  it.each(PERMITIDAS)('permite %s → %s y devuelve el estado siguiente', (desde, hacia) => {
    expect(transicionarFoto(desde, hacia)).toBe(hacia)
    expect(esTransicionPermitida(desde, hacia)).toBe(true)
  })

  it.each(TODOS_LOS_PARES.filter(([d, h]) => !esPermitida(d, h)))('rechaza %s → %s con un error de programación', (desde, hacia) => {
    expect(esTransicionPermitida(desde, hacia)).toBe(false)
    expect(() => transicionarFoto(desde, hacia)).toThrow(TransicionInvalidaError)
    expect(() => transicionarFoto(desde, hacia)).toThrow(`Foto: ${desde} → ${hacia} no está permitida.`)
  })

  it('failed_upload no pasa directo a uploaded: tiene que volver por pending', () => {
    expect(() => transicionarFoto('failed_upload', 'uploaded')).toThrow(TransicionInvalidaError)
    expect(transicionarFoto('failed_upload', 'pending')).toBe('pending')
  })

  it('failed_local y uploaded son terminales', () => {
    for (const hacia of ESTADOS_FOTO) {
      expect(esTransicionPermitida('failed_local', hacia)).toBe(false)
      expect(esTransicionPermitida('uploaded', hacia)).toBe(false)
    }
  })

  it('el error guarda de qué estado a cuál se intentó pasar', () => {
    try {
      transicionarFoto('uploaded', 'pending')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(TransicionInvalidaError)
      expect((error as TransicionInvalidaError).desde).toBe('uploaded')
      expect((error as TransicionInvalidaError).hacia).toBe('pending')
    }
  })
})

describe('lectura de estados guardados', () => {
  it('reconoce los 5 valores válidos', () => {
    for (const estado of ESTADOS_FOTO) {
      expect(esEstadoFoto(estado)).toBe(true)
      expect(parsearEstadoFoto(estado)).toBe(estado)
    }
  })

  it('un valor desconocido es un dato corrupto: se rechaza y no se adivina', () => {
    expect(esEstadoFoto('failed')).toBe(false)
    expect(() => parsearEstadoFoto('failed')).toThrow(RangeError)
    expect(() => parsearEstadoFoto('')).toThrow(RangeError)
  })
})
