// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '@/core/auth/testing/servidorFalso'
import { CLAVE_LIMPIEZA_PENDIENTE, MarcaEnAlmacen, MarcaEnMemoria } from './marcaLimpieza'

const lanza = () => {
  throw new Error('bloqueado')
}

describe('MarcaEnAlmacen', () => {
  it('sobrevive a una recarga: otra instancia sobre el mismo almacenamiento la ve', () => {
    const almacen = new AlmacenMemoria()
    new MarcaEnAlmacen(almacen).poner()

    expect(new MarcaEnAlmacen(almacen).activa()).toBe(true)
    expect(almacen.getItem(CLAVE_LIMPIEZA_PENDIENTE)).toBe('1')
  })

  it('quitarla la borra del almacenamiento', () => {
    const almacen = new AlmacenMemoria()
    const marca = new MarcaEnAlmacen(almacen)
    marca.poner()
    marca.quitar()

    expect(marca.activa()).toBe(false)
    expect(new MarcaEnAlmacen(almacen).activa()).toBe(false)
  })

  it('si el almacenamiento falla, vale igual en esta página y nunca lanza', () => {
    const marca = new MarcaEnAlmacen({ getItem: lanza, setItem: lanza, removeItem: lanza })

    expect(() => marca.poner()).not.toThrow()
    expect(marca.activa()).toBe(true)
    expect(() => marca.quitar()).not.toThrow()
    expect(marca.activa()).toBe(false)
  })

  it('sin almacenamiento (modo privado) funciona solo en memoria', () => {
    const marca = new MarcaEnAlmacen(undefined)
    expect(marca.activa()).toBe(false)
    marca.poner()
    expect(marca.activa()).toBe(true)
  })

  it('creada con los valores por defecto no lanza aunque no haya localStorage', () => {
    expect(() => new MarcaEnAlmacen().activa()).not.toThrow()
  })
})

describe('MarcaEnMemoria', () => {
  it('se pone y se quita', () => {
    const marca = new MarcaEnMemoria()
    marca.poner()
    expect(marca.activa()).toBe(true)
    marca.quitar()
    expect(marca.activa()).toBe(false)
  })
})
