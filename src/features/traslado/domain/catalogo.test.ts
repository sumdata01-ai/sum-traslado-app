// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { canonizarCodigo, coincideConFiltro, filtrarOpciones, rotuloDeOpcion } from './catalogo'

const placa = (nombre: string, estado: string | null = 'disponible') => ({ id: 1, nombre, estado })

describe('canonizarCodigo', () => {
  it.each([
    ['eeb-577', 'EEB577'],
    ['EEB 577', 'EEB577'],
    ['  pr_045  ', 'PR045'],
    ['PR045', 'PR045'],
    ['', ''],
    ['---', ''],
  ])('%j → %j', (entrada, esperado) => {
    expect(canonizarCodigo(entrada)).toBe(esperado)
  })

  it('PR-045, pr 045 y PR045 son la misma placa', () => {
    expect(new Set(['PR-045', 'pr 045', 'PR045'].map(canonizarCodigo)).size).toBe(1)
  })
})

describe('coincideConFiltro', () => {
  it('un filtro vacío (o solo separadores) deja pasar todo', () => {
    expect(coincideConFiltro(placa('EEB577'), '')).toBe(true)
    expect(coincideConFiltro(placa('EEB577'), ' - ')).toBe(true)
  })

  it('encuentra por una parte del código, sin importar mayúsculas ni separadores', () => {
    expect(coincideConFiltro(placa('EEB577'), 'eeb')).toBe(true)
    expect(coincideConFiltro(placa('EEB577'), '577')).toBe(true)
    expect(coincideConFiltro(placa('PR-045'), 'pr045')).toBe(true)
    expect(coincideConFiltro(placa('EEB577'), 'eeb-5')).toBe(true)
  })

  it('no encuentra lo que no está', () => {
    expect(coincideConFiltro(placa('EEB577'), 'ZZZ')).toBe(false)
  })

  it('compara solo el nombre: escribir «afuera» no devuelve media flota', () => {
    expect(coincideConFiltro(placa('EEB577', 'en_uso'), 'afuera')).toBe(false)
    expect(coincideConFiltro(placa('EEB577', 'en_uso'), 'en_uso')).toBe(false)
  })

  it('un proveedor con símbolos se encuentra por sus letras', () => {
    expect(coincideConFiltro({ nombre: 'M&C' }, 'mc')).toBe(true)
    expect(coincideConFiltro({ nombre: 'M&C' }, 'm&c')).toBe(true)
  })
})

describe('filtrarOpciones', () => {
  const todas = [placa('EEB577'), placa('EEB578'), placa('PR-045')]

  it('conserva el orden y solo deja las que coinciden', () => {
    expect(filtrarOpciones(todas, 'eeb').map((o) => o.nombre)).toEqual(['EEB577', 'EEB578'])
    expect(filtrarOpciones(todas, '578').map((o) => o.nombre)).toEqual(['EEB578'])
  })

  it('sin filtro devuelve una copia de todas', () => {
    const resultado = filtrarOpciones(todas, '')
    expect(resultado).toEqual(todas)
    expect(resultado).not.toBe(todas)
  })
})

describe('rotuloDeOpcion', () => {
  it('una placa disponible, o sin estado (un proveedor), se muestra solo con su nombre', () => {
    expect(rotuloDeOpcion(placa('EEB577', 'disponible'))).toBe('EEB577')
    expect(rotuloDeOpcion({ nombre: 'BENAVIDES', estado: null })).toBe('BENAVIDES')
  })

  it('en uso se muestra como «afuera», con texto', () => {
    expect(rotuloDeOpcion(placa('EEB577', 'en_uso'))).toBe('EEB577 · afuera')
  })

  it('un estado que no se conoce se muestra tal cual, mejor que ocultarlo', () => {
    expect(rotuloDeOpcion(placa('EEB577', 'en_reparacion'))).toBe('EEB577 · en_reparacion')
  })
})
