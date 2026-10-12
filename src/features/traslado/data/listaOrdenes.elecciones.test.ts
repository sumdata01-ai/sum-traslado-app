// @vitest-environment node
/** O-04 en el controlador de órdenes: elegir la placa y el proveedor, y que la elección no se pierda. */
import { describe, expect, it } from 'vitest'
import type { OpcionCatalogo, OrdenRemota } from '../domain'
import { crearListaConServidor, ordenRemota } from './testing/fakes'

const placa: OpcionCatalogo = { id: 40, nombre: 'EEB190', estado: 'en_uso' }
const otraPlaca: OpcionCatalogo = { id: 12, nombre: 'AAA111', estado: 'disponible' }
const proveedor: OpcionCatalogo = { id: 6, nombre: 'BENAVIDES', estado: null }

const propia = (id: number, extra: Partial<OrdenRemota> = {}) =>
  ordenRemota(id, { conductorAsignado: { id: 7, username: 'usuario.prueba', nombreCompleto: null }, ...extra })

async function montar(inicial: OrdenRemota[] = [propia(1), propia(2)]) {
  const m = crearListaConServidor(inicial)
  await m.lista.iniciar(m.idUsuario)
  const snap = () => m.lista.getSnapshot()
  const vista = (id: number) => [...snap().mias, ...snap().pool].find((v) => v.orden.idOrden === id)
  return { ...m, snap, vista }
}

describe('lo que falta elegir', () => {
  it('una orden de la hoja sin placa ni proveedor: faltan los dos y no se puede capturar la salida', async () => {
    const m = await montar()
    expect(m.vista(1)).toMatchObject({ faltaPlaca: true, faltaProveedor: true, puedeCapturar: false })
  })

  it('tras elegir, la placa sigue siendo editable (se puede cambiar de opinión) aunque ya no «falte»', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa })
    expect(m.vista(1)).toMatchObject({ placaEditable: true, faltaPlaca: false, proveedorEditable: true, faltaProveedor: true })
  })

  it('lo que trae el servidor no es editable: no se ofrece cambiarlo', async () => {
    const m = await montar([propia(1, { placa: { id: 1, codigo: 'X' }, proveedor: { id: 2, nombre: 'Y' } })])
    expect(m.vista(1)).toMatchObject({ placaEditable: false, proveedorEditable: false })
  })

  it('una orden que ya trae placa y proveedor no pide elegir', async () => {
    const m = await montar([propia(1, { placa: { id: 1, codigo: 'X' }, proveedor: { id: 2, nombre: 'Y' } })])
    expect(m.vista(1)).toMatchObject({ faltaPlaca: false, faltaProveedor: false, puedeCapturar: true })
  })

  it('una orden en tránsito no pide elegir nada: ya salió', async () => {
    const m = await montar([propia(1, { estado: 'en_transito' })])
    expect(m.vista(1)).toMatchObject({ faltaPlaca: false, faltaProveedor: false, puedeCapturar: true })
  })
})

describe('elegir NO manda nada al servidor', () => {
  // La elección queda en el teléfono hasta que E4-02 la mande al confirmar la salida.
  it('ni elegir, ni cambiar de opinión, ni elegir el proveedor llaman a la API', async () => {
    const m = await montar()
    const llamadas = () =>
      [m.servidor.api.misOrdenes, m.servidor.api.catalogos, m.servidor.api.tomarOrden, m.servidor.api.soltarOrden].map((f) => (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length)
    const antes = llamadas()

    await m.lista.elegir(1, { placa })
    await m.lista.elegir(1, { placa: otraPlaca })
    await m.lista.elegir(1, { proveedor })
    await m.lista.elegir(1, { placa })

    expect(llamadas()).toEqual(antes)
  })
})

describe('elegir', () => {
  it('con la placa elegida ya se puede capturar, y la placa se ve en la orden', async () => {
    const m = await montar()

    const resultado = await m.lista.elegir(1, { placa })

    expect(resultado).toEqual({ ok: true, mensaje: 'Guardado en este teléfono.' })
    expect(m.vista(1)).toMatchObject({ faltaPlaca: false, faltaProveedor: true, puedeCapturar: true })
    expect(m.vista(1)?.orden.placa).toEqual({ id: 40, codigo: 'EEB190' })
  })

  it('elegir el proveedor no pisa la placa ya elegida', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa })
    await m.lista.elegir(1, { proveedor })
    expect(m.vista(1)?.orden).toMatchObject({ placa: { id: 40 }, proveedor: { id: 6 } })
  })

  it('cambiar de opinión reemplaza la placa anterior', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa })
    await m.lista.elegir(1, { placa: otraPlaca })
    expect(m.vista(1)?.orden.placa).toEqual({ id: 12, codigo: 'AAA111' })
  })

  it('queda guardada con su dueño', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa })
    expect(await m.elecciones.listar(7)).toMatchObject([{ idOrden: 1, idUsuario: 7, placa: { id: 40 } }])
    expect(await m.elecciones.listar(8)).toEqual([])
  })

  it('en la entrega no se elige: se rechaza sin guardar nada', async () => {
    const m = await montar([propia(1, { estado: 'en_transito' })])
    expect((await m.lista.elegir(1, { placa })).ok).toBe(false)
    expect(await m.elecciones.listar(7)).toEqual([])
  })

  it('una orden que no está en la lista no se puede', async () => {
    const m = await montar()
    expect(await m.lista.elegir(99, { placa })).toEqual({ ok: false, mensaje: 'Esa orden ya no está en la lista.' })
  })

  it('si no se puede guardar en el teléfono, se avisa y no se finge', async () => {
    const m = await montar()
    m.elecciones.falla = true
    const resultado = await m.lista.elegir(1, { placa })
    expect(resultado.ok).toBe(false)
    expect(m.vista(1)?.faltaPlaca).toBe(true)
  })

  it('AC3 · se puede elegir sin conexión', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    expect((await m.lista.elegir(1, { placa })).ok).toBe(true)
  })
})

describe('cambiar de opinión sigue siendo posible aunque no se pueda leer lo guardado', () => {
  // `recalcular` usa lo que ya está en pantalla cuando no puede leer la caché. Si ahí se tomara la placa
  // elegida como si la trajera el servidor, el selector desaparecería y no se podría cambiar de opinión.
  it('con un fallo al leer la caché, la placa elegida sigue siendo editable', async () => {
    const m = await montar()
    m.cache.falla.leer = true

    await m.lista.elegir(1, { placa })

    expect(m.vista(1)).toMatchObject({ placaEditable: true, faltaPlaca: false })
    expect(m.vista(1)?.orden.placa).toEqual({ id: 40, codigo: 'EEB190' })
  })

  it('y se puede elegir otra después, con la lectura todavía fallando', async () => {
    const m = await montar()
    m.cache.falla.leer = true
    await m.lista.elegir(1, { placa })

    await m.lista.elegir(1, { placa: otraPlaca })

    expect(m.vista(1)).toMatchObject({ placaEditable: true })
    expect(m.vista(1)?.orden.placa).toEqual({ id: 12, codigo: 'AAA111' })
  })

  it('con una limpieza pendiente (la marca puesta) pasa lo mismo', async () => {
    const m = await montar()
    m.marca.poner()
    m.cache.vaciar = () => Promise.reject(new Error('bloqueada')) // no se puede limpiar: sigue pendiente

    await m.lista.elegir(1, { placa })

    expect(m.vista(1)).toMatchObject({ placaEditable: true })
  })

  it('el proveedor igual', async () => {
    const m = await montar()
    m.cache.falla.leer = true
    await m.lista.elegir(1, { proveedor })
    expect(m.vista(1)).toMatchObject({ proveedorEditable: true, faltaProveedor: false })
  })
})

describe('que la elección no se pierda', () => {
  it('sobrevive a actualizar aunque el servidor siga sin traer placa (el servidor pisa solo cuando trae dato)', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa, proveedor })

    await m.lista.actualizar()
    await m.lista.actualizar()

    expect(m.vista(1)?.orden).toMatchObject({ placa: { id: 40 }, proveedor: { id: 6 } })
  })

  it('cuando el servidor ya trae la placa, manda el servidor y la elección se olvida', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa, proveedor })
    m.servidor.ordenes.get(1)!.placa = { id: 99, codigo: 'SERVIDOR' }
    m.servidor.ordenes.get(1)!.proveedor = { id: 98, nombre: 'DEL SERVIDOR' }

    await m.lista.actualizar()

    expect(m.vista(1)?.orden).toMatchObject({ placa: { codigo: 'SERVIDOR' }, proveedor: { nombre: 'DEL SERVIDOR' } })
    expect(await m.elecciones.listar(7)).toEqual([])
  })

  it('sobrevive a cerrar la sesión: al volver la misma persona sigue ahí', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa })

    await m.lista.vaciar()
    await m.lista.iniciar(7)

    expect(m.vista(1)?.orden.placa).toEqual({ id: 40, codigo: 'EEB190' })
  })

  it('otra persona del mismo navegador no ve ni usa la elección', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa })
    await m.lista.vaciar()

    await m.lista.iniciar(8)

    expect(m.vista(1)?.orden.placa ?? null).toBeNull()
    expect(await m.elecciones.listar(7)).toHaveLength(1) // la de la primera persona sigue guardada
  })

  it('una orden que el servidor ya no devuelve (y sin toma) olvida la elección', async () => {
    const m = await montar()
    await m.lista.elegir(1, { placa })
    m.servidor.ordenes.delete(1)

    await m.lista.actualizar()

    expect(await m.elecciones.listar(7)).toEqual([])
  })

  it('soltar una orden tomada olvida lo que se había elegido', async () => {
    const m = await montar([ordenRemota(1), ordenRemota(2)])
    await m.lista.tomar(1)
    await m.lista.elegir(1, { placa })

    await m.lista.soltar(1)

    expect(await m.elecciones.listar(7)).toEqual([])
  })
})
