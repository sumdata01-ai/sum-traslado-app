/**
 * Marcación de llegada por QR (lado del conductor). Contrato de `POST /mobile/llegadas` y reglas del cliente, iguales a las
 * de la app móvil (`sum-app`, `llegada_api.dart` y `llegada_ubicacion.dart`): una web no debe leer los rechazos del
 * servidor de otra manera que la app.
 *
 * Dominio puro: sin navegador, sin red. Quien llama pasa la hora y el texto de la respuesta.
 */

/** La llegada que el servidor confirmó. **No lleva los `flags`**: el servidor los manda, pero no se le muestran al conductor, y no tener el campo hace imposible mostrarlos por descuido. */
export interface LlegadaConfirmada {
  idLlegada: number
  /** El nombre del punto, para mostrarlo. */
  punto: string
  /** La hora OFICIAL de llegada (la del `step` del QR, no la de la petición), en milisegundos desde 1970. */
  fechaLlegada: number
  /** El turno del día en este punto, tal cual lo da el servidor. */
  turno: number
}

/** Lo que puede salir de mandar un QR al servidor. Un caso por cada cosa que la pantalla trata distinto. */
export type ResultadoLlegada =
  /** 201 (nueva) o 200 (ya estaba registrada: reenviar un escaneo es seguro). */
  | { tipo: 'confirmada'; llegada: LlegadaConfirmada; yaRegistrada: boolean }
  /** 400 `INVALID_CODE`. El servidor no dice por qué, a propósito: reenviar el mismo QR no sirve. */
  | { tipo: 'codigoInvalido' }
  /** 400 `OUT_OF_GEOFENCE` con motivo `fuera_de_zona`. */
  | { tipo: 'fueraDeZona' }
  /** 400 `OUT_OF_GEOFENCE` con motivo `precision_insuficiente`; `precisionMaxM` es lo que acepta el punto (puede faltar). */
  | { tipo: 'precisionInsuficiente'; precisionMaxM: number | null }
  /** 422: una ubicación que el servidor no acepta. No se muestra la lista de errores de FastAPI. */
  | { tipo: 'ubicacionNoLeida' }
  /** 403: «tu rol no puede marcar llegada». No cierra la sesión. */
  | { tipo: 'sinPermiso' }
  /** 401 que no se pudo renovar. */
  | { tipo: 'sesionVencida' }
  /** Sin conexión con el servidor. */
  | { tipo: 'sinRed' }
  /** Cualquier otra cosa (500, un cuerpo que no se entiende…). Reintentar puede ayudar. */
  | { tipo: 'error'; status: number | null }

/**
 * El cuerpo de `POST /mobile/llegadas`.
 *
 * 🔴 **Exactamente cuatro campos, y ninguno es una fecha**: la hora oficial es la del `step` del QR y la de recepción la pone el
 * servidor. Tampoco hay usuario: sale del token. El texto del QR va **tal cual**, sin `trim()` ni cambio de mayúsculas.
 */
export function cuerpoDeLlegada(datos: { payload: string; latitud: number; longitud: number; precisionM: number }) {
  return { payload: datos.payload, latitud: datos.latitud, longitud: datos.longitud, precision_m: datos.precisionM }
}

const objeto = (valor: unknown): Record<string, unknown> | null =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null

function leerJson(texto: string): Record<string, unknown> | null {
  try {
    return objeto(JSON.parse(texto))
  } catch {
    return null
  }
}

// El servidor manda la hora con zona (`-05:00`); sin zona se lee como UTC para que cada teléfono vea la misma hora.
const TIENE_ZONA = /(Z|[+-]\d{2}:?\d{2})$/i

function llegadaDe(texto: string): LlegadaConfirmada | null {
  const j = leerJson(texto)
  if (!j) return null
  const { id_llegada: id, punto, fecha_llegada: fecha, turno } = j
  if (!Number.isInteger(id) || typeof punto !== 'string' || typeof fecha !== 'string' || !Number.isInteger(turno)) return null
  const instante = Date.parse(TIENE_ZONA.test(fecha) ? fecha : `${fecha}Z`)
  if (Number.isNaN(instante)) return null
  return { idLlegada: id as number, punto, fechaLlegada: instante, turno: turno as number }
}

function rechazoDe(texto: string): ResultadoLlegada {
  const j = leerJson(texto)
  if (j?.code === 'INVALID_CODE') return { tipo: 'codigoInvalido' }
  if (j?.code === 'OUT_OF_GEOFENCE') {
    if (j.motivo === 'fuera_de_zona') return { tipo: 'fueraDeZona' }
    if (j.motivo === 'precision_insuficiente') {
      const max = j.precision_max_m
      return { tipo: 'precisionInsuficiente', precisionMaxM: typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : null }
    }
  }
  // Un 400 que no es ninguno de los dos rechazos de negocio: no se adivina qué significa.
  return { tipo: 'error', status: 400 }
}

/** Lee la respuesta de `POST /mobile/llegadas`. Función pura: no toca la red ni la sesión. */
export function interpretarRespuestaLlegada(status: number, cuerpo: string): ResultadoLlegada {
  switch (status) {
    case 200:
    case 201: {
      const llegada = llegadaDe(cuerpo)
      return llegada ? { tipo: 'confirmada', llegada, yaRegistrada: status === 200 } : { tipo: 'error', status }
    }
    case 400:
      return rechazoDe(cuerpo)
    case 401:
      return { tipo: 'sesionVencida' }
    case 403:
      return { tipo: 'sinPermiso' }
    case 422:
      return { tipo: 'ubicacionNoLeida' }
    default:
      return { tipo: 'error', status }
  }
}

// ── Ubicación ────────────────────────────────────────────────────────────────

/** Una lectura del GPS: dónde está el teléfono, con qué precisión y **cuándo se midió**. */
export interface FixUbicacion {
  latitud: number
  longitud: number
  /** `coords.accuracy`, en metros. */
  precisionM: number
  /** `position.timestamp`: el instante de la medición, en milisegundos desde 1970. */
  momento: number
}

/** La antigüedad máxima de un fix para usarlo. Pasada, es una posición en caché que puede tener horas. */
export const EDAD_MAXIMA_FIX_MS = 20_000

/** Cuánto se espera una ubicación o una precisión mejor antes de rendirse. */
export const TOPE_ESPERA_UBICACION_MS = 30_000

/**
 * ¿Sirve este fix para marcar una llegada? Exige coordenadas posibles, una precisión conocida (finita y no negativa) y una
 * antigüedad de `edadMaximaMs` como mucho. **Nunca se usa «la última posición conocida»**: un fix viejo se descarta por su
 * `momento`, sin confiar en cómo se obtuvo.
 *
 * La antigüedad se mide en valor absoluto: un reloj del teléfono adelantado o atrasado más que `edadMaximaMs` respecto del GPS
 * deja el fix sin servir, en un sentido o en otro, en lugar de aceptar uno cuya frescura no se puede afirmar.
 *
 * Con `precisionMaxM` además exige `precisionM <= precisionMaxM`.
 */
export function esFixUtil(
  fix: FixUbicacion,
  { ahora, edadMaximaMs = EDAD_MAXIMA_FIX_MS, precisionMaxM }: { ahora: number; edadMaximaMs?: number; precisionMaxM?: number | null },
): boolean {
  if (!Number.isFinite(fix.latitud) || fix.latitud < -90 || fix.latitud > 90) return false
  if (!Number.isFinite(fix.longitud) || fix.longitud < -180 || fix.longitud > 180) return false
  if (!Number.isFinite(fix.precisionM) || fix.precisionM < 0) return false
  if (!Number.isFinite(fix.momento) || Math.abs(ahora - fix.momento) > edadMaximaMs) return false
  if (precisionMaxM != null && fix.precisionM > precisionMaxM) return false
  return true
}

// ── Texto de la hora ─────────────────────────────────────────────────────────

/** Perú no tiene horario de verano: Lima es UTC−5 todo el año. Se calcula a mano para que el texto sea el mismo en todos los navegadores. */
const DESFASE_DE_LIMA_MS = -5 * 60 * 60 * 1000

const dos = (n: number) => String(n).padStart(2, '0')

/** «Hoy 14:35» si la llegada fue el mismo día de Lima que `ahora`; si no, «13/10 14:35». Siempre en hora de Lima. */
export function textoDeLlegada(fechaLlegada: number, ahora: number): string {
  const f = new Date(fechaLlegada + DESFASE_DE_LIMA_MS)
  const a = new Date(ahora + DESFASE_DE_LIMA_MS)
  const hora = `${dos(f.getUTCHours())}:${dos(f.getUTCMinutes())}`
  const mismoDia = f.getUTCFullYear() === a.getUTCFullYear() && f.getUTCMonth() === a.getUTCMonth() && f.getUTCDate() === a.getUTCDate()
  return mismoDia ? `Hoy ${hora}` : `${dos(f.getUTCDate())}/${dos(f.getUTCMonth() + 1)} ${hora}`
}
