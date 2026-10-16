import { ApiError } from '@/core/http/ApiError'
import type { ApiClient } from '@/core/http/apiClient'
import { type ResultadoLlegada, cuerpoDeLlegada, interpretarRespuestaLlegada } from '../domain'

/**
 * Política de 403 de la marcación de llegada: el servidor usa 403 para «tu rol no puede marcar llegada» (por ejemplo la cuenta de
 * la tablet, rol `utilidad`), no para un permiso revocado. Cerrar la sesión no protege nada y le haría perder el contexto a un
 * conductor que está escaneando: se le dice que no tiene permiso. Toda función de este módulo debe pasar estas opciones.
 */
export const OPCIONES_LLEGADA = { cerrarSesionEn403: false } as const

export interface DatosDeLlegada {
  /** El texto del QR, **tal cual** lo leyó la cámara. */
  payload: string
  latitud: number
  longitud: number
  /** `coords.accuracy`, en metros. */
  precisionM: number
}

export interface LlegadaApi {
  /**
   * `POST /mobile/llegadas`. Reenviar el mismo QR es seguro (200 con el mismo evento). Todo lo que el servidor puede contestar
   * llega como resultado, no como excepción: el conductor ve un texto distinto en cada caso y no hay nada que atrapar.
   */
  registrar(datos: DatosDeLlegada): Promise<ResultadoLlegada>
}

export function crearLlegadaApi(cliente: ApiClient): LlegadaApi {
  return {
    async registrar(datos) {
      let respuesta: Response
      try {
        // Se usa `request` y no `postJson`: hay que leer el `code` y el `motivo` del 400, y `postJson` solo deja el mensaje.
        respuesta = await cliente.request(
          '/mobile/llegadas',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpoDeLlegada(datos)) },
          OPCIONES_LLEGADA,
        )
      } catch (causa) {
        if (causa instanceof ApiError) {
          if (causa.isNetwork) return { tipo: 'sinRed' }
          if (causa.isSessionExpired) return { tipo: 'sesionVencida' }
          return { tipo: 'error', status: causa.status ?? null }
        }
        return { tipo: 'error', status: null }
      }
      return interpretarRespuestaLlegada(respuesta.status, await respuesta.text().catch(() => ''))
    },
  }
}
