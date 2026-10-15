import type { TrasladoSeguimiento } from './traslado'

/**
 * Consulta masiva de VIN: el coordinador pega una lista y ve el estado de cada uno. Contrato de
 * `POST /api/seguimiento/consulta-vines` (docs/07-planificacion/pedido-backend-seguimiento-coordinador.md).
 */

/** El máximo por consulta. Es el mismo del servidor (`MAX_VINES_CONSULTA`): un pedido mayor se rechaza con 422. */
export const MAX_VINES_CONSULTA = 200

/** 17 caracteres, letras y números, sin I, O ni Q (la misma regla de VIN de la app de traslado). */
const VIN_VALIDO = /^[A-HJ-NPR-Z0-9]{17}$/

export interface LecturaDeVines {
  /** Los VIN válidos, en mayúsculas, **sin repetidos** y en el orden en que se pegaron. Son los que se consultan. */
  vines: string[]
  /** Lo pegado que no tiene forma de VIN (en mayúsculas, sin repetidos). No se consulta: no puede existir. */
  invalidos: string[]
  /** Cuántos VIN válidos venían repetidos (se consultan una sola vez). */
  repetidos: number
}

/**
 * Lee la lista pegada: uno por línea, o separados por coma, punto y coma, espacio o tabulador (sirve copiar una columna
 * de Excel). Pasa a mayúsculas, quita lo repetido y aparta lo que no es un VIN.
 */
export function leerVines(texto: string): LecturaDeVines {
  const vistos = new Set<string>()
  const invalidos = new Set<string>()
  let repetidos = 0
  for (const trozo of texto.split(/[\s,;]+/)) {
    const vin = trozo.trim().toUpperCase()
    if (vin === '') continue
    if (!VIN_VALIDO.test(vin)) {
      invalidos.add(vin)
    } else if (vistos.has(vin)) {
      repetidos++
    } else {
      vistos.add(vin)
    }
  }
  return { vines: [...vistos], invalidos: [...invalidos], repetidos }
}

/**
 * Qué se sabe de un VIN consultado. `pendiente` es **todo lo que no está en tránsito ni entregado**: sin orden, con una
 * orden que aún no sale o cancelada. Para quien consulta es lo mismo —«aún no pasa a estar en el plan de despacho»— y no
 * se distingue, para no contar de más.
 */
export type ResultadoVin =
  | { vin: string; informacion: 'disponible'; traslado: TrasladoSeguimiento }
  | { vin: string; informacion: 'pendiente' }

export const TEXTO_PENDIENTE = 'Pendiente de información'
export const NOTA_PENDIENTE = 'Aún no está en el plan de despacho.'

export interface ResumenConsulta {
  total: number
  conInformacion: number
  pendientes: number
}

export function resumirConsulta(resultados: readonly ResultadoVin[]): ResumenConsulta {
  const conInformacion = resultados.filter((r) => r.informacion === 'disponible').length
  return { total: resultados.length, conInformacion, pendientes: resultados.length - conInformacion }
}
