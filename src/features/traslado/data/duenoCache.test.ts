// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '@/core/auth/testing/servidorFalso'
import { CLAVE_DUENO_CACHE, DuenoEnAlmacen, DuenoEnMemoria } from './duenoCache'

const lanza = () => {
  throw new Error('bloqueado')
}

describe('DuenoEnAlmacen', () => {
  it('sobrevive a una recarga', () => {
    const almacen = new AlmacenMemoria()
    new DuenoEnAlmacen(almacen).fijar(7)

    expect(new DuenoEnAlmacen(almacen).leer()).toBe(7)
    expect(almacen.getItem(CLAVE_DUENO_CACHE)).toBe('7')
  })

  it('sin dueño se borra la clave', () => {
    const almacen = new AlmacenMemoria()
    const dueno = new DuenoEnAlmacen(almacen)
    dueno.fijar(7)
    dueno.fijar(null)

    expect(dueno.leer()).toBeNull()
    expect(almacen.getItem(CLAVE_DUENO_CACHE)).toBeNull()
  })

  it('un valor guardado que no es un id se lee como desconocido', () => {
    const almacen = new AlmacenMemoria()
    almacen.setItem(CLAVE_DUENO_CACHE, 'abc')
    expect(new DuenoEnAlmacen(almacen).leer()).toBeNull()
  })

  it('con el almacenamiento bloqueado vale en memoria y nunca lanza', () => {
    const dueno = new DuenoEnAlmacen({ getItem: lanza, setItem: lanza, removeItem: lanza })
    expect(dueno.leer()).toBeNull()
    expect(() => dueno.fijar(7)).not.toThrow()
    expect(dueno.leer()).toBe(7)
  })

  it('creado con los valores por defecto no lanza aunque no haya localStorage', () => {
    expect(() => new DuenoEnAlmacen().leer()).not.toThrow()
  })
})

describe('DuenoEnMemoria', () => {
  it('guarda y devuelve el id', () => {
    const dueno = new DuenoEnMemoria()
    expect(dueno.leer()).toBeNull()
    dueno.fijar(3)
    expect(dueno.leer()).toBe(3)
  })
})
