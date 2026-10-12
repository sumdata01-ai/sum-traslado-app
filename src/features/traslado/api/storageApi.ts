import { z } from 'zod'
import { ApiError } from '@/core/http/ApiError'
import type { ApiClient } from '@/core/http/apiClient'

/** El módulo con el que el backend arma la ruta de las fotos de Traslado en el bucket. */
export const MODULO_STORAGE = 'traslado'

/** Las fotos se capturan siempre como JPEG (ver `captureFrame`): el permiso de subida se pide con ese tipo. */
export const TIPO_FOTO = 'image/jpeg'

export interface UrlDeSubida {
  /** URL firmada de escritura en GCS: se sube con `PUT` y el mismo `Content-Type`, **sin `Authorization`**. */
  urlDeSubida: string
  /** La ruta del archivo en el bucket; es lo que viaja al backend al confirmar la salida o la entrega. */
  storageKey: string
  venceEnSegundos: number
}

export interface StorageApi {
  /**
   * `POST /mobile/storage/upload-url`: pide permiso para subir UNA foto de Traslado. Cada llamada da
   * una ruta nueva; pedirla de nuevo (por ejemplo, porque la URL venció) no reutiliza la anterior.
   */
  pedirUrlDeSubida(): Promise<UrlDeSubida>
}

const respuestaSchema = z.object({
  upload_url: z.string().url(),
  storage_key: z.string().min(1),
  expires_in: z.number().positive(),
})

/** La misma regla de forma que el backend aplica a una `storage_key` (`^[a-zA-Z0-9/_\-.]+$`, sin `..`). */
const STORAGE_KEY_VALIDA = /^[a-zA-Z0-9/_\-.]+$/

export function crearStorageApi(cliente: ApiClient): StorageApi {
  return {
    async pedirUrlDeSubida() {
      const cuerpo = await cliente.postJson<unknown>(
        '/mobile/storage/upload-url',
        { module: MODULO_STORAGE, content_type: TIPO_FOTO },
        { fallbackError: 'No se pudo preparar la subida de la foto.' },
      )
      const lectura = respuestaSchema.safeParse(cuerpo)
      // Sin `status` sería indistinguible de una red caída y mostraría «sin conexión» por error.
      if (!lectura.success) throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
      const { upload_url: urlDeSubida, storage_key: storageKey, expires_in: venceEnSegundos } = lectura.data
      if (storageKey.includes('..') || !STORAGE_KEY_VALIDA.test(storageKey)) {
        throw new ApiError('Respuesta inesperada del servidor.', { status: 502 })
      }
      return { urlDeSubida, storageKey, venceEnSegundos }
    },
  }
}
