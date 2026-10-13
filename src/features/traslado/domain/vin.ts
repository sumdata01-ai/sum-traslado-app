import type { Conductor } from './orden'

/**
 * Un VIN completo tiene 17 caracteres: letras A-Z **sin I, O ni Q** (se confunden con 1 y 0) y números.
 * Es la misma regla que `validar_vin` del backend (`^[A-HJ-NPR-Z0-9]{17}$`): si el cliente fuera más
 * laxo mandaría consultas que el servidor rechaza, y si fuera más estricto no encontraría un vehículo
 * que sí existe.
 */
export const LARGO_VIN = 17

/** Mínimo de caracteres para buscar en el sistema por texto parcial (lo exige el endpoint `buscar`). */
export const MINIMO_BUSQUEDA_PARCIAL = 4

const VIN_COMPLETO = /^[A-HJ-NPR-Z0-9]{17}$/

/** Lo que se teclea o se escanea, listo para comparar: sin espacios y en mayúsculas. */
export const normalizarVin = (texto: string): string => texto.replace(/\s+/g, '').toUpperCase()

export const esVinCompleto = (texto: string): boolean => VIN_COMPLETO.test(normalizarVin(texto))

// Un VIN completo suelto dentro de un texto: no pegado a otras letras o números (un tramo de 20 no cuenta).
const VIN_DENTRO_DE_UN_TEXTO = /(?:^|[^A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/

/**
 * Lo que se lee de un QR o código de barras, convertido en lo que se pone en el filtro (O-05).
 * La etiqueta suele traer el VIN solo, pero un QR puede traer más (`https://…/LSCA…`, `VIN: LSCA…`):
 * si hay un VIN completo suelto en el texto, es ese; si no, el texto tal cual, en mayúsculas y sin
 * espacios, que es lo que hace la app móvil.
 */
export function extraerVin(texto: string): string {
  const mayusculas = texto.trim().toUpperCase()
  return mayusculas.match(VIN_DENTRO_DE_UN_TEXTO)?.[1] ?? normalizarVin(mayusculas)
}

/**
 * Qué se hace con lo escrito al «buscar en el sistema»:
 * - `corto`: menos de 4 caracteres; **no se llama al servidor** (el endpoint lo rechazaría).
 * - `parcial`: de 4 a 16; se buscan candidatos y se elige uno.
 * - `exacto`: 17 caracteres con la forma de un VIN; se identifica directamente.
 * - `invalido`: 17 o más caracteres que no son un VIN (casi siempre una `O` por `0` o una `I` por `1`);
 *   se avisa sin llamar al servidor.
 */
export type TipoBusqueda = 'corto' | 'parcial' | 'exacto' | 'invalido'

export function tipoDeBusqueda(texto: string): TipoBusqueda {
  const vin = normalizarVin(texto)
  if (vin.length < MINIMO_BUSQUEDA_PARCIAL) return 'corto'
  if (vin.length < LARGO_VIN) return 'parcial'
  return VIN_COMPLETO.test(vin) ? 'exacto' : 'invalido'
}

/**
 * Una orden de un VIN que **ya no está pendiente**: salió, se entregó o se canceló. El servidor puede
 * mandarlas aparte de las pendientes (campo `otras_ordenes` de `/vin/{vin}`) para poder decir
 * «esta orden ya la tiene X» en vez de «no hay orden pendiente».
 */
export interface OtraOrdenDeVin {
  idOrden: number
  /** Tal como lo manda el servidor (`en_transito`, `realizado`, `cerrada`, `cancelada`…). */
  estado: string
  conductorAsignado: Conductor | null
  /** Instante en que salió (ISO), si se sabe. */
  fechaSalida: string | null
  /** Instante en que se entregó (ISO), si se sabe. */
  fechaEntrega: string | null
}

/** Qué le pasó a una orden que ya no está pendiente, en palabras del operario. */
export type SituacionDeOtraOrden = 'enTransito' | 'entregada' | 'cancelada' | 'desconocida'

export function situacionDeOtraOrden(estado: string): SituacionDeOtraOrden {
  switch (estado) {
    case 'en_transito':
      return 'enTransito'
    case 'realizado':
    case 'cerrada':
      return 'entregada'
    case 'cancelada':
      return 'cancelada'
    default:
      return 'desconocida'
  }
}

/** Un vehículo candidato de la búsqueda parcial. */
export interface CandidatoVin {
  vin: string
  marca: string
  modelo: string
}

/**
 * Cómo se relaciona una orden encontrada por VIN con quien busca:
 * - `mia`: ya es suya; está en «Mis traslados».
 * - `delPool`: nadie la tomó; se puede tomar con «Comenzar despacho».
 * - `deOtro`: está asignada a otra persona. **No se toma ni se mezcla con las propias**: aparecería en
 *   «Mis traslados» (que se decide por tener conductor) siendo ajena.
 */
export type RelacionConLaOrden = 'mia' | 'delPool' | 'deOtro'

export function relacionConLaOrden(conductorAsignado: { id: number } | null, idUsuario: number | null): RelacionConLaOrden {
  if (conductorAsignado === null) return 'delPool'
  return idUsuario !== null && conductorAsignado.id === idUsuario ? 'mia' : 'deOtro'
}
