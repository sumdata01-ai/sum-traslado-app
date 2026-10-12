// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { esVinCompleto, normalizarVin, relacionConLaOrden, tipoDeBusqueda } from './vin'

const VIN = 'LSCABN3E2VE840638'

describe('normalizarVin', () => {
  it.each([
    ['  lscabn3e2ve840638 ', VIN],
    ['LSCABN3E 2VE840638', VIN], // un VIN escaneado o copiado puede traer espacios
    ['lscabn3e2ve840638\n', VIN],
    ['', ''],
  ])('%j → %j', (entrada, esperado) => {
    expect(normalizarVin(entrada)).toBe(esperado)
  })
})

describe('esVinCompleto (la misma regla que el backend)', () => {
  it('acepta 17 caracteres válidos, en mayúsculas o minúsculas', () => {
    expect(esVinCompleto(VIN)).toBe(true)
    expect(esVinCompleto(VIN.toLowerCase())).toBe(true)
    expect(esVinCompleto('1HGCM82633A004352')).toBe(true)
  })

  it.each([
    ['16 caracteres', VIN.slice(0, 16)],
    ['18 caracteres', `${VIN}1`],
    ['con la letra I', 'LSCABN3E2VE84063I'],
    ['con la letra O', 'LSCABN3E2VE84063O'],
    ['con la letra Q', 'LSCABN3E2VE84063Q'],
    ['con un guion', 'LSCABN3E-VE840638'],
    ['vacío', ''],
  ])('rechaza un VIN %s', (_caso, texto) => {
    expect(esVinCompleto(texto)).toBe(false)
  })
})

describe('tipoDeBusqueda', () => {
  it('menos de 4 caracteres: no se busca (AC5, no se llama al servidor)', () => {
    for (const texto of ['', 'a', 'ab', 'abc', '  a b c  ']) expect(tipoDeBusqueda(texto)).toBe('corto')
  })

  it('de 4 a 16 caracteres: búsqueda parcial', () => {
    expect(tipoDeBusqueda('lsca')).toBe('parcial')
    expect(tipoDeBusqueda(VIN.slice(0, 16))).toBe('parcial')
  })

  it('el corte de 4 se mide sin espacios', () => {
    expect(tipoDeBusqueda(' a b c ')).toBe('corto')
    expect(tipoDeBusqueda(' a b c d ')).toBe('parcial')
  })

  it('17 caracteres con forma de VIN: identificación exacta', () => {
    expect(tipoDeBusqueda(VIN)).toBe('exacto')
    expect(tipoDeBusqueda(` ${VIN.toLowerCase()} `)).toBe('exacto')
  })

  it('17 o más caracteres que no son un VIN: inválido, sin llamar al servidor', () => {
    expect(tipoDeBusqueda('LSCABN3E2VE84063O')).toBe('invalido') // una O por un 0
    expect(tipoDeBusqueda(`${VIN}1`)).toBe('invalido')
  })
})

describe('relacionConLaOrden', () => {
  const yo = { id: 7 }
  it('sin conductor es del pool', () => expect(relacionConLaOrden(null, 7)).toBe('delPool'))
  it('con mi conductor es mía', () => expect(relacionConLaOrden(yo, 7)).toBe('mia'))
  it('con otro conductor es de otro', () => expect(relacionConLaOrden({ id: 8 }, 7)).toBe('deOtro'))
  it('si no se sabe quién soy, una orden con conductor NO se da por mía', () => {
    expect(relacionConLaOrden(yo, null)).toBe('deOtro')
  })
})
