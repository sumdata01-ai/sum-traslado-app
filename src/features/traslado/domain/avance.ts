import type { EstadoOrdenLocal } from './estadoOrden'

export interface AvanceTraslado {
  /** El backend confirmó la salida. */
  enviados: number
  /**
   * **Todas las fotos ya están tomadas** pero todavía no llegaron al backend (sin señal, o subiendo).
   * Cuenta como trabajo hecho, no como pendiente: agruparlo con lo faltante le diría «0 hechos» a
   * alguien que fotografió todo sin señal.
   */
  porEnviar: number
  /** Sin fotos, o con algunas pero incompletas. */
  sinEmpezar: number
}

export interface OrdenParaAvance {
  estadoServidor: string
  estadoLocal: EstadoOrdenLocal | null
}

/**
 * Agrupa las órdenes **propias** en los tres grupos del contador. Mismas reglas que `calcularAvance`
 * de la app:
 *
 * - **El servidor manda:** `en_transito` o `cerrada` significa que el conductor ya registró la
 *   salida, aunque el estado local diga otra cosa (o nada: se calcula `null` en cuanto el servidor
 *   deja de decir `pendiente`; contarlo como «fuera del conteo» hacía desaparecer el trabajo hecho).
 * - `cancelada` y `descartadaPorSupervisor` **no suman a ninguno**: contarlas como hechas haría creer
 *   que se registró una salida que se descartó, y como faltantes pedirían trabajo que ya no existe.
 */
export function calcularAvance(ordenes: Iterable<OrdenParaAvance>): AvanceTraslado {
  const avance: AvanceTraslado = { enviados: 0, porEnviar: 0, sinEmpezar: 0 }

  for (const { estadoServidor, estadoLocal } of ordenes) {
    if (estadoServidor === 'en_transito' || estadoServidor === 'cerrada') {
      avance.enviados++
      continue
    }
    if (estadoServidor === 'cancelada') continue

    switch (estadoLocal) {
      case 'confirmada':
        avance.enviados++
        break
      case 'listaParaEnviar':
      case 'enviando':
        avance.porEnviar++
        break
      case 'sinIniciar':
      case 'enCaptura':
        avance.sinEmpezar++
        break
      default:
        break // descartadaPorSupervisor o sin estado: fuera del conteo, a propósito
    }
  }
  return avance
}

export const totalDeAvance = (avance: AvanceTraslado) => avance.enviados + avance.porEnviar + avance.sinEmpezar

/** Con menos de 2 órdenes el contador no agrega nada que la lista no diga. */
export const valeMostrarAvance = (avance: AvanceTraslado) => totalDeAvance(avance) >= 2
