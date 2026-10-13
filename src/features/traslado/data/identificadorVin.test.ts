// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import type { CandidatosLeidos, TrasladoApi, VinIdentificado } from '../api/trasladoApi'
import type { OrdenRemota } from '../domain'
import { IdentificadorVin } from './identificadorVin'
import { ordenRemota } from './testing/fakes'

const VIN = 'LSCABN3E2VE840638'
const YO = 7
const ana = { id: 8, username: 'ana', nombreCompleto: 'Ana Pérez' }
const yo = { id: YO, username: 'yo', nombreCompleto: 'Yo' }

const candidatos = (...vins: string[]): CandidatosLeidos => ({ candidatos: vins.map((vin) => ({ vin, marca: 'CHANGAN', modelo: 'CS35' })), descartados: 0 })
const identificado = (ordenes: OrdenRemota[], vin = VIN): VinIdentificado => ({ vin, ordenes, descartadas: 0 })

function montar(opciones: { buscar?: () => Promise<CandidatosLeidos>; identificar?: (vin: string) => Promise<VinIdentificado> } = {}) {
  const buscarVin = vi.fn(opciones.buscar ?? (async () => candidatos()))
  const identificarVin = vi.fn(opciones.identificar ?? (async (vin: string) => identificado([], vin)))
  const api = { buscarVin, identificarVin } as unknown as TrasladoApi
  const identificador = new IdentificadorVin({ api })
  return { identificador, buscarVin, identificarVin, resultado: () => identificador.getSnapshot().resultado }
}

const red = () => Promise.reject(new ApiError('Sin conexión al backend o internet.'))
const fallo = (status: number, mensaje: string) => () => Promise.reject(new ApiError(mensaje, { status }))

describe('AC5 · menos de 4 caracteres no llama al servidor', () => {
  it.each(['', 'a', 'ab', 'abc', ' a b c '])('%j → «muy corto», sin ninguna consulta', async (texto) => {
    const m = montar()
    await m.identificador.buscar(texto, YO)
    expect(m.resultado()).toEqual({ tipo: 'muyCorto' })
    expect(m.buscarVin).not.toHaveBeenCalled()
    expect(m.identificarVin).not.toHaveBeenCalled()
  })

  it('con 4 sí busca', async () => {
    const m = montar()
    await m.identificador.buscar('lsca', YO)
    expect(m.buscarVin).toHaveBeenCalledWith('LSCA')
  })
})

describe('un VIN completo se identifica directo', () => {
  it('17 caracteres válidos van a /vin sin pasar por la búsqueda parcial; se normalizan', async () => {
    const m = montar()
    await m.identificador.buscar(` ${VIN.toLowerCase()} `, YO)
    expect(m.identificarVin).toHaveBeenCalledWith(VIN)
    expect(m.buscarVin).not.toHaveBeenCalled()
  })

  it('17 caracteres que no son un VIN (una O por un 0) avisan sin llamar al servidor', async () => {
    const m = montar()
    await m.identificador.buscar('LSCABN3E2VE84063O', YO)
    expect(m.resultado()).toEqual({ tipo: 'formatoInvalido', texto: 'LSCABN3E2VE84063O' })
    expect(m.buscarVin).not.toHaveBeenCalled()
    expect(m.identificarVin).not.toHaveBeenCalled()
  })
})

describe('los resultados de identificar un VIN', () => {
  it('AC2 · 404: «no conocido»', async () => {
    const m = montar({ identificar: fallo(404, 'no está registrado como vehículo') })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'noConocido', vin: VIN })
  })

  it('AC3 · 200 con la lista vacía: «sin orden», distinto de «no conocido»', async () => {
    const m = montar({ identificar: async (vin) => identificado([], vin) })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'sinOrden', vin: VIN })
  })

  it('AC4 · 422: «formato inválido»', async () => {
    const m = montar({ identificar: fallo(422, 'VIN inválido') })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'formatoInvalido', texto: VIN })
  })

  it('con órdenes: cada una dice si es del pool, mía o de otro', async () => {
    const delPool = ordenRemota(1, { vin: VIN })
    const mia = ordenRemota(2, { vin: VIN, conductorAsignado: yo })
    const deOtro = ordenRemota(3, { vin: VIN, conductorAsignado: ana })
    const m = montar({ identificar: async () => identificado([delPool, mia, deOtro]) })

    await m.identificador.buscar(VIN, YO)

    expect(m.resultado()).toEqual({
      tipo: 'ordenes',
      vin: VIN,
      ordenes: [
        { orden: delPool, relacion: 'delPool' },
        { orden: mia, relacion: 'mia' },
        { orden: deOtro, relacion: 'deOtro' },
      ],
    })
  })

  it('si no se sabe quién soy, una orden con conductor NO se da por mía', async () => {
    const m = montar({ identificar: async () => identificado([ordenRemota(2, { vin: VIN, conductorAsignado: yo })]) })
    await m.identificador.buscar(VIN, null)
    expect(m.resultado()).toMatchObject({ ordenes: [{ relacion: 'deOtro' }] })
  })
})

describe('la búsqueda parcial', () => {
  it('varios candidatos: se elige uno, sin consultar todavía el VIN', async () => {
    const m = montar({ buscar: async () => candidatos(`${VIN.slice(0, 16)}8`, `${VIN.slice(0, 16)}9`) })
    await m.identificador.buscar('lscabn', YO)
    const resultado = m.resultado()
    expect(resultado).toMatchObject({ tipo: 'candidatos', texto: 'LSCABN' })
    if (resultado.tipo === 'candidatos') expect(resultado.candidatos).toHaveLength(2)
    expect(m.identificarVin).not.toHaveBeenCalled()
  })

  it('un solo candidato se identifica enseguida, sin pedir otro toque', async () => {
    const m = montar({ buscar: async () => candidatos(VIN), identificar: async () => identificado([ordenRemota(1, { vin: VIN })]) })
    await m.identificador.buscar('lscabn', YO)
    expect(m.identificarVin).toHaveBeenCalledWith(VIN)
    expect(m.resultado()).toMatchObject({ tipo: 'ordenes', vin: VIN })
  })

  it('ninguno: «sin coincidencias»', async () => {
    const m = montar({ buscar: async () => candidatos() })
    await m.identificador.buscar('zzzz', YO)
    expect(m.resultado()).toEqual({ tipo: 'sinCoincidencias', texto: 'ZZZZ' })
  })

  it('elegir un candidato lo identifica', async () => {
    const m = montar({ buscar: async () => candidatos(`${VIN.slice(0, 16)}8`, `${VIN.slice(0, 16)}9`) })
    await m.identificador.buscar('lscabn', YO)
    await m.identificador.identificar(`${VIN.slice(0, 16)}9`.toLowerCase(), YO)
    expect(m.identificarVin).toHaveBeenCalledWith(`${VIN.slice(0, 16)}9`)
  })

  it('un 404 en la búsqueda parcial NO se dice «no conocido»: es un error del servidor', async () => {
    const m = montar({ buscar: fallo(404, 'Not Found') })
    await m.identificador.buscar('lsca', YO)
    expect(m.resultado()).toEqual({ tipo: 'error', mensaje: 'Not Found' })
  })
})

describe('los fallos', () => {
  it('sin red: «sin conexión», en la búsqueda parcial y en la exacta', async () => {
    const a = montar({ buscar: red })
    await a.identificador.buscar('lsca', YO)
    expect(a.resultado()).toEqual({ tipo: 'sinConexion' })

    const b = montar({ identificar: red })
    await b.identificador.buscar(VIN, YO)
    expect(b.resultado()).toEqual({ tipo: 'sinConexion' })
  })

  it('un 403 es «sin permiso», con el mensaje del servidor', async () => {
    const m = montar({ identificar: fallo(403, 'Permisos insuficientes') })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'sinPermiso', mensaje: 'Permisos insuficientes' })
  })

  it('un error del servidor se muestra con su mensaje; uno imprevisto, con un mensaje general', async () => {
    const a = montar({ identificar: fallo(500, 'Error interno') })
    await a.identificador.buscar(VIN, YO)
    expect(a.resultado()).toEqual({ tipo: 'error', mensaje: 'Error interno' })

    const b = montar({ identificar: () => Promise.reject(new TypeError('raro')) })
    await b.identificador.buscar(VIN, YO)
    expect(b.resultado()).toEqual({ tipo: 'error', mensaje: 'No se pudo consultar el sistema.' })
  })
})

describe('respuestas tardías y cancelar', () => {
  it('mientras se espera dice «buscando»', async () => {
    let responder: (v: VinIdentificado) => void = () => undefined
    const m = montar({ identificar: () => new Promise<VinIdentificado>((r) => (responder = r)) })
    const busqueda = m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'buscando' })
    responder(identificado([]))
    await busqueda
  })

  it('una respuesta que llega después de cancelar se descarta', async () => {
    let responder: (v: VinIdentificado) => void = () => undefined
    const m = montar({ identificar: () => new Promise<VinIdentificado>((r) => (responder = r)) })
    const busqueda = m.identificador.buscar(VIN, YO)

    m.identificador.cancelar()
    responder(identificado([ordenRemota(1, { vin: VIN })]))
    await busqueda

    expect(m.resultado()).toEqual({ tipo: 'inactivo' })
  })

  it('una respuesta vieja no pisa a la búsqueda más nueva', async () => {
    const respuestas: Array<(v: VinIdentificado) => void> = []
    const m = montar({ identificar: () => new Promise<VinIdentificado>((r) => respuestas.push(r)) })
    const otroVin = '1HGCM82633A004352'
    const primera = m.identificador.buscar(VIN, YO)
    const segunda = m.identificador.buscar(otroVin, YO)

    respuestas[1]?.(identificado([ordenRemota(2, { vin: otroVin })], otroVin)) // la nueva contesta primero
    respuestas[0]?.(identificado([ordenRemota(1, { vin: VIN })])) // la vieja llega tarde
    await Promise.all([primera, segunda])

    expect(m.resultado()).toMatchObject({ tipo: 'ordenes', vin: otroVin })
  })

  it('un fallo tardío tampoco pisa lo nuevo', async () => {
    let fallar: (e: unknown) => void = () => undefined
    const m = montar({ buscar: () => new Promise<CandidatosLeidos>((_ok, no) => (fallar = no)) })
    const busqueda = m.identificador.buscar('lsca', YO)
    m.identificador.cancelar()
    fallar(new ApiError('Sin conexión al backend o internet.'))
    await busqueda
    expect(m.resultado()).toEqual({ tipo: 'inactivo' })
  })

  it('un fallo tardío al identificar un VIN exacto tampoco pisa lo nuevo (ni se queda «sin conexión» de una búsqueda ya cerrada)', async () => {
    let fallar: (e: unknown) => void = () => undefined
    const m = montar({ identificar: () => new Promise<VinIdentificado>((_ok, no) => (fallar = no)) })
    const busqueda = m.identificador.buscar(VIN, YO)
    m.identificador.cancelar()
    fallar(new ApiError('Sin conexión al backend o internet.'))
    await busqueda
    expect(m.resultado()).toEqual({ tipo: 'inactivo' })
  })

  it('un fallo tardío de la búsqueda vieja no pisa el resultado de la nueva', async () => {
    const fallos: Array<(e: unknown) => void> = []
    const m = montar({
      identificar: (vin) => (vin === VIN ? new Promise<VinIdentificado>((_ok, no) => fallos.push(no)) : Promise.resolve(identificado([], vin))),
    })
    const otroVin = '1HGCM82633A004352'
    const primera = m.identificador.buscar(VIN, YO)
    await m.identificador.buscar(otroVin, YO) // la nueva termina bien: «sin orden»

    fallos[0]?.(new ApiError('Error interno', { status: 500 })) // la vieja falla después
    await primera

    expect(m.resultado()).toEqual({ tipo: 'sinOrden', vin: otroVin })
  })

  it('cancelar sin nada abierto no avisa de nada', () => {
    const m = montar()
    const aviso = vi.fn()
    m.identificador.suscribir(aviso)
    m.identificador.cancelar()
    expect(aviso).not.toHaveBeenCalled()
  })
})

describe('suscripción', () => {
  it('avisa de los cambios y deja de avisar al darse de baja', async () => {
    const m = montar()
    const aviso = vi.fn()
    const baja = m.identificador.suscribir(aviso)
    await m.identificador.buscar(VIN, YO)
    expect(aviso).toHaveBeenCalled()
    baja()
    aviso.mockClear()
    await m.identificador.buscar(VIN, YO)
    expect(aviso).not.toHaveBeenCalled()
  })
})

describe('orden que ya no está pendiente (en tránsito, entregada, cancelada)', () => {
  const frank = { id: 303, username: 'frank', nombreCompleto: 'Frank Xavier Cavero Ruiz' }
  const otra = (extra: Partial<import('../domain').OtraOrdenDeVin> = {}): import('../domain').OtraOrdenDeVin => ({
    idOrden: 9001,
    estado: 'en_transito',
    conductorAsignado: frank,
    fechaSalida: '2026-10-13T15:57:00Z',
    fechaEntrega: null,
    ...extra,
  })
  const conOtras = (otras: import('../domain').OtraOrdenDeVin[]) => async (vin: string): Promise<VinIdentificado> => ({ vin, ordenes: [], descartadas: 0, otras })

  it('sin pendientes pero con una orden que ya salió → «yaTomada» con quién la tiene (no «sin orden»)', async () => {
    const m = montar({ identificar: conOtras([otra()]) })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'yaTomada', vin: VIN, otras: [{ orden: otra(), relacion: 'deOtro' }] })
  })

  it('si la tiene quien busca, la relación es «mia»', async () => {
    const m = montar({ identificar: conOtras([otra({ conductorAsignado: yo })]) })
    await m.identificador.buscar(VIN, YO)
    const r = m.resultado()
    expect(r.tipo === 'yaTomada' && r.otras[0]?.relacion).toBe('mia')
  })

  it('sin conductor asignado la relación es «delPool»', async () => {
    const m = montar({ identificar: conOtras([otra({ conductorAsignado: null })]) })
    await m.identificador.buscar(VIN, YO)
    const r = m.resultado()
    expect(r.tipo === 'yaTomada' && r.otras[0]?.relacion).toBe('delPool')
  })

  it('con una orden PENDIENTE se muestra esa: lo que se puede hacer manda sobre el historial', async () => {
    const m = montar({ identificar: async (vin) => ({ vin, ordenes: [ordenRemota(1, { vin, conductorAsignado: ana })], descartadas: 0, otras: [otra()] }) })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado().tipo).toBe('ordenes')
  })

  it('sin pendientes ni otras sigue siendo «sin orden»', async () => {
    const m = montar({ identificar: conOtras([]) })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'sinOrden', vin: VIN })
  })

  it('un servidor que no manda el campo (hoy) sigue dando «sin orden»', async () => {
    const m = montar({ identificar: async (vin) => ({ vin, ordenes: [], descartadas: 0 }) })
    await m.identificador.buscar(VIN, YO)
    expect(m.resultado()).toEqual({ tipo: 'sinOrden', vin: VIN })
  })

  it('también cuando se llega por la búsqueda parcial con un solo candidato', async () => {
    const m = montar({ buscar: async () => candidatos(VIN), identificar: conOtras([otra()]) })
    await m.identificador.buscar('lsca', YO)
    expect(m.resultado().tipo).toBe('yaTomada')
  })
})
