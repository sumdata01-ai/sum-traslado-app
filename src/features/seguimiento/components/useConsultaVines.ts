import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/core/http/ApiError'
import type { ListaSeguimiento } from '../data/listaSeguimiento'
import type { ResultadoVin } from '../domain'

export interface EstadoConsulta {
  /** Hay una consulta en curso. */
  consultando: boolean
  /** El resultado de la última consulta, en el orden de la lista pegada; `null` si aún no se consultó (o se limpió). */
  resultados: readonly ResultadoVin[] | null
  /** Resultados que el servidor mandó con datos inválidos y no se muestran. */
  descartados: number
  /** Por qué falló la última consulta, dicho para el usuario; `null` si no falló. */
  error: string | null
}

const INICIAL: EstadoConsulta = { consultando: false, resultados: null, descartados: 0, error: null }

/** Un fallo de la consulta, en palabras de quien la hace y diciendo qué hacer. */
export function mensajeDeFalloDeConsulta(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Tu usuario no tiene permiso para hacer consultas. Pide a SUM que lo revise.'
    if (error.isNetwork) return 'Sin conexión. Revisa tu internet y vuelve a consultar.'
    return error.message
  }
  return 'No se pudo hacer la consulta. Vuelve a intentarlo.'
}

/**
 * La consulta masiva de VIN de una pantalla. El resultado **solo vive en memoria** y en esta pantalla: no se guarda en el
 * navegador. Lo que llegue después de limpiar o de salir de la pantalla se descarta.
 */
export function useConsultaVines(lista: ListaSeguimiento) {
  const [estado, setEstado] = useState<EstadoConsulta>(INICIAL)
  const generacion = useRef(0)

  useEffect(
    () => () => {
      generacion.current++ // la pantalla se cerró: nada de lo que llegue después se muestra
    },
    [],
  )

  const consultar = useCallback(
    async (vines: readonly string[]) => {
      const mia = ++generacion.current
      setEstado((anterior) => ({ ...anterior, consultando: true, error: null }))
      try {
        const { resultados, descartados } = await lista.consultarVines(vines)
        if (mia !== generacion.current) return
        setEstado({ consultando: false, resultados, descartados, error: null })
      } catch (error) {
        if (mia !== generacion.current) return
        // Un fallo no borra el resultado anterior: se sigue viendo lo último que sí llegó, con el aviso.
        setEstado((anterior) => ({ ...anterior, consultando: false, error: mensajeDeFalloDeConsulta(error) }))
      }
    },
    [lista],
  )

  const limpiar = useCallback(() => {
    generacion.current++
    setEstado(INICIAL)
  }, [])

  return { estado, consultar, limpiar }
}
