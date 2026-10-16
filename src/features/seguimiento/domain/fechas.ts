/**
 * El filtro por fecha de la vista del coordinador (2026-10-16). Todo es **día de Lima** (`AAAA-MM-DD`), nunca la hora del
 * teléfono ni la de UTC: a las 22:00 de Lima ya es el día siguiente en UTC, y «Hoy» no puede cambiar a esa hora.
 *
 * El rango se le pide al servidor (`GET /api/seguimiento/traslados?desde&hasta`): lo que trae es lo que **pasó** esos días
 * (una salida o una entrega registrada), en camino o entregado. Las reglas de aquí (a lo más 90 días, sin fechas futuras,
 * inicio no posterior al fin) son las mismas que aplica el servidor; se comprueban antes para decirlo sin esperar un 422.
 */

import type { TrasladoSeguimiento } from './traslado'

/** Un rango de días de Lima, ambos incluidos. */
export interface RangoFechas {
  readonly desde: string
  readonly hasta: string
}

/** Lo más largo que se puede pedir de una vez (igual que el servidor: acota la respuesta). */
export const MAX_DIAS_RANGO = 90

export type PresetFecha = 'hoy' | 'ayer' | 'ultimos7' | 'ultimos30'

export const PRESETS_FECHA: ReadonlyArray<{ valor: PresetFecha; etiqueta: string }> = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'ayer', etiqueta: 'Ayer' },
  { valor: 'ultimos7', etiqueta: 'Últimos 7 días' },
  { valor: 'ultimos30', etiqueta: 'Últimos 30 días' },
]

/** Lima está en UTC-5 todo el año (no tiene horario de verano). */
const DESFASE_LIMA_MS = 5 * 60 * 60 * 1000

const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

/** El día de Lima de un instante (milisegundos desde 1970). */
export function diaDeLima(instante: number): string {
  return new Date(instante - DESFASE_LIMA_MS).toISOString().slice(0, 10)
}

/** ¿Es un día real con el formato `AAAA-MM-DD`? (`2026-02-30` no lo es.) */
export function esDiaValido(texto: string): boolean {
  const partes = FORMATO_DIA.exec(texto)
  if (!partes) return false
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
}

function partesDeDia(dia: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number]
  return { anio, mes, dia: d }
}

function aMilisegundos(dia: string): number {
  const { anio, mes, dia: d } = partesDeDia(dia)
  return Date.UTC(anio, mes - 1, d)
}

/** El día `dias` después (o antes, si es negativo) de otro. */
export function sumarDias(dia: string, dias: number): string {
  return new Date(aMilisegundos(dia) + dias * 86_400_000).toISOString().slice(0, 10)
}

/** Cuántos días abarca un rango, contando el primero y el último. */
export function diasDelRango(rango: RangoFechas): number {
  return Math.round((aMilisegundos(rango.hasta) - aMilisegundos(rango.desde)) / 86_400_000) + 1
}

export function rangoDePreset(preset: PresetFecha, hoy: string): RangoFechas {
  switch (preset) {
    case 'hoy':
      return { desde: hoy, hasta: hoy }
    case 'ayer': {
      const ayer = sumarDias(hoy, -1)
      return { desde: ayer, hasta: ayer }
    }
    case 'ultimos7':
      return { desde: sumarDias(hoy, -6), hasta: hoy }
    case 'ultimos30':
      return { desde: sumarDias(hoy, -29), hasta: hoy }
  }
}

/** Qué preset es este rango (visto desde `hoy`), o `null` si es uno personalizado. */
export function presetDeRango(rango: RangoFechas, hoy: string): PresetFecha | null {
  return (
    PRESETS_FECHA.find(({ valor }) => {
      const candidato = rangoDePreset(valor, hoy)
      return candidato.desde === rango.desde && candidato.hasta === rango.hasta
    })?.valor ?? null
  )
}

/** Por qué un rango no se puede pedir, dicho al usuario; `null` si está bien. */
export function errorDeRango(desde: string, hasta: string, hoy: string): string | null {
  if (!esDiaValido(desde) || !esDiaValido(hasta)) return 'Elige las dos fechas.'
  if (desde > hasta) return 'La fecha de inicio no puede ser posterior a la de fin.'
  if (hasta > hoy) return 'La fecha de fin no puede ser futura.'
  if (diasDelRango({ desde, hasta }) > MAX_DIAS_RANGO) return `El rango no puede pasar de ${MAX_DIAS_RANGO} días.`
  return null
}

/** El texto del botón: «Hoy», «Ayer», «Últimos 7 días»… o las fechas («12–16 oct 2026») si es un rango propio. */
export function etiquetaDeRango(rango: RangoFechas, hoy: string): string {
  const preset = presetDeRango(rango, hoy)
  if (preset) return PRESETS_FECHA.find((p) => p.valor === preset)!.etiqueta

  const a = partesDeDia(rango.desde)
  const b = partesDeDia(rango.hasta)
  const mesA = MESES[a.mes - 1]
  const mesB = MESES[b.mes - 1]
  if (rango.desde === rango.hasta) return `${a.dia} ${mesA} ${a.anio}`
  if (a.anio === b.anio && a.mes === b.mes) return `${a.dia}–${b.dia} ${mesB} ${b.anio}`
  if (a.anio === b.anio) return `${a.dia} ${mesA} – ${b.dia} ${mesB} ${b.anio}`
  return `${a.dia} ${mesA} ${a.anio} – ${b.dia} ${mesB} ${b.anio}`
}

/**
 * ¿Este traslado pertenece al rango? Sí si está **en camino o entregado** y su salida o su entrega se registró en alguno de
 * esos días (de Lima). Una orden en planta no tiene ninguna fecha, y una anulada no se muestra. Es la misma regla del servidor
 * con `desde` y `hasta`; la web la repite a propósito, porque un servidor que todavía no la conozca ignora esos parámetros y
 * devuelve la lista de siempre, y bajo el rótulo «Hoy» saldrían traslados de otros días.
 */
export function trasladoEnRango(traslado: Pick<TrasladoSeguimiento, 'etapa' | 'salidaRegistrada' | 'entregadoEn'>, rango: RangoFechas): boolean {
  if (traslado.etapa !== 'en_camino' && traslado.etapa !== 'entregado') return false
  return [traslado.salidaRegistrada, traslado.entregadoEn].some((instante) => {
    if (instante === null) return false
    const tiempo = Date.parse(instante)
    if (Number.isNaN(tiempo)) return false
    const dia = diaDeLima(tiempo)
    return dia >= rango.desde && dia <= rango.hasta
  })
}
