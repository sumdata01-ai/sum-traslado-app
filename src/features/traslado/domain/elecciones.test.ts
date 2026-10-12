// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OpcionCatalogo } from './catalogo'
import { type EleccionLocal, aplicarElecciones, combinarEleccion, faltaPlaca, faltaProveedor, puedeCapturarSalida, reconciliarElecciones } from './elecciones'
import type { OrdenCacheada, OrdenRemota } from './orden'

const placa: OpcionCatalogo = { id: 40, nombre: 'EEB190', estado: 'en_uso' }
const proveedor: OpcionCatalogo = { id: 6, nombre: 'BENAVIDES', estado: null }

const remota = (idOrden: number, extra: Partial<OrdenRemota> = {}): OrdenRemota => ({
  idOrden,
  vin: `VIN${idOrden}`,
  estado: 'pendiente',
  placa: null,
  proveedor: null,
  destino: null,
  conductorAsignado: null,
  fechaCreacion: null,
  ...extra,
})
const cacheada = (idOrden: number, extra: Partial<OrdenCacheada> = {}): OrdenCacheada => ({ ...remota(idOrden), tomaSync: null, sincronizadaEn: 1, ...extra })
const eleccion = (idOrden: number, extra: Partial<EleccionLocal> = {}): EleccionLocal => ({ idOrden, idUsuario: 7, placa, proveedor, elegidaEn: 1, ...extra })

describe('aplicarElecciones', () => {
  it('rellena placa y proveedor donde el servidor no trae nada', () => {
    const [orden] = aplicarElecciones([cacheada(1)], [eleccion(1)])
    expect(orden?.placa).toEqual({ id: 40, codigo: 'EEB190' })
    expect(orden?.proveedor).toEqual({ id: 6, nombre: 'BENAVIDES' })
  })

  it('el servidor pisa cuando trae dato: la elección no lo cambia', () => {
    const delServidor = { id: 99, codigo: 'SERV999' }
    const [orden] = aplicarElecciones([cacheada(1, { placa: delServidor })], [eleccion(1)])
    expect(orden?.placa).toEqual(delServidor)
    expect(orden?.proveedor).toEqual({ id: 6, nombre: 'BENAVIDES' }) // lo que faltaba, sí
  })

  it('una elección solo de la placa deja el proveedor vacío', () => {
    const [orden] = aplicarElecciones([cacheada(1)], [eleccion(1, { proveedor: null })])
    expect(orden?.proveedor).toBeNull()
  })

  it('las órdenes sin elección no cambian', () => {
    const original = cacheada(2)
    expect(aplicarElecciones([original], [eleccion(1)])[0]).toBe(original)
  })
})

describe('reconciliarElecciones', () => {
  it('lo que el servidor ya trae se quita de la elección; lo que falta se conserva', () => {
    const [resultado] = reconciliarElecciones([eleccion(1)], [remota(1, { placa: { id: 1, codigo: 'X' } })], new Set())
    expect(resultado?.placa).toBeNull()
    expect(resultado?.proveedor).toEqual(proveedor)
  })

  it('cuando el servidor ya trae todo, la elección se olvida', () => {
    const completa = remota(1, { placa: { id: 1, codigo: 'X' }, proveedor: { id: 2, nombre: 'Y' } })
    expect(reconciliarElecciones([eleccion(1)], [completa], new Set())).toEqual([])
  })

  it('una orden que el servidor ya no devuelve se olvida…', () => {
    expect(reconciliarElecciones([eleccion(1)], [], new Set())).toEqual([])
  })

  it('…salvo que siga a la vista por una toma pendiente o perdida', () => {
    expect(reconciliarElecciones([eleccion(1)], [], new Set([1]))).toHaveLength(1)
  })

  it('una orden que sigue sin placa ni proveedor conserva la elección completa', () => {
    expect(reconciliarElecciones([eleccion(1)], [remota(1)], new Set())).toEqual([eleccion(1)])
  })
})

describe('combinarEleccion', () => {
  it('la primera elección parte de nada', () => {
    expect(combinarEleccion(null, { idOrden: 1, idUsuario: 7, placa }, 10)).toEqual({ idOrden: 1, idUsuario: 7, placa, proveedor: null, elegidaEn: 10 })
  })

  it('elegir el proveedor conserva la placa ya elegida, y al revés', () => {
    const conPlaca = combinarEleccion(null, { idOrden: 1, idUsuario: 7, placa }, 10)
    const conAmbos = combinarEleccion(conPlaca, { idOrden: 1, idUsuario: 7, proveedor }, 20)
    expect(conAmbos).toMatchObject({ placa, proveedor, elegidaEn: 20 })
  })

  it('cambiar de placa reemplaza la anterior', () => {
    const otra = { id: 5, nombre: 'ZZZ555', estado: 'disponible' }
    const primera = combinarEleccion(null, { idOrden: 1, idUsuario: 7, placa }, 10)
    expect(combinarEleccion(primera, { idOrden: 1, idUsuario: 7, placa: otra }, 20).placa).toEqual(otra)
  })
})

describe('qué falta elegir', () => {
  it('en la salida (pendiente) falta lo que ni el servidor ni el operario pusieron', () => {
    expect(faltaPlaca({ estado: 'pendiente', placa: null })).toBe(true)
    expect(faltaPlaca({ estado: 'pendiente', placa: { id: 1, codigo: 'X' } })).toBe(false)
    expect(faltaProveedor({ estado: 'pendiente', proveedor: null })).toBe(true)
  })

  it('en la entrega (en tránsito) no se elige nada', () => {
    expect(faltaPlaca({ estado: 'en_transito', placa: null })).toBe(false)
    expect(faltaProveedor({ estado: 'en_transito', proveedor: null })).toBe(false)
  })

  it('sin placa no se captura la salida; sin proveedor sí', () => {
    expect(puedeCapturarSalida({ estado: 'pendiente', placa: null })).toBe(false)
    expect(puedeCapturarSalida({ estado: 'pendiente', placa: { id: 1, codigo: 'X' } })).toBe(true)
    expect(puedeCapturarSalida({ estado: 'en_transito', placa: null })).toBe(true)
  })
})
