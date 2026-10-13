import { z } from 'zod'
import type { CandidatoVin, Catalogos, OpcionCatalogo, OrdenRemota, OtraOrdenDeVin } from '../domain'

/**
 * Contrato de una orden de `GET /mobile/traslado/mis-ordenes` (comprobado contra el backend de
 * desarrollo el 2026-10-09). Todo lo que el servidor puede dejar vacío se declara nulo: la app sufrió
 * un cast a `null` que tumbaba la deserialización entera con la primera orden del pool.
 */
const refPlaca = z.object({ id: z.number(), codigo: z.string() })
const refNombre = z.object({ id: z.number(), nombre: z.string() })
const conductor = z.object({ id: z.number(), username: z.string(), nombre_completo: z.string().nullish() })

const ordenSchema = z.object({
  id_orden: z.number().int(),
  vin: z.string().min(1),
  estado: z.string().min(1),
  placa: refPlaca.nullish(),
  proveedor: refNombre.nullish(),
  destino: refNombre.nullish(),
  conductor_asignado: conductor.nullish(),
  fecha_creacion: z.string().nullish(),
})

/** Contrato de `GET /mobile/traslado/catalogos` (comprobado contra el backend de desarrollo el 2026-10-10). */
const placaSchema = z.object({ id: z.number().int(), codigo: z.string().min(1), estado: z.string().nullish() })
const proveedorSchema = z.object({ id: z.number().int(), nombre: z.string().min(1) })

export interface CatalogosLeidos extends Catalogos {
  /** Opciones que el servidor mandó con datos inválidos y no se ofrecen. */
  descartadas: number
}

/** Lee el catálogo; una opción mala se salta y se cuenta, no vacía la lista. `null` si no es un catálogo. */
export function aCatalogos(crudo: unknown): CatalogosLeidos | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const { placas, proveedores } = crudo as { placas?: unknown; proveedores?: unknown }
  if (!Array.isArray(placas) || !Array.isArray(proveedores)) return null

  let descartadas = 0
  const placasValidas: OpcionCatalogo[] = []
  for (const item of placas) {
    const r = placaSchema.safeParse(item)
    if (r.success) placasValidas.push({ id: r.data.id, nombre: r.data.codigo, estado: r.data.estado ?? null })
    else descartadas++
  }
  const proveedoresValidos: OpcionCatalogo[] = []
  for (const item of proveedores) {
    const r = proveedorSchema.safeParse(item)
    if (r.success) proveedoresValidos.push({ id: r.data.id, nombre: r.data.nombre, estado: null })
    else descartadas++
  }
  return { placas: placasValidas, proveedores: proveedoresValidos, descartadas }
}

/** Contrato de `GET /mobile/traslado/buscar` (comprobado contra el backend de desarrollo el 2026-10-10). */
const candidatoSchema = z.object({ vin: z.string().min(1), marca: z.string().nullish(), modelo: z.string().nullish() })

export interface CandidatosLeidos {
  candidatos: CandidatoVin[]
  /** Candidatos que el servidor mandó con datos inválidos y no se ofrecen. */
  descartados: number
}

/** Lee los candidatos de una búsqueda parcial; uno malo se salta y se cuenta. `null` si no es una respuesta de búsqueda. */
export function aCandidatos(crudo: unknown): CandidatosLeidos | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const { candidatos } = crudo as { candidatos?: unknown }
  if (!Array.isArray(candidatos)) return null
  const validos: CandidatoVin[] = []
  let descartados = 0
  for (const item of candidatos) {
    const r = candidatoSchema.safeParse(item)
    if (r.success) validos.push({ vin: r.data.vin, marca: r.data.marca ?? '', modelo: r.data.modelo ?? '' })
    else descartados++
  }
  return { candidatos: validos, descartados }
}

export interface VinIdentificado {
  vin: string
  /** Las órdenes **pendientes** de ese vehículo, de cualquier conductor (a propósito: avisa si es de otro). */
  ordenes: OrdenRemota[]
  /**
   * Las que **ya no están pendientes** (en tránsito, entregadas, canceladas). Es opcional: el servidor de hoy
   * no las manda (ver docs/07-planificacion/pedido-backend-vin-otras-ordenes.md) y, sin ellas, la página sigue
   * como siempre. Una mal formada se salta.
   */
  otras?: OtraOrdenDeVin[]
  /** Órdenes que el servidor mandó con datos inválidos y no se muestran. */
  descartadas: number
}

const otraOrdenSchema = z.object({
  id_orden: z.number().int(),
  estado: z.string().min(1),
  conductor_asignado: conductor.nullish(),
  fecha_salida: z.string().nullish(),
  fecha_entrega: z.string().nullish(),
})

/** Las órdenes no pendientes de un VIN, si el servidor las manda; las malas se saltan y las pendientes se ignoran. */
function aOtrasOrdenes(crudo: unknown): OtraOrdenDeVin[] {
  if (!Array.isArray(crudo)) return []
  const otras: OtraOrdenDeVin[] = []
  for (const item of crudo) {
    const r = otraOrdenSchema.safeParse(item)
    if (!r.success || r.data.estado === 'pendiente') continue
    const o = r.data
    otras.push({
      idOrden: o.id_orden,
      estado: o.estado,
      conductorAsignado: o.conductor_asignado
        ? { id: o.conductor_asignado.id, username: o.conductor_asignado.username, nombreCompleto: o.conductor_asignado.nombre_completo ?? null }
        : null,
      fechaSalida: o.fecha_salida ?? null,
      fechaEntrega: o.fecha_entrega ?? null,
    })
  }
  return otras
}

/** Lee la respuesta de `GET /mobile/traslado/vin/{vin}`. `null` si no es esa respuesta. */
export function aVinIdentificado(crudo: unknown): VinIdentificado | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const { vin, ordenes, otras_ordenes } = crudo as { vin?: unknown; ordenes?: unknown; otras_ordenes?: unknown }
  if (typeof vin !== 'string' || vin === '' || !Array.isArray(ordenes)) return null
  const validas: OrdenRemota[] = []
  let descartadas = 0
  for (const item of ordenes) {
    const orden = aOrdenRemota(item)
    if (orden) validas.push(orden)
    else descartadas++
  }
  return { vin, ordenes: validas, descartadas, otras: aOtrasOrdenes(otras_ordenes) }
}

/** Respuesta de `POST /{id}/tomar` y `/{id}/soltar` (`TrasladoTomarOut` del backend). */
const tomaSchema = z.object({ id_orden: z.number().int(), tomada: z.boolean() })

export interface ResultadoToma {
  idOrden: number
  /** `true`: la orden quedó a nombre de quien llamó (tomar); `false`: volvió al pool (soltar). */
  tomada: boolean
}

export function aResultadoToma(crudo: unknown): ResultadoToma | null {
  const resultado = tomaSchema.safeParse(crudo)
  return resultado.success ? { idOrden: resultado.data.id_orden, tomada: resultado.data.tomada } : null
}

/** Una orden válida del servidor como la usa el cliente, o `null` si no cumple el contrato. */
export function aOrdenRemota(crudo: unknown): OrdenRemota | null {
  const resultado = ordenSchema.safeParse(crudo)
  if (!resultado.success) return null
  const o = resultado.data
  return {
    idOrden: o.id_orden,
    vin: o.vin,
    estado: o.estado,
    placa: o.placa ?? null,
    proveedor: o.proveedor ?? null,
    destino: o.destino ?? null,
    conductorAsignado: o.conductor_asignado
      ? { id: o.conductor_asignado.id, username: o.conductor_asignado.username, nombreCompleto: o.conductor_asignado.nombre_completo ?? null }
      : null,
    fechaCreacion: o.fecha_creacion ?? null,
  }
}

/**
 * Respuesta de `POST /{id}/confirmar-salida` y `/{id}/confirmar-entrega`. `descartada_por_supervisor` NO
 * es un error: el servidor guardó las fotos, pero la orden ya no seguía (cancelada o reasignada).
 */
const confirmacionSchema = z.object({
  resultado: z.enum(['confirmada', 'descartada_por_supervisor']),
  id_orden: z.number().int(),
  estado: z.string().nullish(),
  motivo: z.string().nullish(),
})

export interface ResultadoConfirmacion {
  resultado: 'confirmada' | 'descartada_por_supervisor'
  idOrden: number
  estado: string | null
  /** `orden_cancelada` u `orden_reasignada` cuando se descartó; si llega otro texto se conserva tal cual. */
  motivo: string | null
}

export function aResultadoConfirmacion(crudo: unknown): ResultadoConfirmacion | null {
  const r = confirmacionSchema.safeParse(crudo)
  if (!r.success) return null
  return { resultado: r.data.resultado, idOrden: r.data.id_orden, estado: r.data.estado ?? null, motivo: r.data.motivo ?? null }
}
