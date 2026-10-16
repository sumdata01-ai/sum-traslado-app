// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Sesion } from './AuthPort'
import { PARES_DEL_TABLERO, esCoordinador, puedeVerTablero, tieneAcceso } from './sesion'

const sesion = (role: string, area: string | null, allowedApps: readonly string[] = []): Sesion => ({ idUsuario: 7, usuario: 'u', nombre: null, role, area, allowedApps })

describe('puedeVerTablero: el par rol + área', () => {
  it.each([
    ['supervisor', 'despacho'],
    ['supervisor', 'secado'],
    ['asistente', 'despacho'],
    ['admin', null],
    ['admin', 'qc'],
    ['admin', 'despacho'],
  ])('%s en %s sí lo ve', (role, area) => {
    expect(puedeVerTablero(sesion(role, area))).toBe(true)
  })

  it.each([
    ['supervisor', 'puerto'],
    ['supervisor', 'secado_fisico'], // decidido: no entra
    ['supervisor', 'pdi'],
    ['supervisor', null],
    ['asistente', 'secado'], // el par es asistente + despacho, no el rol solo
    ['asistente', 'repuestos'],
    ['asistente', 'almacen'],
    ['asistente', null],
    ['operario', 'despacho'], // el conductor
    ['utilidad', 'despacho'], // la tablet
    ['coordinador', null], // tiene su propia vista
    ['gerencia', null],
    ['cliente', null],
    ['Supervisor', 'despacho'], // parecido no es igual
    ['supervisor', 'Despacho'],
    ['supervisor', ' despacho'],
    ['administrador', null],
  ])('%s en %s no lo ve', (role, area) => {
    expect(puedeVerTablero(sesion(role, area))).toBe(false)
  })

  it('sin sesión, no', () => {
    expect(puedeVerTablero(null)).toBe(false)
  })

  it('no depende de `allowed_apps`', () => {
    expect(puedeVerTablero(sesion('supervisor', 'despacho', []))).toBe(true)
    expect(puedeVerTablero(sesion('operario', 'despacho', ['traslado']))).toBe(false)
  })

  it('la lista de pares es la de la decisión (y no más)', () => {
    expect([...PARES_DEL_TABLERO]).toEqual([
      ['supervisor', 'despacho'],
      ['supervisor', 'secado'],
      ['asistente', 'despacho'],
    ])
  })
})

describe('lo de antes no cambió', () => {
  it('esCoordinador y tieneAcceso', () => {
    expect(esCoordinador(sesion('coordinador', null))).toBe(true)
    expect(esCoordinador(sesion('supervisor', 'despacho'))).toBe(false)
    expect(tieneAcceso(sesion('operario', 'puerto', ['traslado']))).toBe(true)
    expect(tieneAcceso(sesion('supervisor', 'despacho'))).toBe(false)
  })
})
