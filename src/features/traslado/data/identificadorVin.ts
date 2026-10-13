import { ApiError } from '@/core/http/ApiError'
import type { TrasladoApi } from '../api/trasladoApi'
import { type CandidatoVin, type OrdenRemota, type OtraOrdenDeVin, type RelacionConLaOrden, normalizarVin, relacionConLaOrden, tipoDeBusqueda } from '../domain'

/** Una orden hallada por VIN, con su relación con quien busca. */
export interface OrdenEncontrada {
  orden: OrdenRemota
  relacion: RelacionConLaOrden
}

/**
 * Qué resultó de «buscar en el sistema» (O-03). Cada caso tiene su propio estado porque se dicen cosas
 * distintas y mandan a hacer cosas distintas: «no existe ese vehículo» no es «existe pero no tiene orden».
 */
/** Una orden del VIN que ya salió, se entregó o se canceló, y qué relación tiene con quien busca. */
export interface OtraOrdenEncontrada {
  orden: OtraOrdenDeVin
  relacion: RelacionConLaOrden
}

export type ResultadoBusqueda =
  | { tipo: 'inactivo' }
  | { tipo: 'buscando' }
  /** Menos de 4 caracteres: no se llamó al servidor. */
  | { tipo: 'muyCorto' }
  /** Hay varios vehículos posibles: se elige uno. */
  | { tipo: 'candidatos'; texto: string; candidatos: readonly CandidatoVin[] }
  | { tipo: 'sinCoincidencias'; texto: string }
  /** 404: el VIN no es un vehículo conocido. */
  | { tipo: 'noConocido'; vin: string }
  /** 200 con lista vacía: el vehículo existe, pero no tiene una orden pendiente. */
  | { tipo: 'sinOrden'; vin: string }
  /** No hay pendientes, pero el servidor dice que ya hubo una orden que salió, se entregó o se canceló. */
  | { tipo: 'yaTomada'; vin: string; otras: readonly OtraOrdenEncontrada[] }
  /** 422 del servidor, o un texto que ya se ve que no es un VIN. */
  | { tipo: 'formatoInvalido'; texto: string }
  | { tipo: 'ordenes'; vin: string; ordenes: readonly OrdenEncontrada[] }
  | { tipo: 'sinConexion' }
  | { tipo: 'sinPermiso'; mensaje: string }
  | { tipo: 'error'; mensaje: string }

export interface InstantaneaBusqueda {
  readonly resultado: ResultadoBusqueda
}

const INACTIVO: InstantaneaBusqueda = { resultado: { tipo: 'inactivo' } }

/**
 * La búsqueda de un vehículo en el sistema cuando no está en la lista del teléfono (O-03).
 *
 * - **Menos de 4 caracteres no llaman al servidor** (el endpoint los rechaza con 422).
 * - **17 caracteres con forma de VIN** se identifican directo; de 4 a 16 se buscan candidatos y, si queda
 *   uno solo, se identifica sin pedir otro toque (como la app móvil).
 * - **Una respuesta que llega tarde se descarta:** si el texto cambió o se cerró la búsqueda, lo que
 *   contesta el servidor ya no corresponde.
 * - Es **solo lectura**: no guarda nada en el teléfono. Tomar una orden hallada es de `ListaOrdenes`.
 */
export class IdentificadorVin {
  readonly #api: TrasladoApi

  #instantanea: InstantaneaBusqueda = INACTIVO
  readonly #escuchas = new Set<() => void>()
  #generacion = 0

  constructor(opciones: { api: TrasladoApi }) {
    this.#api = opciones.api
  }

  readonly getSnapshot = (): InstantaneaBusqueda => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /** Busca lo escrito: por candidatos si es parcial, directo si es un VIN completo. */
  async buscar(texto: string, idUsuario: number | null): Promise<void> {
    const generacion = ++this.#generacion
    const vin = normalizarVin(texto)
    switch (tipoDeBusqueda(vin)) {
      case 'corto':
        return this.#publicar({ tipo: 'muyCorto' })
      case 'invalido':
        return this.#publicar({ tipo: 'formatoInvalido', texto: vin })
      case 'exacto':
        return this.#identificar(vin, idUsuario, generacion)
      case 'parcial':
        return this.#buscarParcial(vin, idUsuario, generacion)
    }
  }

  /** Identifica un VIN ya elegido de la lista de candidatos. */
  async identificar(vin: string, idUsuario: number | null): Promise<void> {
    return this.#identificar(normalizarVin(vin), idUsuario, ++this.#generacion)
  }

  /** Cierra la búsqueda y descarta lo que esté por llegar. */
  cancelar(): void {
    this.#generacion++
    if (this.#instantanea.resultado.tipo !== 'inactivo') this.#publicar({ tipo: 'inactivo' })
  }

  async #buscarParcial(texto: string, idUsuario: number | null, generacion: number): Promise<void> {
    this.#publicar({ tipo: 'buscando' })
    try {
      const { candidatos } = await this.#api.buscarVin(texto)
      if (generacion !== this.#generacion) return
      if (candidatos.length === 0) return this.#publicar({ tipo: 'sinCoincidencias', texto })
      // Uno solo: no hay nada que elegir, se identifica enseguida.
      const unico = candidatos[0]
      if (candidatos.length === 1 && unico) return this.#identificar(unico.vin, idUsuario, generacion)
      this.#publicar({ tipo: 'candidatos', texto, candidatos })
    } catch (error) {
      if (generacion === this.#generacion) this.#publicar(resultadoDeFallo(error, texto))
    }
  }

  async #identificar(vin: string, idUsuario: number | null, generacion: number): Promise<void> {
    this.#publicar({ tipo: 'buscando' })
    try {
      const { ordenes, otras = [] } = await this.#api.identificarVin(vin)
      if (generacion !== this.#generacion) return
      if (ordenes.length === 0) {
        // Con una orden pendiente se muestra esa (lo que se puede hacer); sin ella, si ya hubo otra, se dice cuál.
        if (otras.length === 0) return this.#publicar({ tipo: 'sinOrden', vin })
        return this.#publicar({ tipo: 'yaTomada', vin, otras: otras.map((orden) => ({ orden, relacion: relacionConLaOrden(orden.conductorAsignado, idUsuario) })) })
      }
      this.#publicar({
        tipo: 'ordenes',
        vin,
        ordenes: ordenes.map((orden) => ({ orden, relacion: relacionConLaOrden(orden.conductorAsignado, idUsuario) })),
      })
    } catch (error) {
      if (generacion === this.#generacion) this.#publicar(resultadoDeFallo(error, vin, vin))
    }
  }

  #publicar(resultado: ResultadoBusqueda): void {
    this.#instantanea = { resultado }
    for (const escucha of [...this.#escuchas]) escucha()
  }
}

/** Qué decir cuando la consulta falla. `vinConsultado` solo existe al identificar un VIN exacto (donde 404 significa «no existe»). */
function resultadoDeFallo(error: unknown, texto: string, vinConsultado?: string): ResultadoBusqueda {
  if (!(error instanceof ApiError)) return { tipo: 'error', mensaje: 'No se pudo consultar el sistema.' }
  if (error.isNetwork) return { tipo: 'sinConexion' }
  if (error.status === 404 && vinConsultado) return { tipo: 'noConocido', vin: vinConsultado }
  if (error.status === 422) return { tipo: 'formatoInvalido', texto }
  if (error.status === 403) return { tipo: 'sinPermiso', mensaje: error.message }
  return { tipo: 'error', mensaje: error.message }
}
