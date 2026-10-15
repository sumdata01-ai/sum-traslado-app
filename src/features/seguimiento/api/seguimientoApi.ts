import { ApiError } from '@/core/http/ApiError'
import type { ApiClient } from '@/core/http/apiClient'
import { type ResultadosVinesLeidos, type TrasladosLeidos, aResultadosVines, aTraslados } from './schemas'

export type { ResultadosVinesLeidos, TrasladosLeidos } from './schemas'

/**
 * Política de 403 de la vista de seguimiento: igual que Traslado, un 403 solo significa que el rol no está en la lista
 * del endpoint. El servidor ya bloquea cada llamada, así que cerrar la sesión no protege nada: se muestra «Sin permiso».
 * Toda función de este módulo debe pasar estas opciones; una prueba de guarda lo comprueba.
 */
export const OPCIONES_SEGUIMIENTO = { cerrarSesionEn403: false } as const

export interface SeguimientoApi {
  /**
   * `GET /api/seguimiento/traslados`: todos los traslados que genera la app de Traslado, sin filtro por destino (primera
   * versión, 2026-10-15). Solo el rol `coordinador`; otro rol recibe 403.
   *
   * El prefijo es `/api` y no `/v1` a propósito: esta web solo reenvía `/api` y `/mobile` al backend (ADR 0003).
   */
  traslados(): Promise<TrasladosLeidos>

  /**
   * `POST /api/seguimiento/consulta-vines`: el estado de varios VIN a la vez (hasta 200), de cualquier fecha. Solo cuentan
   * las órdenes en tránsito o entregadas; todo lo demás vuelve como pendiente de información. Es un POST de solo lectura.
   */
  consultarVines(vines: readonly string[]): Promise<ResultadosVinesLeidos>
}

export function crearSeguimientoApi(cliente: ApiClient): SeguimientoApi {
  return {
    async traslados() {
      const cuerpo = await cliente.getJson<unknown>('/api/seguimiento/traslados', {
        ...OPCIONES_SEGUIMIENTO,
        fallbackError: 'No se pudieron traer los traslados.',
      })
      const leidos = aTraslados(cuerpo)
      // Sin `status` sería indistinguible de una red caída y mostraría «sin conexión» por error.
      if (!leidos) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
      return leidos
    },

    async consultarVines(vines) {
      const cuerpo = await cliente.postJson<unknown>(
        '/api/seguimiento/consulta-vines',
        { vines },
        { ...OPCIONES_SEGUIMIENTO, fallbackError: 'No se pudo hacer la consulta.' },
      )
      const leidos = aResultadosVines(cuerpo)
      if (!leidos) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
      return leidos
    },
  }
}
