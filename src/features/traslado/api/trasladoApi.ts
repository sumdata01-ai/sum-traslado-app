import { ApiError } from '@/core/http/ApiError'
import type { ApiClient } from '@/core/http/apiClient'
import type { OrdenRemota } from '../domain'
import {
  type CandidatosLeidos,
  type CatalogosLeidos,
  type ResultadoConfirmacion,
  type ResultadoToma,
  type VinIdentificado,
  aCandidatos,
  aCatalogos,
  aOrdenRemota,
  aResultadoConfirmacion,
  aResultadoToma,
  aVinIdentificado,
} from './schemas'

export type { CandidatosLeidos, CatalogosLeidos, ResultadoConfirmacion, ResultadoToma, VinIdentificado } from './schemas'

/**
 * Política de 403 de Traslado, definida **en un solo lugar**.
 *
 * El cliente HTTP trata por defecto un 403 como «permiso revocado» y cierra la sesión. Para Traslado
 * un 403 solo significa que el rol del usuario no está en la lista de los endpoints (`Permisos
 * insuficientes`): cerrar la sesión no protege nada (el servidor ya bloquea cada llamada) y haría
 * perder contexto. Se muestra «Sin permiso» y se deja al operario decidir.
 *
 * Toda función de este módulo debe pasar estas opciones; una prueba de guarda lo comprueba.
 */
export const OPCIONES_TRASLADO = { cerrarSesionEn403: false } as const

export interface ResultadoMisOrdenes {
  ordenes: OrdenRemota[]
  /** Órdenes que el servidor mandó pero no cumplían el contrato. No se muestran; se cuentan. */
  descartadas: number
}

/** Una foto ya subida, tal como la espera el backend al confirmar. */
export interface FotoConfirmada {
  zona: string
  storageKey: string
}

export interface DatosSalida {
  /** Exactamente 6, una por zona. */
  fotos: readonly FotoConfirmada[]
  /** Quién figuraba como conductor al empezar; `null` si no se sabe. Si ya no coincide, el servidor descarta por reasignación. */
  idConductorEsperado: number | null
  idPlaca: number | null
  idProveedor: number | null
  /** El instante medido de la última foto, no el de enviar. */
  fechaSalida: Date
}

export interface DatosEntrega {
  /** Exactamente 5: las 4 exteriores y `VIN`. */
  fotos: readonly FotoConfirmada[]
  fechaEntrega: Date
}

export interface TrasladoApi {
  /** `GET /mobile/traslado/mis-ordenes`: las propias (`pendiente` o `en_transito`) más el pool del día. */
  misOrdenes(): Promise<ResultadoMisOrdenes>
  /**
   * `GET /mobile/traslado/catalogos`: **todas** las placas, sin filtrar por estado (el operario elige
   * una placa física del pañol y que figure «en uso» suele ser que alguien olvidó devolverla), y los
   * proveedores. Sin destinos: vienen de la hoja y el operario no los elige.
   */
  catalogos(): Promise<CatalogosLeidos>
  /**
   * `POST /{id}/tomar` («Comenzar despacho»). Atómico en el servidor: si otra persona se adelantó
   * responde **409** con su nombre en el mensaje («La tomó …»), que llega como `ApiError` con
   * `status: 409`. Tomar una orden que ya es propia responde 200 sin duplicar.
   */
  /**
   * `GET /mobile/traslado/buscar?q=`: candidatos por un trozo del VIN (mínimo 4 caracteres; con menos el
   * servidor responde 422, así que **no se debe llamar**). Alcanza lo mismo que la lista: lo propio y el
   * pool del día; por eso no encuentra órdenes de otros días ni de otras personas.
   */
  buscarVin(texto: string): Promise<CandidatosLeidos>
  /**
   * `GET /mobile/traslado/vin/{vin}`: las órdenes pendientes de un VIN exacto, **de cualquier conductor**.
   * **404** si el VIN no es un vehículo conocido; **200 con lista vacía** si el vehículo existe pero no
   * tiene orden pendiente (son mensajes distintos); **422** si no tiene forma de VIN. El VIN va
   * codificado en la URL.
   */
  identificarVin(vin: string): Promise<VinIdentificado>
  tomarOrden(idOrden: number): Promise<ResultadoToma>
  /**
   * `POST /{id}/soltar`: la devuelve al pool. Solo una orden propia y todavía `pendiente`; si no,
   * **409** con el motivo («Esa orden no es tuya» o «El auto ya salió…»).
   */
  soltarOrden(idOrden: number): Promise<ResultadoToma>
  /**
   * `POST /{id}/confirmar-salida`: registra el despacho con las 6 fotos ya subidas. **Reintentar es
   * seguro:** el mismo conductor que repite no duplica nada. `descartada_por_supervisor` llega como
   * resultado, no como error. Un 4xx (por ejemplo un 422) sí es `ApiError`.
   */
  confirmarSalida(idOrden: number, datos: DatosSalida): Promise<ResultadoConfirmacion>
  /** `POST /{id}/confirmar-entrega`: ídem con las 5 fotos. **422** si la orden nunca salió. */
  confirmarEntrega(idOrden: number, datos: DatosEntrega): Promise<ResultadoConfirmacion>
}

export function crearTrasladoApi(cliente: ApiClient): TrasladoApi {
  return {
    async misOrdenes() {
      const cuerpo = await cliente.getJson<unknown>('/mobile/traslado/mis-ordenes', {
        ...OPCIONES_TRASLADO,
        fallbackError: 'No se pudieron traer tus traslados.',
      })

      const lista = typeof cuerpo === 'object' && cuerpo !== null && 'ordenes' in cuerpo && Array.isArray(cuerpo.ordenes) ? cuerpo.ordenes : null
      // Sin `status` sería indistinguible de una red caída y mostraría «sin conexión» por error.
      if (!lista) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })

      // Una orden mala no debe vaciar toda la lista: se salta y se cuenta.
      const ordenes: OrdenRemota[] = []
      let descartadas = 0
      for (const crudo of lista) {
        const orden = aOrdenRemota(crudo)
        if (orden) ordenes.push(orden)
        else descartadas++
      }
      return { ordenes, descartadas }
    },

    async catalogos() {
      const cuerpo = await cliente.getJson<unknown>('/mobile/traslado/catalogos', {
        ...OPCIONES_TRASLADO,
        fallbackError: 'No se pudieron traer las placas y proveedores.',
      })
      const catalogos = aCatalogos(cuerpo)
      if (!catalogos) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
      return catalogos
    },

    async buscarVin(texto) {
      const cuerpo = await cliente.getJson<unknown>('/mobile/traslado/buscar', {
        ...OPCIONES_TRASLADO,
        query: { q: texto },
        fallbackError: 'No se pudo buscar.',
      })
      const candidatos = aCandidatos(cuerpo)
      if (!candidatos) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
      return candidatos
    },

    async identificarVin(vin) {
      const cuerpo = await cliente.getJson<unknown>(`/mobile/traslado/vin/${encodeURIComponent(vin)}`, {
        ...OPCIONES_TRASLADO,
        fallbackError: 'No se pudo consultar el VIN.',
      })
      const identificado = aVinIdentificado(cuerpo)
      if (!identificado) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
      return identificado
    },

    tomarOrden: (idOrden) => cambiarToma(cliente, idOrden, 'tomar', 'No se pudo tomar la orden.'),
    soltarOrden: (idOrden) => cambiarToma(cliente, idOrden, 'soltar', 'No se pudo devolver la orden al pool.'),

    confirmarSalida: (idOrden, datos) =>
      confirmar(cliente, idOrden, 'confirmar-salida', 'No se pudo confirmar la salida.', {
        fotos: aFotosDelCuerpo(datos.fotos),
        id_conductor_asignado_esperado: datos.idConductorEsperado,
        id_placa: datos.idPlaca,
        id_proveedor: datos.idProveedor,
        fecha_salida_cliente: datos.fechaSalida.toISOString(),
      }),
    confirmarEntrega: (idOrden, datos) =>
      confirmar(cliente, idOrden, 'confirmar-entrega', 'No se pudo confirmar la entrega.', {
        fotos: aFotosDelCuerpo(datos.fotos),
        fecha_entrega_cliente: datos.fechaEntrega.toISOString(),
      }),
  }
}

const aFotosDelCuerpo = (fotos: readonly FotoConfirmada[]) => fotos.map((f) => ({ zona: f.zona, storage_key: f.storageKey, comentario: null }))

async function confirmar(cliente: ApiClient, idOrden: number, accion: 'confirmar-salida' | 'confirmar-entrega', fallbackError: string, cuerpo: unknown): Promise<ResultadoConfirmacion> {
  const respuesta = await cliente.postJson<unknown>(`/mobile/traslado/${encodeURIComponent(String(idOrden))}/${accion}`, cuerpo, {
    ...OPCIONES_TRASLADO,
    fallbackError,
  })
  const resultado = aResultadoConfirmacion(respuesta)
  // Un cuerpo que no se entiende NO se toma por confirmado: sin `status` se confundiría con una red caída.
  if (!resultado) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
  return resultado
}

async function cambiarToma(cliente: ApiClient, idOrden: number, accion: 'tomar' | 'soltar', fallbackError: string): Promise<ResultadoToma> {
  const cuerpo = await cliente.postJson<unknown>(`/mobile/traslado/${encodeURIComponent(String(idOrden))}/${accion}`, undefined, {
    ...OPCIONES_TRASLADO,
    fallbackError,
  })
  const resultado = aResultadoToma(cuerpo)
  if (!resultado) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
  return resultado
}
