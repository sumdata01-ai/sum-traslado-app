// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { ResultadoMisOrdenes } from '../api/trasladoApi'
import { ApiError } from '@/core/http/ApiError'
import type { OrdenCacheada, OrdenRemota } from '../domain'
import { crearListaDePrueba, ordenCacheada, ordenRemota, sinFotos } from './testing/fakes'

const conductor = { id: 7, username: 'ana', nombreCompleto: 'Ana Pérez' }
const remota = ordenRemota
const cacheada = ordenCacheada

function montar(respuesta?: () => Promise<ResultadoMisOrdenes>) {
  const base = crearListaDePrueba(respuesta)
  const snap = () => base.lista.getSnapshot()
  const idsDe = (vistas: readonly { orden: OrdenCacheada }[]) => vistas.map((v) => v.orden.idOrden)
  return { ...base, snap, idsDe }
}

const respuestaCon = (ordenes: OrdenRemota[], descartadas = 0) => async () => ({ ordenes, descartadas })
const redCaida = () => Promise.reject(new ApiError('Sin conexión al backend o internet.'))

describe('AC1 · dos secciones que no se fusionan', () => {
  it('separa las propias (con conductor) del pool (sin dueño)', async () => {
    const m = montar(respuestaCon([remota(1, { conductorAsignado: conductor }), remota(2), remota(3, { conductorAsignado: conductor }), remota(4)]))

    await m.lista.iniciar()

    expect(m.idsDe(m.snap().mias)).toEqual([1, 3])
    expect(m.idsDe(m.snap().pool)).toEqual([2, 4])
  })

  it('una orden que tomé y todavía no se registró cuenta como mía, aunque el servidor no le ponga dueño', async () => {
    const m = montar(respuestaCon([remota(1)]))
    m.tomarOrden.mockRejectedValue(new ApiError('Sin conexión al backend o internet.')) // sigue sin poder enviarse
    await m.tomas.guardar({ idOrden: 1, idUsuario: null, estado: 'pendiente', orden: remota(1), tomadaEn: 1, mensaje: null })

    await m.lista.iniciar()

    expect(m.idsDe(m.snap().mias)).toEqual([1])
    expect(m.idsDe(m.snap().pool)).toEqual([])
  })

  it('respeta el orden en que el servidor entregó las órdenes', async () => {
    const m = montar(respuestaCon([remota(9), remota(2), remota(5)]))
    await m.lista.iniciar()
    expect(m.idsDe(m.snap().pool)).toEqual([9, 2, 5])
  })

  it('el resultado queda guardado en la caché', async () => {
    const m = montar(respuestaCon([remota(1), remota(2)]))
    await m.lista.iniciar()
    expect(m.cache.filas.map((o) => o.idOrden)).toEqual([1, 2])
  })
})

describe('primero lo guardado, después el servidor', () => {
  it('muestra la caché ANTES de que el servidor responda, y marca que está actualizando', async () => {
    let responder: (r: ResultadoMisOrdenes) => void = () => undefined
    const m = montar(() => new Promise<ResultadoMisOrdenes>((resolver) => (responder = resolver)))
    m.cache.filas = [cacheada(1), cacheada(2)]

    const carga = m.lista.iniciar()
    await vi.waitFor(() => expect(m.snap().pool).toHaveLength(2))

    expect(m.snap().cargando).toBe(false)
    expect(m.snap().actualizando).toBe(true)

    responder({ ordenes: [remota(1)], descartadas: 0 })
    await carga
    expect(m.snap().actualizando).toBe(false)
    expect(m.idsDe(m.snap().pool)).toEqual([1])
  })

  it('antes de leer nada está «cargando»', () => {
    expect(montar().snap().cargando).toBe(true)
  })

  it('sin caché y sin órdenes en el servidor, queda vacío pero ya no cargando', async () => {
    const m = montar()
    await m.lista.iniciar()
    expect(m.snap()).toMatchObject({ cargando: false, mias: [], pool: [], sinConexion: false, error: null, sinPermiso: null })
  })
})

describe('AC4 · sin conexión', () => {
  it('con la red caída se siguen mostrando los datos guardados y se avisa', async () => {
    const m = montar(redCaida)
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor }), cacheada(2)]

    await m.lista.iniciar()

    expect(m.snap().sinConexion).toBe(true)
    expect(m.snap().error).toBeNull()
    expect(m.idsDe(m.snap().mias)).toEqual([1])
    expect(m.idsDe(m.snap().pool)).toEqual([2])
    expect(m.cache.filas).toHaveLength(2) // la caché no se tocó
  })

  it('al volver la red la siguiente actualización quita el aviso y refresca los datos', async () => {
    const respuestas: Array<() => Promise<ResultadoMisOrdenes>> = [redCaida, respuestaCon([remota(7)])]
    const m = montar(() => respuestas.shift()!())
    m.cache.filas = [cacheada(1)]
    await m.lista.iniciar()
    expect(m.snap().sinConexion).toBe(true)

    await m.lista.actualizar()

    expect(m.snap().sinConexion).toBe(false)
    expect(m.idsDe(m.snap().pool)).toEqual([7])
  })

  it('«sin conexión» no es lo mismo que un error del servidor', async () => {
    const m = montar(() => Promise.reject(new ApiError('Error interno', { status: 500 })))
    m.cache.filas = [cacheada(1)]

    await m.lista.iniciar()

    expect(m.snap()).toMatchObject({ sinConexion: false, error: 'Error interno' })
    expect(m.idsDe(m.snap().pool)).toEqual([1]) // y también se sigue mostrando lo guardado
  })

  it('una respuesta inesperada del servidor (502) tampoco se muestra como falta de red', async () => {
    const m = montar(() => Promise.reject(new ApiError('Respuesta inesperada del servidor.', { status: 502 })))
    await m.lista.iniciar()
    expect(m.snap()).toMatchObject({ sinConexion: false, error: 'Respuesta inesperada del servidor.' })
  })

  it('un error que no es de la API (algo imprevisto) se muestra con un mensaje general', async () => {
    const m = montar(() => Promise.reject(new TypeError('algo raro')))
    await m.lista.iniciar()
    expect(m.snap().error).toBe('No se pudieron traer tus traslados.')
    expect(m.snap().sinConexion).toBe(false)
  })
})

describe('AC6 · sin permiso (403)', () => {
  it('un 403 se muestra como «sin permiso» con el mensaje del servidor, no como falta de conexión', async () => {
    const m = montar(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))

    await m.lista.iniciar()

    expect(m.snap().sinPermiso).toEqual({ mensaje: 'Permisos insuficientes' })
    expect(m.snap().sinConexion).toBe(false)
    expect(m.snap().error).toBeNull()
  })

  it('no borra la caché', async () => {
    const m = montar(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))
    m.cache.filas = [cacheada(1)]
    await m.lista.iniciar()
    expect(m.cache.filas).toHaveLength(1)
  })

  it('si luego el servidor vuelve a responder bien (por ejemplo, le devolvieron el rol), el aviso se va', async () => {
    const respuestas: Array<() => Promise<ResultadoMisOrdenes>> = [() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })), respuestaCon([remota(1)])]
    const m = montar(() => respuestas.shift()!())
    await m.lista.iniciar()
    expect(m.snap().sinPermiso).not.toBeNull()

    await m.lista.actualizar()

    expect(m.snap().sinPermiso).toBeNull()
    expect(m.idsDe(m.snap().pool)).toEqual([1])
  })
})

describe('AC5 · mezcla con la caché, de punta a punta', () => {
  it('conserva la placa que el operario eligió aunque el servidor la devuelva vacía', async () => {
    const m = montar(respuestaCon([remota(1, { conductorAsignado: conductor, placa: null })]))
    m.cache.filas = [cacheada(1, { placa: { id: 27, codigo: 'ABC-123' }, conductorAsignado: conductor })]

    await m.lista.iniciar()

    expect(m.snap().mias[0]?.orden.placa).toEqual({ id: 27, codigo: 'ABC-123' })
  })

  it('el conductor nulo del servidor la devuelve al pool, aunque antes tuviera dueño', async () => {
    const m = montar(respuestaCon([remota(1, { conductorAsignado: null })]))
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]

    await m.lista.iniciar()

    expect(m.idsDe(m.snap().mias)).toEqual([])
    expect(m.idsDe(m.snap().pool)).toEqual([1])
  })

  it('una orden que el servidor dejó de devolver sale; salvo una con la toma pendiente', async () => {
    const m = montar(respuestaCon([remota(3)]))
    m.cache.filas = [cacheada(1), cacheada(2, { tomaSync: 'pendiente' })]

    await m.lista.iniciar()

    expect(m.cache.filas.map((o) => o.idOrden).sort()).toEqual([2, 3])
  })

  it('cuenta las órdenes que el servidor mandó con datos inválidos', async () => {
    const m = montar(respuestaCon([remota(1)], 3))
    await m.lista.iniciar()
    expect(m.snap().descartadas).toBe(3)
  })
})

describe('AC2 · etiqueta y tono según las fotos de este dispositivo', () => {
  it('una orden sin fotos dice «Sin empezar» en gris; con algunas, «Cargando fotos (n/6)»', async () => {
    const m = montar(respuestaCon([remota(1), remota(2)]))
    m.fotos.mapa.set(2, { ...sinFotos(), salida: { archivo: 3, subidas: 0 } })

    await m.lista.iniciar()

    expect(m.snap().pool[0]).toMatchObject({ etiqueta: 'Sin empezar', tono: 'neutral', fotosTomadas: 0 })
    expect(m.snap().pool[1]).toMatchObject({ etiqueta: 'Cargando fotos (3/6)', tono: 'neutral', fotosTomadas: 3 })
  })

  it('con las 6 fotos sin subir dice «Listo para enviar» en verde', async () => {
    const m = montar(respuestaCon([remota(1)]))
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 6, subidas: 0 } })
    await m.lista.iniciar()
    expect(m.snap().pool[0]).toMatchObject({ etiqueta: 'Listo para enviar', tono: 'success', estadoLocal: 'listaParaEnviar' })
  })

  it('con las 6 ya subidas dice «Enviando…»', async () => {
    const m = montar(respuestaCon([remota(1)]))
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 6, subidas: 6 } })
    await m.lista.iniciar()
    expect(m.snap().pool[0]?.etiqueta).toBe('Enviando…')
  })

  it('una orden en tránsito usa las fotos de la ENTREGA, no las de la salida', async () => {
    const m = montar(respuestaCon([remota(1, { estado: 'en_transito', conductorAsignado: conductor })]))
    m.fotos.mapa.set(1, { salida: { archivo: 6, subidas: 6 }, entrega: { archivo: 5, subidas: 0 } })

    await m.lista.iniciar()

    expect(m.snap().mias[0]).toMatchObject({ etiqueta: 'Entrega lista para enviar', tono: 'success', fotosTomadas: 5 })
  })

  it('una orden en tránsito sin fotos de entrega dice «En tránsito — falta entregar» en azul', async () => {
    const m = montar(respuestaCon([remota(1, { estado: 'en_transito', conductorAsignado: conductor })]))
    await m.lista.iniciar()
    expect(m.snap().mias[0]).toMatchObject({ etiqueta: 'En tránsito — falta entregar', tono: 'info' })
  })

  it('una cancelada dice «Cancelada» en rojo, y sin estado local', async () => {
    const m = montar(respuestaCon([remota(1, { estado: 'cancelada', conductorAsignado: conductor })]))
    await m.lista.iniciar()
    expect(m.snap().mias[0]).toMatchObject({ etiqueta: 'Cancelada', tono: 'danger', estadoLocal: null })
  })

  it('si no se pueden contar las fotos, se muestra la lista igual, como si no hubiera ninguna', async () => {
    const m = montar(respuestaCon([remota(1)]))
    m.fotos.falla = true
    await m.lista.iniciar()
    expect(m.snap().pool[0]?.etiqueta).toBe('Sin empezar')
  })

  it('recalcular actualiza las etiquetas con las fotos que haya ahora, sin pedir nada al servidor', async () => {
    const m = montar(respuestaCon([remota(1)]))
    await m.lista.iniciar()
    expect(m.snap().pool[0]?.etiqueta).toBe('Sin empezar')
    const peticiones = m.misOrdenes.mock.calls.length

    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 2, subidas: 0 } })
    await m.lista.recalcular()

    expect(m.snap().pool[0]?.etiqueta).toBe('Cargando fotos (2/6)')
    expect(m.misOrdenes.mock.calls.length).toBe(peticiones)
  })
})

describe('el contador de avance cuenta solo lo propio', () => {
  it('las órdenes del pool no suman', async () => {
    const m = montar(
      respuestaCon([
        remota(1, { conductorAsignado: conductor }),
        remota(2, { conductorAsignado: conductor, estado: 'en_transito' }),
        remota(3),
        remota(4),
        remota(5),
      ]),
    )
    await m.lista.iniciar()
    expect(m.snap().avance).toEqual({ enviados: 1, porEnviar: 0, sinEmpezar: 1 })
  })

  it('una propia con las 6 fotos cuenta como «por enviar»', async () => {
    const m = montar(respuestaCon([remota(1, { conductorAsignado: conductor })]))
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 6, subidas: 0 } })
    await m.lista.iniciar()
    expect(m.snap().avance).toEqual({ enviados: 0, porEnviar: 1, sinEmpezar: 0 })
  })
})

describe('una sola petición a la vez', () => {
  it('varias actualizaciones simultáneas comparten una sola petición al servidor', async () => {
    let responder: (r: ResultadoMisOrdenes) => void = () => undefined
    const m = montar(() => new Promise<ResultadoMisOrdenes>((resolver) => (responder = resolver)))

    const llamadas = [m.lista.actualizar(), m.lista.actualizar(), m.lista.actualizar()]
    await vi.waitFor(() => expect(m.misOrdenes).toHaveBeenCalled())
    responder({ ordenes: [remota(1)], descartadas: 0 })
    await Promise.all(llamadas)

    expect(m.misOrdenes).toHaveBeenCalledTimes(1)
  })

  it('terminada una, la siguiente actualización sí hace otra petición', async () => {
    const m = montar(respuestaCon([remota(1)]))
    await m.lista.actualizar()
    await m.lista.actualizar()
    expect(m.misOrdenes).toHaveBeenCalledTimes(2)
  })

  it('una actualización que falla no deja bloqueadas las siguientes', async () => {
    const respuestas: Array<() => Promise<ResultadoMisOrdenes>> = [redCaida, respuestaCon([remota(1)])]
    const m = montar(() => respuestas.shift()!())
    await m.lista.actualizar()
    await m.lista.actualizar()
    expect(m.idsDe(m.snap().pool)).toEqual([1])
  })
})

describe('desmontar y volver a montar, y cerrar sesión', () => {
  it('lo que llega después de liberar se descarta y no pisa lo mostrado', async () => {
    let responder: (r: ResultadoMisOrdenes) => void = () => undefined
    const m = montar(() => new Promise<ResultadoMisOrdenes>((resolver) => (responder = resolver)))
    m.cache.filas = [cacheada(1)]
    const carga = m.lista.iniciar()
    await vi.waitFor(() => expect(m.snap().pool).toHaveLength(1))

    m.lista.liberar()
    responder({ ordenes: [remota(50), remota(51)], descartadas: 0 })
    await carga

    expect(m.idsDe(m.snap().pool)).toEqual([1]) // sigue lo de antes
    expect(m.cache.filas.map((o) => o.idOrden)).toEqual([1]) // y no se guardó lo tardío
  })

  it('el modo estricto de React (iniciar, liberar, iniciar) no se queda sin datos', async () => {
    const m = montar(respuestaCon([remota(1), remota(2)]))

    const primera = m.lista.iniciar()
    m.lista.liberar()
    const segunda = m.lista.iniciar()
    await Promise.all([primera, segunda])

    expect(m.idsDe(m.snap().pool)).toEqual([1, 2])
    expect(m.snap().cargando).toBe(false)
  })

  it('vaciar borra la caché y deja la lista como recién abierta, y una respuesta tardía no la rellena', async () => {
    let responder: (r: ResultadoMisOrdenes) => void = () => undefined
    const m = montar(() => new Promise<ResultadoMisOrdenes>((resolver) => (responder = resolver)))
    m.cache.filas = [cacheada(1)]
    const carga = m.lista.iniciar()
    await vi.waitFor(() => expect(m.snap().pool).toHaveLength(1))

    await m.lista.vaciar()
    responder({ ordenes: [remota(9)], descartadas: 0 })
    await carga

    expect(m.cache.vaciadas).toBe(1)
    expect(m.cache.filas).toEqual([])
    expect(m.snap().pool).toEqual([])
    expect(m.snap().mias).toEqual([])
  })
})

describe('el disco no es imprescindible', () => {
  it('si no se puede leer la caché, igual se pide al servidor y se muestra', async () => {
    const m = montar(respuestaCon([remota(1)]))
    m.cache.falla.leer = true
    await m.lista.iniciar()
    expect(m.idsDe(m.snap().pool)).toEqual([1])
    expect(m.snap().cargando).toBe(false)
  })

  it('si no se puede escribir la caché, igual se muestra lo que trajo el servidor', async () => {
    const m = montar(respuestaCon([remota(1)]))
    m.cache.falla.reemplazar = true
    await m.lista.iniciar()
    expect(m.idsDe(m.snap().pool)).toEqual([1])
    expect(m.snap().error).toBeNull()
  })
})

describe('suscripción', () => {
  it('avisa de los cambios y la foto del estado solo cambia de identidad cuando algo cambia', async () => {
    const m = montar(respuestaCon([remota(1)]))
    const aviso = vi.fn()
    const baja = m.lista.suscribir(aviso)
    const antes = m.snap()
    expect(m.snap()).toBe(antes)

    await m.lista.iniciar()
    expect(aviso).toHaveBeenCalled()
    expect(m.snap()).not.toBe(antes)

    baja()
    aviso.mockClear()
    await m.lista.actualizar()
    expect(aviso).not.toHaveBeenCalled()
  })
})

describe('A-03 · lo guardado tiene dueño', () => {
  const A = 7
  const B = 8

  it('las órdenes guardadas de la misma persona se muestran como siempre', async () => {
    const m = montar(redCaida)
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]
    m.dueno.fijar(A)

    await m.lista.iniciar(A)

    expect(m.idsDe(m.snap().mias)).toEqual([1])
  })

  it('las de otra persona no se muestran y se borran, aunque no haya red', async () => {
    const m = montar(redCaida)
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]
    m.dueno.fijar(A)

    await m.lista.iniciar(B)

    expect(m.snap().mias).toEqual([])
    expect(m.cache.filas).toEqual([])
  })

  it('si no se sabe de quién son, tampoco se muestran', async () => {
    const m = montar(redCaida)
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]

    await m.lista.iniciar(B)

    expect(m.snap().mias).toEqual([])
  })

  it('lo que llega del servidor queda guardado a nombre de quien tiene la sesión', async () => {
    const m = montar(respuestaCon([remota(5)]))
    await m.lista.iniciar(B)
    expect(m.dueno.leer()).toBe(B)
  })

  it('al cerrar sesión lo guardado queda sin dueño', async () => {
    const m = montar(respuestaCon([remota(5)]))
    await m.lista.iniciar(A)
    await m.lista.vaciar()
    expect(m.dueno.leer()).toBeNull()
  })

  it('al cambiar de persona, lo que se veía desaparece de inmediato, antes de leer nada', async () => {
    const m = montar(respuestaCon([remota(5, { conductorAsignado: conductor })]))
    await m.lista.iniciar(A)
    expect(m.snap().mias).toHaveLength(1)

    const carga = m.lista.iniciar(B) // sin esperar
    expect(m.snap().mias).toEqual([])
    expect(m.snap().cargando).toBe(true)
    await carga
  })

  it('una respuesta de la sesión anterior que llega tarde no queda guardada a nombre de la nueva', async () => {
    let responder: (r: ResultadoMisOrdenes) => void = () => undefined
    const respuestas: Array<() => Promise<ResultadoMisOrdenes>> = [
      () => new Promise<ResultadoMisOrdenes>((resolver) => (responder = resolver)),
      respuestaCon([remota(20)]),
    ]
    const m = montar(() => respuestas.shift()!())
    const deA = m.lista.iniciar(A)
    await vi.waitFor(() => expect(m.misOrdenes).toHaveBeenCalledTimes(1))

    m.lista.liberar() // la home de A se desmonta
    await m.lista.iniciar(B)
    responder({ ordenes: [remota(1, { conductorAsignado: conductor })], descartadas: 0 }) // la de A, tarde
    await deA

    expect(m.cache.filas.map((o) => o.idOrden)).toEqual([20])
    expect(m.dueno.leer()).toBe(B)
    expect(m.idsDe(m.snap().pool)).toEqual([20])
  })
})

describe('(d) cerrar sesión mientras se guarda lo que trajo el servidor', () => {
  /** Una caché cuya lectura número `n` espera a que la prueba la suelte. */
  function conLecturaRetenida(m: ReturnType<typeof montar>, n: number) {
    let lecturas = 0
    let soltar: () => void = () => undefined
    const leer = m.cache.leer.bind(m.cache)
    m.cache.leer = async () => {
      lecturas++
      if (lecturas === n) await new Promise<void>((resolver) => (soltar = resolver))
      return leer()
    }
    return () => soltar()
  }

  it('un cierre de sesión entre leer y guardar gana: la caché queda vacía, no con las órdenes de la cuenta anterior', async () => {
    const m = montar(respuestaCon([remota(1, { conductorAsignado: conductor })]))
    const soltarLectura = conLecturaRetenida(m, 2) // la 1.ª es la de iniciar; la 2.ª, la de la actualización
    const carga = m.lista.iniciar()
    await vi.waitFor(() => expect(m.misOrdenes).toHaveBeenCalled())
    await new Promise((resolver) => setTimeout(resolver, 0))

    await m.lista.vaciar()
    soltarLectura()
    await carga

    expect(m.cache.filas).toEqual([])
    expect(m.snap().mias).toEqual([])
    expect(m.marca.activa()).toBe(false) // el borrado funcionó
  })

  it('una actualización que termina de guardar DESPUÉS de un cierre de sesión fallido no quita la marca', async () => {
    const m = montar(respuestaCon([remota(1)]))
    let soltarEscritura: () => void = () => undefined
    const reemplazar = m.cache.reemplazar.bind(m.cache)
    m.cache.reemplazar = async (ordenes) => {
      await new Promise<void>((resolver) => (soltarEscritura = resolver))
      return reemplazar(ordenes)
    }
    m.cache.vaciar = () => Promise.reject(new Error('IndexedDB bloqueada'))
    const carga = m.lista.iniciar()
    await vi.waitFor(() => expect(m.misOrdenes).toHaveBeenCalled())
    await new Promise((resolver) => setTimeout(resolver, 0))

    await m.lista.vaciar() // falla: la marca queda puesta
    soltarEscritura()
    await carga

    expect(m.marca.activa()).toBe(true)
  })
})

describe('(e) un borrado de la caché que falla no se oculta', () => {
  const bloquearBorrado = (m: ReturnType<typeof montar>) => {
    m.cache.vaciar = () => Promise.reject(new Error('IndexedDB bloqueada'))
  }

  it('al cerrar sesión la pantalla queda vacía y queda la marca de limpieza pendiente', async () => {
    const m = montar()
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]
    bloquearBorrado(m)

    await m.lista.vaciar()

    expect(m.snap().mias).toEqual([])
    expect(m.marca.activa()).toBe(true)
    expect(m.cache.filas).toHaveLength(1) // sigue en el disco: por eso la marca
  })

  it('la siguiente cuenta, sin red, NO ve las órdenes de la anterior', async () => {
    const m = montar(redCaida)
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]
    bloquearBorrado(m)
    await m.lista.vaciar()

    await m.lista.iniciar() // entra otra persona

    expect(m.snap().mias).toEqual([])
    expect(m.snap().pool).toEqual([])
    expect(m.snap().sinConexion).toBe(true)
  })

  it('al volver a abrir se reintenta el borrado; si ahora funciona, se quita la marca y todo sigue normal', async () => {
    const m = montar(respuestaCon([remota(5)]))
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]
    m.marca.poner()

    await m.lista.iniciar()

    expect(m.marca.activa()).toBe(false)
    expect(m.idsDe(m.snap().pool)).toEqual([5])
    expect(m.cache.filas.map((o) => o.idOrden)).toEqual([5])
  })

  it('si el borrado sigue fallando pero se puede guardar lo nuevo, eso reemplaza lo de la otra cuenta y quita la marca', async () => {
    const m = montar(respuestaCon([remota(5)]))
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })]
    bloquearBorrado(m)
    await m.lista.vaciar()

    await m.lista.iniciar()

    expect(m.cache.filas.map((o) => o.idOrden)).toEqual([5])
    expect(m.marca.activa()).toBe(false)
  })

  it('si tampoco se puede guardar, se muestra lo del servidor sin mezclarlo con lo de la otra cuenta', async () => {
    const m = montar(respuestaCon([remota(5)]))
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor, tomaSync: 'pendiente' })] // la mezcla la conservaría
    bloquearBorrado(m)
    m.cache.falla.reemplazar = true
    await m.lista.vaciar()

    await m.lista.iniciar()

    expect(m.idsDe(m.snap().pool)).toEqual([5])
    expect(m.snap().mias).toEqual([])
    expect(m.marca.activa()).toBe(true)
  })

  it('recalcular con la marca puesta no trae lo guardado: usa lo que ya está en pantalla', async () => {
    const m = montar(respuestaCon([remota(5)]))
    bloquearBorrado(m)
    m.cache.falla.reemplazar = true
    await m.lista.vaciar()
    await m.lista.iniciar()
    m.cache.filas = [cacheada(1, { conductorAsignado: conductor })] // lo de la otra cuenta sigue en el disco

    await m.lista.recalcular()

    expect(m.idsDe(m.snap().pool)).toEqual([5])
    expect(m.snap().mias).toEqual([])
  })

  it('recalcular sin poder leer el disco no vacía la pantalla', async () => {
    const m = montar(respuestaCon([remota(5)]))
    await m.lista.iniciar()
    m.cache.falla.leer = true

    await m.lista.recalcular()

    expect(m.idsDe(m.snap().pool)).toEqual([5])
  })
})
