// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { siguienteZonaSinFoto, textoContador } from './formulario'
import { type Zona, ZONAS_ENTREGA, ZONAS_SALIDA } from './zonas'

const tomadas = (...zonas: Zona[]) => new Set<Zona>(zonas)

describe('siguienteZonaSinFoto', () => {
  it('sin fotos, empieza por la primera zona del formulario', () => {
    expect(siguienteZonaSinFoto('salida', tomadas())).toBe('FRONTAL')
    expect(siguienteZonaSinFoto('entrega', tomadas())).toBe('FRONTAL')
  })

  it('tras usar una foto, sigue por la siguiente zona sin foto', () => {
    expect(siguienteZonaSinFoto('salida', tomadas('FRONTAL'), 'FRONTAL')).toBe('LATERAL_IZQUIERDO')
    expect(siguienteZonaSinFoto('salida', tomadas('FRONTAL', 'LATERAL_IZQUIERDO'), 'LATERAL_IZQUIERDO')).toBe('LATERAL_DERECHO')
  })

  it('sigue por la zona que viene DESPUÉS de la actual, no por el primer hueco de la lista', () => {
    // El operario eligió Posterior antes que las demás: la siguiente es la que viene detrás, no Frontal.
    expect(siguienteZonaSinFoto('salida', tomadas(), 'POSTERIOR')).toBe('PLACA_ESTADO')
    // Hay un hueco antes (Frontal) y otro después (Lateral derecho) de la zona actual.
    expect(siguienteZonaSinFoto('salida', tomadas('LATERAL_IZQUIERDO'), 'LATERAL_IZQUIERDO')).toBe('LATERAL_DERECHO')
  })

  it('el hueco de antes solo se recupera al dar la vuelta, cuando ya no quedan zonas detrás', () => {
    const todasMenosFrontal = tomadas(...ZONAS_SALIDA.filter((z) => z !== 'FRONTAL'))
    expect(siguienteZonaSinFoto('salida', todasMenosFrontal, 'POSTERIOR')).toBe('FRONTAL')
    // Con un hueco detrás, gana ese aunque Frontal también esté libre.
    const conHuecoDetras = tomadas('LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR', 'PLACA_ESTADO')
    expect(siguienteZonaSinFoto('salida', conHuecoDetras, 'PLACA_ESTADO')).toBe('PLACA_INSTALADA')
  })

  it('salta las zonas que ya tienen foto', () => {
    expect(siguienteZonaSinFoto('salida', tomadas('FRONTAL', 'LATERAL_DERECHO'), 'FRONTAL')).toBe('LATERAL_IZQUIERDO')
    expect(siguienteZonaSinFoto('salida', tomadas('FRONTAL', 'LATERAL_IZQUIERDO'), 'FRONTAL')).toBe('LATERAL_DERECHO')
  })

  it('da la vuelta: al final de la lista vuelve a los huecos del principio', () => {
    const todasMenosLaPrimera = tomadas(...ZONAS_SALIDA.slice(1))
    expect(siguienteZonaSinFoto('salida', todasMenosLaPrimera, 'PLACA_INSTALADA')).toBe('FRONTAL')
  })

  it('si el operario repite una zona del medio, el formulario sigue por los huecos que le faltan', () => {
    // Faltan POSTERIOR y PLACA_INSTALADA; repite LATERAL_IZQUIERDO.
    const t = tomadas('FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'PLACA_ESTADO')
    expect(siguienteZonaSinFoto('salida', t, 'LATERAL_IZQUIERDO')).toBe('POSTERIOR')
  })

  it('con todas las zonas tomadas no hay siguiente', () => {
    expect(siguienteZonaSinFoto('salida', tomadas(...ZONAS_SALIDA), 'PLACA_INSTALADA')).toBeNull()
    expect(siguienteZonaSinFoto('entrega', tomadas(...ZONAS_ENTREGA))).toBeNull()
  })

  it('en la entrega, VIN es la última zona y no hay zonas de placa', () => {
    expect(siguienteZonaSinFoto('entrega', tomadas('FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR'), 'POSTERIOR')).toBe('VIN')
  })

  it('una zona que no es del momento no cuenta como tomada', () => {
    // PLACA_ESTADO no existe en la entrega: no puede tapar el hueco de VIN.
    const t = tomadas('FRONTAL', 'LATERAL_IZQUIERDO', 'LATERAL_DERECHO', 'POSTERIOR', 'PLACA_ESTADO')
    expect(siguienteZonaSinFoto('entrega', t)).toBe('VIN')
  })

  it('un «despuesDe» que no es del momento empieza desde el principio', () => {
    expect(siguienteZonaSinFoto('entrega', tomadas(), 'PLACA_ESTADO')).toBe('FRONTAL')
  })

  it('null en «despuesDe» equivale a no indicarlo', () => {
    expect(siguienteZonaSinFoto('salida', tomadas('FRONTAL'), null)).toBe('LATERAL_IZQUIERDO')
  })

  it('con una sola zona libre, la devuelve vengas desde donde vengas', () => {
    for (const desde of ZONAS_SALIDA) {
      const t = tomadas(...ZONAS_SALIDA.filter((z) => z !== 'POSTERIOR'))
      expect(siguienteZonaSinFoto('salida', t, desde)).toBe('POSTERIOR')
    }
  })
})

describe('textoContador', () => {
  it.each([
    [0, 6, '0/6'],
    [3, 6, '3/6'],
    [6, 6, '6/6'],
    [5, 5, '5/5'],
  ])('%i de %i → %s', (tomadasN, total, esperado) => {
    expect(textoContador(tomadasN, total)).toBe(esperado)
  })
})
