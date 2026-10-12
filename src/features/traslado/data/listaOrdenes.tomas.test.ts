// @vitest-environment node
/** O-02 en el controlador: tomar, soltar y las tomas sin señal, contra un servidor simulado. */
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import type { OrdenRemota } from '../domain'
import { crearListaConServidor, ordenRemota, sinFotos } from './testing/fakes'

const pool = (...ids: number[]): OrdenRemota[] => ids.map((id) => ordenRemota(id))

async function montar(inicial: OrdenRemota[] = pool(1, 2), opciones: { idUsuario?: number | null } = {}) {
  const m = crearListaConServidor(inicial, opciones)
  await m.lista.iniciar(m.idUsuario)
  const snap = () => m.lista.getSnapshot()
  const ids = (vistas: readonly { orden: { idOrden: number } }[]) => vistas.map((v) => v.orden.idOrden)
  const vista = (id: number) => [...snap().mias, ...snap().pool].find((v) => v.orden.idOrden === id)
  return { ...m, snap, ids, vista }
}

describe('tomar con conexión', () => {
  it('la orden pasa del pool a «Mis traslados» y queda registrada en el servidor', async () => {
    const m = await montar()

    const resultado = await m.lista.tomar(1)

    expect(resultado).toEqual({ ok: true, mensaje: 'La orden es tuya.' })
    expect(m.ids(m.snap().mias)).toEqual([1])
    expect(m.ids(m.snap().pool)).toEqual([2])
    expect(m.servidor.ordenes.get(1)?.conductorAsignado).not.toBeNull()
  })

  it('una orden tomada aquí se puede soltar; sin aviso de «pendiente»', async () => {
    const m = await montar()
    await m.lista.tomar(1)
    expect(m.vista(1)).toMatchObject({ puedeSoltarse: true, aviso: null })
  })

  it('AC2 · si otra persona se adelantó, dice quién, no la toma y la saca del pool', async () => {
    const m = await montar()
    m.servidor.tomarPorOtro(1, 'Ana Pérez')

    const resultado = await m.lista.tomar(1)

    expect(resultado).toEqual({ ok: false, mensaje: 'La tomó Ana Pérez' })
    expect(m.ids(m.snap().mias)).toEqual([])
    expect(m.ids(m.snap().pool)).toEqual([2])
    expect(m.servidor.api.tomarOrden).toHaveBeenCalledTimes(1) // no se reintenta
  })

  it('un doble toque es una sola toma', async () => {
    const m = await montar()
    const [a, b] = await Promise.all([m.lista.tomar(1), m.lista.tomar(1)])
    expect(a).toEqual(b)
    expect(m.servidor.api.tomarOrden).toHaveBeenCalledTimes(1)
  })

  it('una orden que no está en el pool no se toma', async () => {
    const m = await montar()
    expect(await m.lista.tomar(99)).toEqual({ ok: false, mensaje: 'Esa orden ya no está disponible.' })
    expect(m.servidor.api.tomarOrden).not.toHaveBeenCalled()
  })

  it('un 403 al tomar muestra «sin permiso», sin guardar nada', async () => {
    const m = await montar()
    m.servidor.api.tomarOrden = async () => {
      throw new ApiError('Permisos insuficientes', { status: 403 })
    }

    const resultado = await m.lista.tomar(1)

    expect(resultado.ok).toBe(false)
    expect(m.snap().sinPermiso).toEqual({ mensaje: 'Permisos insuficientes' })
    expect(await m.tomas.listar(7)).toEqual([])
  })
})

describe('O-03 · tomar una orden hallada buscando por VIN, que no está en la lista del teléfono', () => {
  /** Una orden del servidor (por ejemplo, del pool de otro día) que `mis-ordenes` no devolvió. */
  async function conOrdenAjenaALaLista() {
    const m = await montar(pool(1))
    const hallada = ordenRemota(50, { vin: 'LSCABN3E2VE840638' })
    m.servidor.ordenes.set(50, { ...hallada }) // existe en el servidor...
    return { m, hallada }
  }

  it('se toma con la copia hallada y pasa a «Mis traslados»', async () => {
    const m = await montar(pool(1))
    const hallada = ordenRemota(50, { vin: 'HALLADA0000000001' })
    m.servidor.ordenes.set(50, { ...hallada })
    expect(m.ids(m.snap().pool)).not.toContain(50) // la lista no la tenía descargada: se descargó antes de que existiera

    // (la lista del teléfono se refrescó antes de que la orden existiera: ahora se encontró por VIN)
    const resultado = await m.lista.tomar(50, hallada)

    expect(resultado).toEqual({ ok: true, mensaje: 'La orden es tuya.' })
    expect(m.servidor.api.tomarOrden).toHaveBeenCalledWith(50)
    expect(m.ids(m.snap().mias)).toContain(50)
    expect(m.vista(50)).toMatchObject({ puedeSoltarse: true })
  })

  it('sin la copia hallada, una orden que no está en la lista no se toma', async () => {
    const { m } = await conOrdenAjenaALaLista()
    expect(await m.lista.tomar(50)).toEqual({ ok: false, mensaje: 'Esa orden ya no está disponible.' })
    expect(m.servidor.api.tomarOrden).not.toHaveBeenCalled()
  })

  it('una orden hallada que ya tiene dueño NO se toma (no es del pool)', async () => {
    const m = await montar(pool(1))
    const deOtro = ordenRemota(50, { conductorAsignado: { id: 8, username: 'ana', nombreCompleto: 'Ana' } })

    expect(await m.lista.tomar(50, deOtro)).toEqual({ ok: false, mensaje: 'Esa orden ya no está disponible.' })
    expect(m.servidor.api.tomarOrden).not.toHaveBeenCalled()
  })

  it('si otra persona se adelantó (409), lo dice y no queda tomada', async () => {
    const m = await montar(pool(1))
    const hallada = ordenRemota(50)
    m.servidor.tomarPorOtro(50, 'Ana Pérez')

    expect(await m.lista.tomar(50, hallada)).toEqual({ ok: false, mensaje: 'La tomó Ana Pérez' })
    expect(m.ids(m.snap().mias)).not.toContain(50)
  })

  it('sin señal queda pendiente con la copia hallada, y se envía al volver la red', async () => {
    const m = await montar(pool(1))
    const hallada = ordenRemota(50, { vin: 'HALLADA0000000001' })
    m.servidor.ordenes.set(50, { ...hallada })
    m.servidor.estado.sinRed = true

    const resultado = await m.lista.tomar(50, hallada)

    expect(resultado.pendiente).toBe(true)
    expect(m.ids(m.snap().mias)).toContain(50) // se ve aunque la lista no la trajo
    m.servidor.estado.sinRed = false
    await m.lista.actualizar()
    expect(m.servidor.ordenes.get(50)?.conductorAsignado).not.toBeNull()
  })

  it('si la orden del pool ya estaba en la lista, se usa esa y se ignora la copia hallada', async () => {
    const m = await montar(pool(1, 2))
    await m.lista.tomar(1, ordenRemota(1, { vin: 'OTRA-COPIA-VIEJA' }))
    expect(m.vista(1)?.orden.vin).toBe('VIN1')
  })
})

describe('AC4 · tomar sin señal', () => {
  it('queda pendiente, se ve como propia con el aviso, y se puede trabajar', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true

    const resultado = await m.lista.tomar(1)

    expect(resultado).toEqual({ ok: true, mensaje: 'Tomada sin señal: se registra cuando haya conexión.', pendiente: true })
    expect(m.ids(m.snap().mias)).toEqual([1])
    expect(m.vista(1)).toMatchObject({ aviso: 'Tomada sin señal: se registra cuando haya conexión.', puedeSoltarse: true })
    expect(await m.tomas.listar(7)).toMatchObject([{ idOrden: 1, estado: 'pendiente', idUsuario: 7 }])
  })

  it('un error del servidor (5xx) también la deja pendiente: el operario tiene el auto delante', async () => {
    const m = await montar()
    m.servidor.api.tomarOrden = async () => {
      throw new ApiError('Error interno', { status: 500 })
    }
    expect((await m.lista.tomar(1)).ok).toBe(true)
    expect(await m.tomas.listar(7)).toMatchObject([{ estado: 'pendiente' }])
  })

  it('al volver la red, la siguiente actualización la registra en el servidor', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)
    m.servidor.estado.sinRed = false

    await m.lista.actualizar()

    expect(m.servidor.ordenes.get(1)?.conductorAsignado).not.toBeNull()
    expect(await m.tomas.listar(7)).toMatchObject([{ idOrden: 1, estado: 'confirmada' }])
    expect(m.vista(1)?.aviso).toBeNull()
  })

  it('si al enviarla otra persona ya la tenía (409): no se reintenta, la tarjeta dice quién, en rojo, y las fotos se conservan', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 4, subidas: 0 } })
    m.servidor.tomarPorOtro(1, 'Ana Pérez')
    m.servidor.estado.sinRed = false

    await m.lista.actualizar()
    await m.lista.actualizar() // una segunda actualización no vuelve a intentarlo

    expect(m.servidor.api.tomarOrden).toHaveBeenCalledTimes(2) // el intento sin red y el del 409
    expect(m.vista(1)).toMatchObject({ etiqueta: 'La tomó Ana Pérez', tono: 'danger', puedeSoltarse: false })
    expect(m.ids(m.snap().mias)).toEqual([1]) // sigue a la vista aunque el servidor ya no la devuelve
    expect(m.fotos.borradas).toEqual([])
  })

  it('una toma perdida no cuenta en el avance', async () => {
    const m = await montar(pool(1, 2, 3))
    await m.lista.tomar(2)
    await m.lista.tomar(3)
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)
    m.servidor.tomarPorOtro(1, 'Ana Pérez')
    m.servidor.estado.sinRed = false

    await m.lista.actualizar()

    expect(m.snap().avance).toEqual({ enviados: 0, porEnviar: 0, sinEmpezar: 2 })
  })

  it('sin red al actualizar, la toma sigue pendiente y no se marca perdida', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)

    await m.lista.actualizar()

    expect(await m.tomas.listar(7)).toMatchObject([{ estado: 'pendiente' }])
  })

  it('si no se puede guardar en el teléfono, se avisa y no se finge que se tomó', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    m.tomas.falla = true

    const resultado = await m.lista.tomar(1)

    expect(resultado.ok).toBe(false)
    expect(resultado.mensaje).toMatch(/no se pudo guardar/)
  })
})

describe('decisión 1B · la toma pendiente es de quien la hizo y sobrevive a cerrar la sesión', () => {
  it('cerrar la sesión no la borra; al volver la misma persona sigue ahí y se envía', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)

    await m.lista.vaciar() // cierra sesión
    m.servidor.estado.sinRed = false
    await m.lista.iniciar(7) // vuelve a entrar

    expect(m.ids(m.lista.getSnapshot().mias)).toEqual([1])
    expect(m.servidor.ordenes.get(1)?.conductorAsignado).not.toBeNull()
  })

  it('otra persona en el mismo navegador no la ve ni la envía con su sesión', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)
    await m.lista.vaciar()
    m.servidor.estado.sinRed = false

    await m.lista.iniciar(8) // entra otra persona

    expect(m.ids(m.lista.getSnapshot().mias)).toEqual([])
    expect(m.servidor.ordenes.get(1)?.conductorAsignado).toBeNull() // no se tomó a nombre de la otra
    expect(await m.tomas.listar(7)).toHaveLength(1) // la de la primera persona sigue guardada
  })
})

describe('el envío de tomas pendientes respeta la sesión', () => {
  it('si la sesión cambia mientras se envía, las que faltan NO se mandan con el token de la otra persona', async () => {
    const m = await montar(pool(1, 2))
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)
    await m.lista.tomar(2)
    m.servidor.estado.sinRed = false
    // El envío de la primera queda en vuelo; mientras tanto se cierra la sesión.
    let soltarPrimera: () => void = () => undefined
    const original = m.servidor.api.tomarOrden
    m.servidor.api.tomarOrden = async (id) => {
      if (id === 1) await new Promise<void>((r) => (soltarPrimera = r))
      return original(id)
    }

    const actualizacion = m.lista.actualizar()
    await vi.waitFor(() => expect(m.servidor.api.tomarOrden).not.toBe(original))
    await new Promise((r) => setTimeout(r, 0))
    await m.lista.vaciar() // cierra la sesión
    soltarPrimera()
    await actualizacion

    expect(m.servidor.ordenes.get(2)?.conductorAsignado).toBeNull() // la segunda no se envió
    expect(await m.tomas.listar(7)).toMatchObject([{ idOrden: 1 }, { idOrden: 2, estado: 'pendiente' }]) // y sigue pendiente
  })
})

describe('soltar', () => {
  it('una orden tomada con conexión vuelve al pool y el servidor se entera', async () => {
    const m = await montar()
    await m.lista.tomar(1)

    const resultado = await m.lista.soltar(1)

    expect(resultado).toEqual({ ok: true, mensaje: 'Devuelta al pool.' })
    expect(m.ids(m.snap().pool)).toContain(1)
    expect(m.ids(m.snap().mias)).toEqual([])
    expect(m.servidor.ordenes.get(1)?.conductorAsignado).toBeNull()
    expect(await m.tomas.listar(7)).toEqual([])
  })

  it('AC6 · al soltar se borran las fotos de la orden', async () => {
    const m = await montar()
    await m.lista.tomar(1)
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 3, subidas: 0 } })

    await m.lista.soltar(1)

    expect(m.fotos.borradas).toEqual([1])
  })

  it('AC5 · sin red no se suelta: se dice y no cambia nada', async () => {
    const m = await montar()
    await m.lista.tomar(1)
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 3, subidas: 0 } })
    m.servidor.estado.sinRed = true

    const resultado = await m.lista.soltar(1)

    expect(resultado).toEqual({ ok: false, mensaje: 'Sin conexión: no se pudo devolver al pool.' })
    expect(m.ids(m.snap().mias)).toEqual([1])
    expect(m.fotos.borradas).toEqual([])
  })

  it('AC5 · una toma que nunca llegó al servidor se cancela sin red', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    await m.lista.tomar(1)

    const resultado = await m.lista.soltar(1)

    expect(resultado).toEqual({ ok: true, mensaje: 'Toma cancelada: la orden vuelve a estar disponible.' })
    expect(m.servidor.api.soltarOrden).not.toHaveBeenCalled()
    expect(await m.tomas.listar(7)).toEqual([])
    expect(m.ids(m.snap().pool)).toContain(1)
  })

  it('AC5 · si el servidor dice que ya salió (409), se muestra el motivo', async () => {
    const m = await montar()
    await m.lista.tomar(1)
    m.servidor.ordenes.get(1)!.estado = 'en_transito' // salió desde otro dispositivo

    // la lista todavía la muestra como pendiente: se intenta y el servidor lo rechaza
    const resultado = await m.lista.soltar(1)

    expect(resultado.ok).toBe(false)
    expect(resultado.mensaje).toMatch(/ya salió/)
    expect(m.fotos.borradas).toEqual([])
  })

  it('AC7 · una orden asignada por el supervisor no se ofrece para soltar ni se suelta', async () => {
    const m = await montar([ordenRemota(1, { conductorAsignado: { id: 7, username: 'usuario.prueba', nombreCompleto: null } })])

    expect(m.vista(1)?.puedeSoltarse).toBe(false)
    expect(await m.lista.soltar(1)).toEqual({ ok: false, mensaje: 'Esta orden no se puede devolver desde aquí.' })
    expect(m.servidor.api.soltarOrden).not.toHaveBeenCalled()
  })

  it('una orden que ya salió no se ofrece para soltar', async () => {
    const m = await montar()
    await m.lista.tomar(1)
    m.servidor.ordenes.get(1)!.estado = 'en_transito'

    await m.lista.actualizar()

    expect(m.vista(1)?.puedeSoltarse).toBe(false)
  })
})

describe('reconciliación con el servidor', () => {
  it('si el supervisor la liberó, deja de ser «tomada aquí» y vuelve al pool', async () => {
    const m = await montar()
    await m.lista.tomar(1)
    m.servidor.ordenes.get(1)!.conductorAsignado = null // el supervisor la liberó

    await m.lista.actualizar()

    expect(m.ids(m.snap().pool)).toContain(1)
    expect(await m.tomas.listar(7)).toEqual([])
  })
})
