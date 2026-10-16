import { ApiError } from '@/core/http/ApiError'
import type { ApiClient } from '@/core/http/apiClient'
import { type DiaLeido, type IntentosLeidos, type PuntosLeidos, aDia, aIntentos, aPuntos } from './schemas'

export type { DiaLeido, IntentosLeidos, PuntosLeidos } from './schemas'

/**
 * Política de 403 del tablero: un 403 solo significa que el par rol + área del usuario no está en la lista del servidor. El
 * servidor ya bloquea cada llamada, así que cerrar la sesión no protege nada: se muestra «Sin permiso». Toda función de este
 * módulo debe pasar estas opciones; una prueba de guarda lo comprueba.
 */
export const OPCIONES_TABLERO = { cerrarSesionEn403: false } as const

export interface ConsultaTablero {
  /** Día de Lima `AAAA-MM-DD`. Sin él, el servidor usa hoy. */
  dia?: string
  /** Un punto. Sin él, todos. */
  idPunto?: number | null
}

export interface TableroApi {
  /** `GET /api/llegada-qr/dia`: las llegadas del día con su resumen y sus señales (calculados por el servidor). */
  dia(consulta?: ConsultaTablero): Promise<DiaLeido>
  /** `GET /api/llegada-qr/intentos`: los códigos rechazados del día, del más reciente al más antiguo. */
  intentos(consulta?: ConsultaTablero): Promise<IntentosLeidos>
  /** `GET /api/llegada-qr/puntos`: la ficha de cada punto (sin secreto) con sus llegadas del día. El filtro de punto no aplica. */
  puntos(consulta?: Pick<ConsultaTablero, 'dia'>): Promise<PuntosLeidos>
}

const consultar = (c: ConsultaTablero = {}): Record<string, string> | undefined => {
  const query: Record<string, string> = {}
  if (c.dia) query.dia = c.dia
  if (c.idPunto != null) query.id_punto = String(c.idPunto)
  return Object.keys(query).length > 0 ? query : undefined
}

export function crearTableroApi(cliente: ApiClient): TableroApi {
  // Sin `status` la respuesta rara se confundiría con una red caída y mostraría «sin conexión» por error.
  const inesperada = () => new ApiError('Respuesta inesperada del servidor.', { status: 502 })
  return {
    async dia(consulta) {
      const cuerpo = await cliente.getJson<unknown>('/api/llegada-qr/dia', {
        ...OPCIONES_TABLERO,
        query: consultar(consulta),
        fallbackError: 'No se pudieron traer las llegadas.',
      })
      const leido = aDia(cuerpo)
      if (!leido) throw inesperada()
      return leido
    },

    async intentos(consulta) {
      const cuerpo = await cliente.getJson<unknown>('/api/llegada-qr/intentos', {
        ...OPCIONES_TABLERO,
        query: consultar(consulta),
        fallbackError: 'No se pudieron traer los códigos rechazados.',
      })
      const leido = aIntentos(cuerpo)
      if (!leido) throw inesperada()
      return leido
    },

    async puntos(consulta) {
      const cuerpo = await cliente.getJson<unknown>('/api/llegada-qr/puntos', {
        ...OPCIONES_TABLERO,
        // La ficha de los puntos es de todos: el filtro de punto no aplica aunque llegue.
        query: consultar({ dia: consulta?.dia }),
        fallbackError: 'No se pudieron traer los puntos.',
      })
      const leido = aPuntos(cuerpo)
      if (!leido) throw inesperada()
      return leido
    },
  }
}
