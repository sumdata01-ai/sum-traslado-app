import { z } from 'zod'
import type {
  ConductorRepetido,
  ConductorTablero,
  DesglosePunto,
  DiaTablero,
  IntentoTablero,
  IntentosTablero,
  LlegadaTablero,
  PuntoFicha,
  PuntosTablero,
} from '../domain'

/**
 * Contrato de `GET /api/llegada-qr/dia`, `/intentos` y `/puntos` (`sum-bck-modulos`, `app/schemas/llegada_qr_lectura.py`;
 * plan en docs/07-planificacion/plan-dashboard-llegadas.md).
 *
 * El esquema solo deja pasar lo que la pantalla usa. En particular **un campo `secreto` o un texto completo del QR que el
 * servidor mandara por error no llega a la interfaz**: no se lee.
 */
const conductor = z.object({ id_usuario: z.number().int(), username: z.string().nullish(), nombre: z.string().nullish() })

const llegadaSchema = z.object({
  id_llegada: z.number().int(),
  turno: z.number().int(),
  punto: z.object({ id_punto: z.number().int(), nombre: z.string(), radio_m: z.number(), precision_max_m: z.number() }),
  conductor,
  step: z.number().int(),
  hora_oficial: z.string().min(1),
  hora_recepcion: z.string().min(1),
  demora_s: z.number(),
  pasos: z.number().int(),
  flag: z.boolean(),
  flags: z.array(z.string()),
  latitud: z.number(),
  longitud: z.number(),
  distancia_m: z.number(),
  pct_radio: z.number(),
  precision_m: z.number(),
})

const intentoSchema = z.object({
  id_intento: z.number().int(),
  hora_recepcion: z.string().min(1),
  conductor,
  punto: z.object({ id_punto: z.number().int(), nombre: z.string() }).nullish(),
  motivo: z.string(),
  etiqueta: z.string(),
  antiguedad_qr_s: z.number().nullish(),
  texto_inicio: z.string(),
  repeticiones_conductor_dia: z.number().int(),
})

const puntoSchema = z.object({
  id_punto: z.number().int(),
  nombre: z.string(),
  activo: z.boolean(),
  latitud: z.number(),
  longitud: z.number(),
  radio_m: z.number(),
  precision_max_m: z.number(),
  peor_caso_m: z.number(),
  llegadas_dia: z.number().int(),
  ultimo_escaneo: z.string().nullish(),
})

const resumenSchema = z.object({
  total: z.number().int(),
  por_punto: z.array(z.object({ id_punto: z.number().int(), nombre: z.string(), total: z.number().int() })),
  con_flag: z.number().int(),
  rechazados: z.number().int(),
  mediana_demora_s: z.number(),
})

const repetidoSchema = z.object({ conductor, veces: z.number().int() })

const senalesSchema = z.object({ con_flag: z.number().int(), qr_vencido_repetido: z.array(z.unknown()) })

const aConductor = (c: z.infer<typeof conductor>): ConductorTablero => ({ idUsuario: c.id_usuario, username: c.username ?? null, nombre: c.nombre ?? null })

function aLlegada(crudo: unknown): LlegadaTablero | null {
  const r = llegadaSchema.safeParse(crudo)
  if (!r.success) return null
  const l = r.data
  return {
    idLlegada: l.id_llegada,
    turno: l.turno,
    punto: { idPunto: l.punto.id_punto, nombre: l.punto.nombre, radioM: l.punto.radio_m, precisionMaxM: l.punto.precision_max_m },
    conductor: aConductor(l.conductor),
    step: l.step,
    horaOficial: l.hora_oficial,
    horaRecepcion: l.hora_recepcion,
    demoraS: l.demora_s,
    pasos: l.pasos,
    flag: l.flag,
    flags: l.flags,
    latitud: l.latitud,
    longitud: l.longitud,
    distanciaM: l.distancia_m,
    pctRadio: l.pct_radio,
    precisionM: l.precision_m,
  }
}

function aIntento(crudo: unknown): IntentoTablero | null {
  const r = intentoSchema.safeParse(crudo)
  if (!r.success) return null
  const i = r.data
  return {
    idIntento: i.id_intento,
    horaRecepcion: i.hora_recepcion,
    conductor: aConductor(i.conductor),
    punto: i.punto ? { idPunto: i.punto.id_punto, nombre: i.punto.nombre } : null,
    motivo: i.motivo,
    etiqueta: i.etiqueta,
    antiguedadQrS: i.antiguedad_qr_s ?? null,
    textoInicio: i.texto_inicio,
    repeticionesConductorDia: i.repeticiones_conductor_dia,
  }
}

function aPunto(crudo: unknown): PuntoFicha | null {
  const r = puntoSchema.safeParse(crudo)
  if (!r.success) return null
  const p = r.data
  return {
    idPunto: p.id_punto,
    nombre: p.nombre,
    activo: p.activo,
    latitud: p.latitud,
    longitud: p.longitud,
    radioM: p.radio_m,
    precisionMaxM: p.precision_max_m,
    peorCasoM: p.peor_caso_m,
    llegadasDia: p.llegadas_dia,
    ultimoEscaneo: p.ultimo_escaneo ?? null,
  }
}

/** Separa lo válido de lo malo: lo malo se salta y se cuenta, no vacía la lista. */
function leerLista<T>(lista: unknown[], leer: (crudo: unknown) => T | null): { validos: T[]; descartados: number } {
  const validos: T[] = []
  let descartados = 0
  for (const item of lista) {
    const leido = leer(item)
    if (leido) validos.push(leido)
    else descartados++
  }
  return { validos, descartados }
}

const objeto = (crudo: unknown): Record<string, unknown> | null => (typeof crudo === 'object' && crudo !== null && !Array.isArray(crudo) ? (crudo as Record<string, unknown>) : null)
const idPunto = (valor: unknown) => (typeof valor === 'number' && Number.isInteger(valor) ? valor : null)

export interface DiaLeido {
  dia: DiaTablero
  /** Filas que el servidor mandó con datos inválidos y no se muestran. */
  descartadas: number
}

/** `GET /dia`. `null` si la respuesta no tiene la forma esperada (el llamador la trata como un error del servidor). */
export function aDia(crudo: unknown): DiaLeido | null {
  const o = objeto(crudo)
  if (!o || typeof o.dia !== 'string' || !Array.isArray(o.llegadas) || typeof o.truncado !== 'boolean') return null
  const resumen = resumenSchema.safeParse(o.resumen)
  const senales = senalesSchema.safeParse(o.senales)
  if (!resumen.success || !senales.success) return null

  const { validos: llegadas, descartados } = leerLista(o.llegadas, aLlegada)
  const { validos: repetidos, descartados: repetidosMalos } = leerLista(senales.data.qr_vencido_repetido, (c) => {
    const r = repetidoSchema.safeParse(c)
    return r.success ? ({ conductor: aConductor(r.data.conductor), veces: r.data.veces } satisfies ConductorRepetido) : null
  })
  const r = resumen.data
  return {
    descartadas: descartados + repetidosMalos,
    dia: {
      dia: o.dia,
      idPunto: idPunto(o.id_punto),
      resumen: {
        total: r.total,
        porPunto: r.por_punto.map((p): DesglosePunto => ({ idPunto: p.id_punto, nombre: p.nombre, total: p.total })),
        conFlag: r.con_flag,
        rechazados: r.rechazados,
        medianaDemoraS: r.mediana_demora_s,
      },
      senales: { conFlag: senales.data.con_flag, qrVencidoRepetido: repetidos },
      llegadas,
      truncado: o.truncado,
    },
  }
}

export interface IntentosLeidos {
  intentos: IntentosTablero
  descartados: number
}

/** `GET /intentos`. `null` si la respuesta no tiene la forma esperada. */
export function aIntentos(crudo: unknown): IntentosLeidos | null {
  const o = objeto(crudo)
  if (!o || typeof o.dia !== 'string' || !Array.isArray(o.intentos) || typeof o.truncado !== 'boolean') return null
  const { validos, descartados } = leerLista(o.intentos, aIntento)
  return { descartados, intentos: { dia: o.dia, idPunto: idPunto(o.id_punto), intentos: validos, truncado: o.truncado } }
}

export interface PuntosLeidos {
  puntos: PuntosTablero
  descartados: number
}

/** `GET /puntos`. `null` si la respuesta no tiene la forma esperada. */
export function aPuntos(crudo: unknown): PuntosLeidos | null {
  const o = objeto(crudo)
  if (!o || typeof o.dia !== 'string' || !Array.isArray(o.puntos)) return null
  const { validos, descartados } = leerLista(o.puntos, aPunto)
  return { descartados, puntos: { dia: o.dia, puntos: validos } }
}
