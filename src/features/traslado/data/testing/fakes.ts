import { vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import type { Catalogos, Conductor, Momento, OrdenCacheada, OrdenRemota } from '../../domain'
import type { ResultadoMisOrdenes, TrasladoApi } from '../../api/trasladoApi'
import { CatalogoEnMemoria } from '../catalogoCache'
import { CatalogoTraslado } from '../catalogoTraslado'
import { IdentificadorVin } from '../identificadorVin'
import type { ConteoDeFotos, ConteoFotosPort } from '../conteoFotos'
import { ListaOrdenes } from '../listaOrdenes'
import { DuenoEnMemoria } from '../duenoCache'
import { EleccionesEnMemoria } from '../eleccionesStore'
import { MarcaEnMemoria } from '../marcaLimpieza'
import { TomasEnMemoria } from '../tomasStore'
import type { OrdenesCachePort } from '../ordenesCache'

/** Dobles para probar la lista de órdenes y las pantallas que la usan, sin IndexedDB ni red. */

export class CacheEnMemoria implements OrdenesCachePort {
  filas: OrdenCacheada[] = []
  falla: { leer?: boolean; reemplazar?: boolean } = {}
  vaciadas = 0
  async leer() {
    if (this.falla.leer) throw new Error('IndexedDB no disponible')
    return [...this.filas]
  }
  async reemplazar(ordenes: readonly OrdenCacheada[]) {
    if (this.falla.reemplazar) throw new Error('disco lleno')
    this.filas = [...ordenes]
  }
  async vaciar() {
    this.vaciadas++
    this.filas = []
  }
}

export class ConteoFalso implements ConteoFotosPort {
  mapa = new Map<number, ConteoDeFotos>()
  falla = false
  async contar() {
    if (this.falla) throw new Error('sin acceso a las fotos')
    return this.mapa
  }
  /** Los tramos (`id:momento`) cuyas fotos se borraron por separado, en orden. */
  readonly momentosBorrados: string[] = []
  async borrarDeMomento(ordenId: number, momento: Momento) {
    this.momentosBorrados.push(`${ordenId}:${momento}`)
  }
  /** Las órdenes cuyas fotos se borraron, en orden. */
  readonly borradas: number[] = []
  async borrarDeOrden(ordenId: number) {
    this.borradas.push(ordenId)
    this.mapa.delete(ordenId)
  }
}

export const sinFotos = (): ConteoDeFotos => ({ salida: { archivo: 0, subidas: 0 }, entrega: { archivo: 0, subidas: 0 } })

export const ordenRemota = (idOrden: number, extra: Partial<OrdenRemota> = {}): OrdenRemota => ({
  idOrden,
  vin: `VIN${idOrden}`,
  estado: 'pendiente',
  placa: null,
  proveedor: null,
  destino: { id: 4, nombre: 'Concesionario' },
  conductorAsignado: null,
  fechaCreacion: null,
  ...extra,
})

export const ordenCacheada = (idOrden: number, extra: Partial<OrdenCacheada> = {}): OrdenCacheada => ({
  ...ordenRemota(idOrden),
  tomaSync: null,
  sincronizadaEn: 1,
  ...extra,
})

/** Una `ListaOrdenes` completa con dobles; `respuesta` decide qué contesta el «servidor» en cada petición. */
export function crearListaDePrueba(respuesta: () => Promise<ResultadoMisOrdenes> = async () => ({ ordenes: [], descartadas: 0 })) {
  const misOrdenes = vi.fn(respuesta)
  const tomarOrden = vi.fn(async (idOrden: number) => ({ idOrden, tomada: true }))
  const soltarOrden = vi.fn(async (idOrden: number) => ({ idOrden, tomada: false }))
  const catalogos = vi.fn(async () => ({ placas: [], proveedores: [], descartadas: 0 }))
  const buscarVin = vi.fn(async () => ({ candidatos: [], descartados: 0 }))
  const identificarVin = vi.fn(async (vin: string) => ({ vin, ordenes: [], descartadas: 0 }))
  const confirmarSalida = vi.fn(async (idOrden: number) => ({ resultado: 'confirmada' as const, idOrden, estado: 'en_transito', motivo: null }))
  const confirmarEntrega = vi.fn(async (idOrden: number) => ({ resultado: 'confirmada' as const, idOrden, estado: 'realizado', motivo: null }))
  const api: TrasladoApi = { misOrdenes, catalogos, buscarVin, identificarVin, tomarOrden, soltarOrden, confirmarSalida, confirmarEntrega }
  const cache = new CacheEnMemoria()
  const fotos = new ConteoFalso()
  const marca = new MarcaEnMemoria()
  const dueno = new DuenoEnMemoria()
  const tomas = new TomasEnMemoria()
  const elecciones = new EleccionesEnMemoria()
  const lista = new ListaOrdenes({ api, cache, fotos, marca, dueno, tomas, elecciones, ahora: () => 5_000 })
  return { lista, api, misOrdenes, catalogos, buscarVin, identificarVin, tomarOrden, soltarOrden, confirmarSalida, confirmarEntrega, cache, fotos, marca, dueno, tomas, elecciones }
}


/**
 * Un servidor de órdenes en memoria que recuerda quién tomó cada una, para probar O-02 de punta a
 * punta: `mis-ordenes` devuelve lo propio y el pool, tomar le pone conductor (o 409 si la tiene
 * otra persona) y soltar se lo quita (o 409 si no es suya o ya salió).
 */
export function crearServidorDeOrdenes(inicial: OrdenRemota[], yo: Conductor = { id: 7, username: 'usuario.prueba', nombreCompleto: 'OPERARIO PRUEBA' }) {
  const ordenes = new Map(inicial.map((orden) => [orden.idOrden, { ...orden }]))
  const deOtros = new Map<number, string>()
  const estado = { sinRed: false }
  const sinRed = () => new ApiError('Sin conexión al backend o internet.')

  const api: TrasladoApi = {
    catalogos: vi.fn(async () => {
      if (estado.sinRed) throw sinRed()
      return { placas: [], proveedores: [], descartadas: 0 }
    }),
    buscarVin: vi.fn(async () => {
      if (estado.sinRed) throw sinRed()
      return { candidatos: [], descartados: 0 }
    }),
    identificarVin: vi.fn(async (vin: string) => {
      if (estado.sinRed) throw sinRed()
      return { vin, ordenes: [...ordenes.values()].filter((o) => o.vin === vin && o.estado === 'pendiente').map((o) => ({ ...o })), descartadas: 0 }
    }),
    misOrdenes: vi.fn(async () => {
      if (estado.sinRed) throw sinRed()
      return { ordenes: [...ordenes.values()].map((o) => ({ ...o })), descartadas: 0 }
    }),
    tomarOrden: vi.fn(async (idOrden: number) => {
      if (estado.sinRed) throw sinRed()
      const otro = deOtros.get(idOrden)
      if (otro) throw new ApiError(`La tomó ${otro}`, { status: 409 })
      const orden = ordenes.get(idOrden)
      if (!orden) throw new ApiError('Orden no encontrada', { status: 404 })
      orden.conductorAsignado = yo
      return { idOrden, tomada: true }
    }),
    soltarOrden: vi.fn(async (idOrden: number) => {
      if (estado.sinRed) throw sinRed()
      const orden = ordenes.get(idOrden)
      if (!orden || orden.conductorAsignado === null) throw new ApiError('Esa orden no es tuya', { status: 409 })
      if (orden.estado !== 'pendiente') throw new ApiError('El auto ya salió con esta orden: no se puede devolver al pool', { status: 409 })
      orden.conductorAsignado = null
      return { idOrden, tomada: false }
    }),
    confirmarSalida: vi.fn(async (idOrden: number) => {
      if (estado.sinRed) throw sinRed()
      const orden = ordenes.get(idOrden)
      if (!orden) throw new ApiError('Orden no encontrada', { status: 404 })
      if (orden.estado === 'cancelada') return { resultado: 'descartada_por_supervisor' as const, idOrden, estado: 'cancelada', motivo: 'orden_cancelada' }
      orden.estado = 'en_transito'
      return { resultado: 'confirmada' as const, idOrden, estado: 'en_transito', motivo: null }
    }),
    confirmarEntrega: vi.fn(async (idOrden: number) => {
      if (estado.sinRed) throw sinRed()
      const orden = ordenes.get(idOrden)
      if (!orden) throw new ApiError('Orden no encontrada', { status: 404 })
      if (orden.estado !== 'en_transito') throw new ApiError('La orden nunca salió: confirma primero la salida.', { status: 422 })
      ordenes.delete(idOrden) // `realizado` ya no aparece en mis-ordenes
      return { resultado: 'confirmada' as const, idOrden, estado: 'realizado', motivo: null }
    }),
  }

  return {
    api,
    estado,
    ordenes,
    /** Otra persona la toma: deja de estar en el pool de esta persona y tomarla da 409. */
    tomarPorOtro(idOrden: number, nombre: string) {
      deOtros.set(idOrden, nombre)
      ordenes.delete(idOrden)
    },
  }
}

/** Una `ListaOrdenes` con dobles, contra `crearServidorDeOrdenes`. */
export function crearListaConServidor(inicial: OrdenRemota[], opciones: { idUsuario?: number | null } = {}) {
  const servidor = crearServidorDeOrdenes(inicial)
  const cache = new CacheEnMemoria()
  const fotos = new ConteoFalso()
  const tomas = new TomasEnMemoria()
  const elecciones = new EleccionesEnMemoria()
  const marca = new MarcaEnMemoria()
  const lista = new ListaOrdenes({ api: servidor.api, cache, fotos, tomas, elecciones, marca, ahora: () => 5_000 })
  const idUsuario = opciones.idUsuario === undefined ? 7 : opciones.idUsuario
  return { lista, servidor, cache, fotos, tomas, elecciones, marca, idUsuario }
}

/** Un `CatalogoTraslado` con dobles: `respuesta` es lo que contesta el «servidor». */
export function crearCatalogoDePrueba(catalogos: Catalogos = { placas: [], proveedores: [] }) {
  const cache = new CatalogoEnMemoria()
  const pedir = vi.fn(async () => ({ ...catalogos, descartadas: 0 }))
  const catalogo = new CatalogoTraslado({ api: { catalogos: pedir } as unknown as TrasladoApi, cache })
  return { catalogo, cache, pedir }
}

/** Un `IdentificadorVin` con dobles: `api` permite contestar cada consulta como se necesite. */
export function crearIdentificadorDePrueba(api: Partial<TrasladoApi> = {}) {
  const buscarVin = vi.fn(api.buscarVin ?? (async () => ({ candidatos: [], descartados: 0 })))
  const identificarVin = vi.fn(api.identificarVin ?? (async (vin: string) => ({ vin, ordenes: [], descartadas: 0 })))
  const identificador = new IdentificadorVin({ api: { buscarVin, identificarVin } as unknown as TrasladoApi })
  return { identificador, buscarVin, identificarVin }
}
