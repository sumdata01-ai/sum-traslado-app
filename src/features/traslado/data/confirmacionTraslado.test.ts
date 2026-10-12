// @vitest-environment node
/** E4-02 · «Confirmar salida» y «Confirmar entrega»: validar antes, registrar el despacho y limpiar el teléfono. */
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { type Momento, type OpcionCatalogo, type OrdenRemota, ZONAS_ENTREGA, ZONAS_SALIDA, type Zona, zonasDe } from '../domain'
import { AlmacenEnMemoria } from './almacenEnMemoria'
import { ConfirmacionTraslado } from './confirmacionTraslado'
import type { FotoParaGuardar } from './fotoStorePort'
import { crearListaConServidor, ordenRemota } from './testing/fakes'

const placa: OpcionCatalogo = { id: 27, nombre: 'ABC123', estado: 'disponible' }
const proveedor: OpcionCatalogo = { id: 4, nombre: 'GRUAS SA', estado: null }
const yo = { id: 7, username: 'usuario.prueba', nombreCompleto: null }

const foto = (creadaEn: number): FotoParaGuardar => ({ blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), ancho: 1280, alto: 720, creadaEn })

const propia = (id: number, extra: Partial<OrdenRemota> = {}) => ordenRemota(id, { conductorAsignado: yo, ...extra })
const conPlaca = { placa: { id: 27, codigo: 'ABC123' } }

type DatosSalidaLlamada = { fotos: Array<{ zona: string; storageKey: string }>; idConductorEsperado: number | null; idPlaca: number | null; idProveedor: number | null; fechaSalida: Date }
type DatosEntregaLlamada = { fotos: Array<{ zona: string; storageKey: string }>; fechaEntrega: Date }

async function montar(inicial: OrdenRemota[] = [propia(1, conPlaca)]) {
  const m = crearListaConServidor(inicial)
  await m.lista.iniciar(m.idUsuario)
  const store = new AlmacenEnMemoria()
  const crear = () => new ConfirmacionTraslado({ api: m.servidor.api, store, lista: m.lista })
  /** Toma (y sube, salvo que se pida lo contrario) las fotos de las zonas pedidas. Sus fechas son 2000, 3000, … */
  async function tomarFotos(ordenId: number, momento: Momento, zonas: readonly Zona[] = zonasDe(momento), subir = true) {
    let t = 1_000
    for (const zona of zonas) {
      const guardada = await store.guardar({ ordenId, momento }, zona, foto((t += 1_000)))
      if (subir) await store.marcarSubida(guardada.clientId, `traslado/${ordenId}/${zona}.jpg`)
    }
  }
  const api = m.servidor.api
  return { ...m, api, store, confirmacion: crear(), crear, tomarFotos }
}

const salidaLlamada = (m: { api: { confirmarSalida: unknown } }) => (m.api.confirmarSalida as { mock: { calls: unknown[][] } }).mock.calls[0] as unknown as [number, DatosSalidaLlamada]
const entregaLlamada = (m: { api: { confirmarEntrega: unknown } }) => (m.api.confirmarEntrega as { mock: { calls: unknown[][] } }).mock.calls[0] as unknown as [number, DatosEntregaLlamada]

describe('AC1 · validación previa: sin fotos completas no se llama al servidor', () => {
  it('con 5 de 6 fotos dice cuál falta y no llama', async () => {
    const m = await montar()
    await m.tomarFotos(1, 'salida', ZONAS_SALIDA.slice(0, 5))

    const r = await m.confirmacion.confirmar(1, 'salida')

    expect(r).toMatchObject({ tipo: 'incompleta' })
    expect(r.tipo === 'incompleta' && r.problemas).toContain('Falta la foto de Placa — instalada en el vehículo.')
    expect(m.api.confirmarSalida).not.toHaveBeenCalled()
  })

  it('con las 6 tomadas pero una sin subir dice cuál y no llama', async () => {
    const m = await montar()
    await m.tomarFotos(1, 'salida', ZONAS_SALIDA.slice(0, 5))
    await m.tomarFotos(1, 'salida', ['PLACA_INSTALADA'], false) // la sexta, tomada pero sin subir

    const r = await m.confirmacion.confirmar(1, 'salida')

    expect(r).toMatchObject({ tipo: 'incompleta' })
    expect(r.tipo === 'incompleta' && r.problemas).toEqual(['La foto de Placa — instalada en el vehículo todavía no se subió.'])
    expect(m.api.confirmarSalida).not.toHaveBeenCalled()
  })

  it('sin ninguna foto lista el conteo y las 6 zonas', async () => {
    const m = await montar()
    const r = await m.confirmacion.confirmar(1, 'salida')
    expect(r.tipo === 'incompleta' && r.problemas).toHaveLength(7)
    expect(m.api.confirmarSalida).not.toHaveBeenCalled()
  })

  it('la salida sin placa elegida no se confirma, aunque las fotos estén', async () => {
    const m = await montar([propia(1)])
    await m.tomarFotos(1, 'salida')
    const r = await m.confirmacion.confirmar(1, 'salida')
    expect(r.tipo === 'incompleta' && r.problemas).toEqual(['Falta elegir la placa.'])
    expect(m.api.confirmarSalida).not.toHaveBeenCalled()
  })

  it('la entrega con 4 de 5 no llama al servidor', async () => {
    const m = await montar([propia(1, { estado: 'en_transito' })])
    await m.tomarFotos(1, 'entrega', ZONAS_ENTREGA.slice(0, 4))
    expect(await m.confirmacion.confirmar(1, 'entrega')).toMatchObject({ tipo: 'incompleta' })
    expect(m.api.confirmarEntrega).not.toHaveBeenCalled()
  })
})

describe('AC2 · confirmar la salida', () => {
  it('manda las 6 fotos con su ruta, el conductor esperado, la placa y el proveedor elegidos y la fecha de la ÚLTIMA foto', async () => {
    const m = await montar([propia(1)])
    await m.lista.elegir(1, { placa, proveedor })
    await m.tomarFotos(1, 'salida') // fechas 2000 … 7000

    const r = await m.confirmacion.confirmar(1, 'salida')

    expect(r.tipo).toBe('confirmada')
    expect(m.api.confirmarSalida).toHaveBeenCalledTimes(1)
    const [id, datos] = salidaLlamada(m)
    expect(id).toBe(1)
    expect(datos.fotos).toHaveLength(6)
    expect(datos.fotos[0]).toEqual({ zona: 'FRONTAL', storageKey: 'traslado/1/FRONTAL.jpg' })
    expect(datos).toMatchObject({ idConductorEsperado: 7, idPlaca: 27, idProveedor: 4 })
    expect(datos.fechaSalida.getTime()).toBe(7_000) // la última captura, no el reloj de ahora
  })

  it('sin proveedor elegido va null (no bloquea)', async () => {
    const m = await montar()
    await m.tomarFotos(1, 'salida')
    await m.confirmacion.confirmar(1, 'salida')
    expect(salidaLlamada(m)[1]).toMatchObject({ idProveedor: null, idPlaca: 27 })
  })

  it('una orden tomada del pool manda como esperado al conductor que la tomó', async () => {
    const m = await montar([ordenRemota(1, conPlaca)])
    await m.lista.tomar(1)
    await m.tomarFotos(1, 'salida')
    await m.confirmacion.confirmar(1, 'salida')
    expect(salidaLlamada(m)[1].idConductorEsperado).toBe(7)
  })
})

describe('AC3 · salida confirmada', () => {
  it('borra solo las fotos de la salida, la elección y la toma; y la orden pasa a «en tránsito»', async () => {
    const m = await montar([propia(1)])
    await m.lista.elegir(1, { placa })
    await m.tomarFotos(1, 'salida')

    const r = await m.confirmacion.confirmar(1, 'salida')

    expect(r).toEqual({ tipo: 'confirmada', mensaje: 'Salida confirmada. El traslado quedó en tránsito.' })
    expect(m.fotos.momentosBorrados).toEqual(['1:salida']) // el tramo de la entrega no se toca
    expect(m.fotos.borradas).toEqual([])
    expect(await m.elecciones.listar(7)).toEqual([])
    expect(m.lista.getSnapshot().mias.find((v) => v.orden.idOrden === 1)?.orden.estado).toBe('en_transito')
  })
})

describe('AC4 · descartada_por_supervisor no es un error', () => {
  it.each([
    ['orden_cancelada', /canceló esta orden/],
    ['orden_reasignada', /asignó esta orden a otra persona/],
    [null, /descartó este traslado/],
  ])('motivo %s: avisa, borra todo lo local y no promete que las fotos se borraron del servidor', async (motivo, texto) => {
    const m = await montar()
    await m.tomarFotos(1, 'salida')
    m.api.confirmarSalida = (async (idOrden: number) => ({ resultado: 'descartada_por_supervisor', idOrden, estado: 'cancelada', motivo })) as never

    const r = await m.crear().confirmar(1, 'salida')

    expect(r.tipo).toBe('descartada')
    expect(r.mensaje).toMatch(texto)
    expect(r.mensaje).toContain('quedaron registradas') // AC7: el servidor guarda las fotos igual
    expect(m.fotos.borradas).toEqual([1])
  })
})

describe('AC5 · un error no borra nada', () => {
  it.each([
    ['un 422', new ApiError('Se esperan exactamente 6 fotos.', { status: 422 }), 'Se esperan exactamente 6 fotos.'],
    ['un 409', new ApiError('Conflicto', { status: 409 }), 'Conflicto'],
    ['un 500', new ApiError('Error interno', { status: 500 }), 'Error interno'],
    ['la red caída', new ApiError('Sin conexión al backend o internet.'), 'Sin conexión: no se pudo confirmar la salida. Vuelve a intentar cuando tengas señal.'],
    ['un fallo desconocido', new Error('rarísimo'), 'No se pudo confirmar la salida.'],
  ])('%s: fallida con el mensaje, sin borrar fotos ni elecciones', async (_nombre, error, mensaje) => {
    const m = await montar([propia(1)])
    await m.lista.elegir(1, { placa })
    await m.tomarFotos(1, 'salida')
    m.api.confirmarSalida = (async () => {
      throw error
    }) as never

    const r = await m.crear().confirmar(1, 'salida')

    expect(r).toEqual({ tipo: 'fallida', mensaje })
    expect(m.fotos.borradas).toEqual([])
    expect(m.fotos.momentosBorrados).toEqual([])
    expect(await m.store.listar({ ordenId: 1, momento: 'salida' })).toHaveLength(6)
    expect(await m.elecciones.listar(7)).toHaveLength(1)
  })

  it('«Reintentar» tras un fallo funciona: la segunda vez confirma', async () => {
    const m = await montar()
    await m.tomarFotos(1, 'salida')
    const original = m.api.confirmarSalida
    m.api.confirmarSalida = (async () => {
      throw new ApiError('Sin conexión al backend o internet.')
    }) as never
    const confirmacion = m.crear()
    expect((await confirmacion.confirmar(1, 'salida')).tipo).toBe('fallida')

    m.api.confirmarSalida = original
    expect((await confirmacion.confirmar(1, 'salida')).tipo).toBe('confirmada')
  })
})

describe('AC6 · confirmar la entrega', () => {
  it('manda las 5 fotos (con VIN) y la fecha de la última; al confirmar borra todo lo de la orden', async () => {
    const m = await montar([propia(1, { estado: 'en_transito' })])
    await m.tomarFotos(1, 'entrega')

    const r = await m.confirmacion.confirmar(1, 'entrega')

    expect(r).toEqual({ tipo: 'confirmada', mensaje: 'Entrega confirmada. El traslado quedó cerrado.' })
    const [, datos] = entregaLlamada(m)
    expect(datos.fotos.map((f) => f.zona)).toEqual([...ZONAS_ENTREGA])
    expect(datos.fechaEntrega.getTime()).toBe(6_000)
    expect(m.fotos.borradas).toEqual([1])
    expect(m.lista.getSnapshot().mias.find((v) => v.orden.idOrden === 1)).toBeUndefined()
  })

  it('si el servidor dice que la orden nunca salió (422) se muestra su mensaje y no se borra nada', async () => {
    const m = await montar([propia(1, { estado: 'en_transito' })])
    await m.tomarFotos(1, 'entrega')
    m.api.confirmarEntrega = (async () => {
      throw new ApiError('La orden nunca salió: confirma primero la salida.', { status: 422 })
    }) as never

    const r = await m.crear().confirmar(1, 'entrega')

    expect(r).toEqual({ tipo: 'fallida', mensaje: 'La orden nunca salió: confirma primero la salida.' })
    expect(m.fotos.borradas).toEqual([])
  })
})

describe('la orden, antes de confirmar', () => {
  it('una orden que ya no está en la lista: fallida, sin llamar', async () => {
    const m = await montar()
    expect(await m.confirmacion.confirmar(99, 'salida')).toEqual({ tipo: 'fallida', mensaje: 'Esa orden ya no está en tu lista.' })
  })

  it('confirmar la entrega de una orden que todavía está en la salida: fallida, sin llamar', async () => {
    const m = await montar()
    await m.tomarFotos(1, 'entrega')
    expect((await m.confirmacion.confirmar(1, 'entrega')).tipo).toBe('fallida')
    expect(m.api.confirmarEntrega).not.toHaveBeenCalled()
  })

  it('una orden cuya toma se perdió (la tomó otra persona) no se confirma', async () => {
    const m = await montar([ordenRemota(1, conPlaca)])
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1) // queda pendiente
    m.servidor.estado.sinRed = false
    m.servidor.tomarPorOtro(1, 'Ana Pérez')
    await m.lista.actualizar() // al enviarse la toma, el servidor responde 409: pasa a «perdida»
    expect(m.lista.getSnapshot().mias.find((v) => v.orden.idOrden === 1)?.orden.tomaSync).toBe('perdida')
    await m.tomarFotos(1, 'salida')

    const r = await m.confirmacion.confirmar(1, 'salida')

    expect(r).toEqual({ tipo: 'fallida', mensaje: 'Esta orden la tomó otra persona: ya no es tuya.' })
    expect(m.api.confirmarSalida).not.toHaveBeenCalled()
  })

  it('al confirmar la salida se quita la toma guardada en el teléfono', async () => {
    const m = await montar([ordenRemota(1, conPlaca)])
    await m.lista.tomar(1)
    expect(await m.tomas.listar(7)).toHaveLength(1)
    await m.tomarFotos(1, 'salida')

    await m.confirmacion.confirmar(1, 'salida')

    expect(await m.tomas.listar(7)).toEqual([])
  })

  it('dos pulsaciones seguidas comparten una sola confirmación', async () => {
    const m = await montar()
    await m.tomarFotos(1, 'salida')
    const [a, b] = await Promise.all([m.confirmacion.confirmar(1, 'salida'), m.confirmacion.confirmar(1, 'salida')])
    expect(a).toBe(b)
    expect(m.api.confirmarSalida).toHaveBeenCalledTimes(1)
  })

  it('con la toma sin registrar y sin señal no confirma: dice que falta la conexión', async () => {
    const m = await montar([ordenRemota(1, conPlaca)])
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1) // queda pendiente
    await m.tomarFotos(1, 'salida')

    const r = await m.confirmacion.confirmar(1, 'salida')

    expect(r.tipo).toBe('fallida')
    expect(r.mensaje).toMatch(/todavía no se registró/)
    expect(m.api.confirmarSalida).not.toHaveBeenCalled()
  })

  it('con la toma pendiente y señal, la registra ANTES de confirmar', async () => {
    const m = await montar([ordenRemota(1, conPlaca)])
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)
    await m.tomarFotos(1, 'salida')
    m.servidor.estado.sinRed = false

    const r = await m.confirmacion.confirmar(1, 'salida')

    expect(r.tipo).toBe('confirmada')
    const orden = (f: unknown) => (f as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0]!
    expect(orden(m.api.tomarOrden)).toBeLessThan(orden(m.api.confirmarSalida))
  })
})
