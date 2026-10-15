import { z } from 'zod'
import { type ResultadoVin, type TrasladoSeguimiento, esVisible } from '../domain'

/**
 * Contrato de `GET /api/seguimiento/traslados` y de `POST /api/seguimiento/consulta-vines`
 * (docs/07-planificacion/pedido-backend-seguimiento-coordinador.md).
 *
 * El esquema solo deja pasar lo que la pantalla usa: cualquier campo de más (un conductor, una velocidad, una
 * foto) se descarta aquí, así que una respuesta del servidor con datos internos no llega a la interfaz.
 */
const trasladoSchema = z.object({
  id_orden: z.number().int(),
  vin: z.string().min(1),
  marca: z.string().nullish(),
  modelo: z.string().nullish(),
  color: z.string().nullish(),
  destino: z.string().nullish(),
  etapa: z.enum(['en_planta', 'en_camino', 'entregado', 'anulado']),
  salida_registrada_en: z.string().nullish(),
  entregado_en: z.string().nullish(),
  entrega_estimada: z.boolean().nullish(),
})

export interface TrasladosLeidos {
  traslados: TrasladoSeguimiento[]
  /** Traslados que el servidor mandó con datos inválidos (o una etapa que no se conoce). No se muestran; se cuentan. */
  descartados: number
}

/** Un traslado crudo al de la pantalla, o `null` si llegó con datos inválidos (o una etapa que no se conoce). */
function aTraslado(crudo: unknown): TrasladoSeguimiento | null {
  const r = trasladoSchema.safeParse(crudo)
  if (!r.success) return null
  const t = r.data
  return {
    idOrden: t.id_orden,
    vin: t.vin,
    marca: t.marca ?? null,
    modelo: t.modelo ?? null,
    color: t.color ?? null,
    destino: t.destino ?? null,
    etapa: t.etapa,
    salidaRegistrada: t.salida_registrada_en ?? null,
    entregadoEn: t.entregado_en ?? null,
    // Sin el dato se supone medida: lo contrario sería ocultar la hora de todas las entregas por un campo ausente.
    entregaEstimada: t.entrega_estimada ?? false,
  }
}

/** Lee la respuesta; un traslado malo se salta y se cuenta, no vacía la lista. `null` si no es una lista de traslados. */
export function aTraslados(crudo: unknown): TrasladosLeidos | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const { traslados } = crudo as { traslados?: unknown }
  if (!Array.isArray(traslados)) return null

  const validos: TrasladoSeguimiento[] = []
  let descartados = 0
  for (const item of traslados) {
    const traslado = aTraslado(item)
    if (traslado) validos.push(traslado)
    else descartados++
  }
  return { traslados: validos, descartados }
}

export interface ResultadosVinesLeidos {
  /** Uno por VIN, en el orden en que el servidor los devolvió (el de la lista pegada). */
  resultados: ResultadoVin[]
  /** Resultados que llegaron con datos inválidos. No se muestran; se cuentan. */
  descartados: number
}

const resultadoSchema = z.object({
  vin: z.string().min(1),
  informacion: z.enum(['disponible', 'pendiente']),
  traslado: z.unknown().optional(),
})

/**
 * Lee la respuesta de la consulta masiva. Un VIN `disponible` sin traslado válido, o cuya orden llegara **anulada**, se
 * muestra como pendiente de información: no se enseña lo que la vista no muestra (las anuladas), ni se pierde el VIN.
 * `null` si no es una lista de resultados.
 */
export function aResultadosVines(crudo: unknown): ResultadosVinesLeidos | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const { resultados } = crudo as { resultados?: unknown }
  if (!Array.isArray(resultados)) return null

  const leidos: ResultadoVin[] = []
  let descartados = 0
  for (const item of resultados) {
    const r = resultadoSchema.safeParse(item)
    if (!r.success) {
      descartados++
      continue
    }
    const traslado = r.data.informacion === 'disponible' ? aTraslado(r.data.traslado) : null
    if (traslado && esVisible(traslado)) leidos.push({ vin: r.data.vin, informacion: 'disponible', traslado })
    else leidos.push({ vin: r.data.vin, informacion: 'pendiente' })
  }
  return { resultados: leidos, descartados }
}
