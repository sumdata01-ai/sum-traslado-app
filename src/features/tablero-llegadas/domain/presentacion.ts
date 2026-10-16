import type { IntentoTablero, LlegadaTablero } from './tablero'

/**
 * Lima no tiene horario de verano: es siempre UTC−5. Se calcula a mano y no con `Intl`, para que el texto sea el mismo en
 * todos los navegadores y no dependa de la zona del equipo: una fecha de calendario es el texto `AAAA-MM-DD`, nunca se
 * calcula con la zona del navegador.
 */
const OFFSET_LIMA_MS = -5 * 60 * 60 * 1000
const MS_POR_DIA = 86_400_000
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const TIENE_ZONA = /(Z|[+-]\d{2}:?\d{2})$/i

/** Cuántos días hacia atrás se puede consultar (los intentos más viejos no se muestran; se ocultan, no se borran). */
export const DIAS_DE_RETENCION = 90

const dos = (n: number) => String(n).padStart(2, '0')

function instante(iso: string | null | undefined): number | null {
  if (!iso) return null
  // Un texto sin zona se lee como UTC: leído como hora local, cada persona vería una hora distinta.
  const ms = Date.parse(TIENE_ZONA.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(ms) ? null : ms
}

/** «14:35:00»: la hora de Lima de un instante ISO, o «—» si no es una fecha. */
export function horaLima(iso: string | null | undefined): string {
  const ms = instante(iso)
  if (ms === null) return '—'
  const lima = new Date(ms + OFFSET_LIMA_MS)
  return `${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}:${dos(lima.getUTCSeconds())}`
}

/** «12:10»: la hora de Lima de un instante en milisegundos (la última actualización). */
export function horaMinutoLima(ms: number): string {
  const lima = new Date(ms + OFFSET_LIMA_MS)
  return `${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}`
}

// ── Días de Lima ──────────────────────────────────────────────────────────────

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/

function aUtc(dia: string): number | null {
  const m = DIA.exec(dia)
  if (!m) return null
  const [anio, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(anio, mes - 1, d)
  const f = new Date(ms)
  // `Date.UTC` corrige un 31 de febrero en vez de rechazarlo: se comprueba que el día sea el pedido.
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d ? ms : null
}

const deUtc = (ms: number) => {
  const f = new Date(ms)
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`
}

/** El día de calendario de Lima de un instante en milisegundos (`AAAA-MM-DD`). */
export const hoyEnLima = (ahoraMs: number): string => deUtc(ahoraMs + OFFSET_LIMA_MS)

/** `dia` más `n` días (negativo, hacia atrás). `null` si `dia` no es una fecha. */
export function sumarDias(dia: string, n: number): string | null {
  const ms = aUtc(dia)
  return ms === null ? null : deUtc(ms + n * MS_POR_DIA)
}

/** El día más viejo que se puede consultar desde `hoy`. */
export const diaMasViejo = (hoy: string): string => sumarDias(hoy, -DIAS_DE_RETENCION) ?? hoy

/** ¿Se puede consultar este día? Una fecha real, no futura y de los últimos 90 días. */
export function esDiaConsultable(dia: string, hoy: string): boolean {
  if (aUtc(dia) === null) return false
  return dia <= hoy && dia >= diaMasViejo(hoy) // `AAAA-MM-DD` ordena igual como texto que como fecha
}

/** «15 oct 2026», o «hoy» si es `hoy`. El año siempre: se puede mirar hasta 90 días atrás, que cruzan de año. */
export function textoDia(dia: string, hoy: string): string {
  const ms = aUtc(dia)
  if (ms === null) return dia
  const f = new Date(ms)
  const texto = `${f.getUTCDate()} ${MESES[f.getUTCMonth()]} ${f.getUTCFullYear()}`
  return dia === hoy ? `${texto} · hoy` : texto
}

// ── Números y tiempos ─────────────────────────────────────────────────────────

/** «27,5 m»: metros con coma decimal, como se escribe en Perú. */
export function metros(valor: number, decimales = 1): string {
  return `${valor.toFixed(decimales).replace('.', ',')} m`
}

/** Un número con coma decimal y sin ceros de más: `12` → «12», `11.5` → «11,5». */
export function numero(valor: number): string {
  return String(Number(valor.toFixed(1))).replace('.', ',')
}

/**
 * La demora del QR: «14 s»; de más de 60 s, «1 min 11 s». Negativa (QR «del futuro»), con el signo.
 * Se redondea al segundo: el servidor manda un decimal y la lista no lo necesita.
 */
export function textoDemora(segundos: number): string {
  const total = Math.round(Math.abs(segundos))
  const signo = segundos < 0 ? '−' : ''
  return total <= 60 ? `${signo}${total} s` : `${signo}${Math.floor(total / 60)} min ${total % 60} s`
}

/** La antigüedad de un QR vencido: «hace 18 h 2 min», «hace 14 min 0 s», «hace 45 s». Negativa: «es del futuro». */
export function textoAntiguedad(segundos: number): string {
  if (segundos < 0) return `del futuro (${textoDuracion(-segundos)})`
  return `hace ${textoDuracion(segundos)}`
}

function textoDuracion(segundos: number): string {
  const total = Math.round(segundos)
  if (total >= 3600) return `${Math.floor(total / 3600)} h ${Math.floor((total % 3600) / 60)} min`
  if (total >= 60) return `${Math.floor(total / 60)} min ${total % 60} s`
  return `${total} s`
}

// ── Estado de una llegada ─────────────────────────────────────────────────────

export type TonoEstado = 'normal' | 'flag'

export interface EstadoLlegada {
  tono: TonoEstado
  /** El texto, siempre: el color nunca va solo. */
  texto: string
}

/** «Normal», o «OUT_OF_WINDOW · N pasos» (N en valor absoluto: un QR del futuro también tiene pasos). */
export function estadoDe(llegada: Pick<LlegadaTablero, 'flag' | 'pasos'>): EstadoLlegada {
  if (!llegada.flag) return { tono: 'normal', texto: 'Normal' }
  return { tono: 'flag', texto: `OUT_OF_WINDOW · ${Math.abs(llegada.pasos)} pasos` }
}

/** El resumen en lenguaje llano del detalle de una llegada. */
export function resumenDeLlegada(llegada: Pick<LlegadaTablero, 'flag' | 'pasos'>): string {
  const pasos = Math.abs(llegada.pasos)
  if (llegada.flag) {
    return `Entró con flag. Cuando el servidor lo recibió, el QR tenía ${pasos} pasos (${textoDuracion(pasos * 30)} de antigüedad). Hasta 2 pasos es normal, hasta 20 (10 min) se acepta con flag, y más se rechaza. El conductor lo vio como una confirmación normal.`
  }
  return `El QR tenía ${pasos} pasos al llegar: dentro de lo normal (hasta 2 pasos, 60 s).`
}

// ── Conductores ───────────────────────────────────────────────────────────────

/** El nombre del conductor, o su usuario, o su id (si la fila del usuario no existe). */
export const nombreConductor = (c: { idUsuario: number; username: string | null; nombre: string | null }): string =>
  c.nombre?.trim() || c.username || `Usuario ${c.idUsuario}`

/** El usuario del conductor para la segunda línea; vacío si no lo hay. */
export const usuarioConductor = (c: { username: string | null }): string => c.username ?? ''

// ── Motivos de un código rechazado ────────────────────────────────────────────

export type TonoMotivo = 'neutro' | 'rojo' | 'ambar'

export interface DescripcionMotivo {
  etiqueta: string
  tono: TonoMotivo
  /** Qué puede significar, en lenguaje llano. */
  ayuda: string
}

/** El texto que se muestra es siempre este, no el valor crudo de la base (decidido en el spec). */
export const MOTIVOS: Readonly<Record<string, DescripcionMotivo>> = {
  payload_ilegible: {
    etiqueta: 'Texto ilegible',
    tono: 'neutro',
    ayuda: 'No tiene la forma de un QR de llegada. Suele ser otro código leído por error (un VIN, un enlace).',
  },
  punto_inexistente: {
    etiqueta: 'Punto inexistente',
    tono: 'rojo',
    ayuda: 'El QR dice un punto que no existe. Puede ser un código falso o de otro sistema.',
  },
  punto_inactivo: {
    etiqueta: 'Punto desactivado',
    tono: 'ambar',
    ayuda: 'El punto existe pero está desactivado. Puede ser una tablet que sigue mostrando un QR de un punto dado de baja.',
  },
  codigo_no_coincide: {
    etiqueta: 'Código no coincide',
    tono: 'rojo',
    ayuda: 'La firma no corresponde al punto. Un QR falsificado, o de otro punto con el mismo número.',
  },
  fuera_de_tope: {
    etiqueta: 'QR demasiado viejo',
    tono: 'ambar',
    ayuda: 'El QR es auténtico pero pasó el tope de 10 minutos. Es lo que deja una foto del QR enviada tarde.',
  },
}

/** Los motivos en el orden de los chips. */
export const ORDEN_MOTIVOS = ['payload_ilegible', 'punto_inexistente', 'punto_inactivo', 'codigo_no_coincide', 'fuera_de_tope'] as const

const MOTIVO_DESCONOCIDO: DescripcionMotivo = { etiqueta: 'Otro motivo', tono: 'neutro', ayuda: 'Un motivo que esta pantalla todavía no conoce.' }

export const descripcionDeMotivo = (motivo: string): DescripcionMotivo => MOTIVOS[motivo] ?? MOTIVO_DESCONOCIDO

// ── Filtros y orden ───────────────────────────────────────────────────────────

export type ChipEstado = 'todas' | 'flag'

const minusculas = (texto: string) => texto.trim().toLowerCase()

/** Filtra por estado y por el nombre o usuario del conductor, sin distinguir mayúsculas. */
export function filtrarLlegadas(llegadas: readonly LlegadaTablero[], filtro: { chip: ChipEstado; texto: string }): LlegadaTablero[] {
  const q = minusculas(filtro.texto)
  return llegadas.filter(
    (l) =>
      (filtro.chip === 'todas' || l.flag) &&
      (q === '' || minusculas(l.conductor.nombre ?? '').includes(q) || minusculas(l.conductor.username ?? '').includes(q)),
  )
}

/** Por hora de recepción: de la más antigua a la más reciente, o al revés. El `id` desempata. */
export function ordenarPorRecepcion(llegadas: readonly LlegadaTablero[], masRecientesPrimero: boolean): LlegadaTablero[] {
  const signo = masRecientesPrimero ? -1 : 1
  return [...llegadas].sort((a, b) => signo * ((instante(a.horaRecepcion) ?? 0) - (instante(b.horaRecepcion) ?? 0) || a.idLlegada - b.idLlegada))
}

/** Filtra los rechazos por motivo (`null` = todos) y por el nombre o usuario del conductor. Conserva el orden. */
export function filtrarIntentos(intentos: readonly IntentoTablero[], filtro: { motivo: string | null; texto: string }): IntentoTablero[] {
  const q = minusculas(filtro.texto)
  return intentos.filter(
    (i) =>
      (filtro.motivo === null || i.motivo === filtro.motivo) &&
      (q === '' || minusculas(i.conductor.nombre ?? '').includes(q) || minusculas(i.conductor.username ?? '').includes(q)),
  )
}

// ── El esquema de «dónde escaneó» ─────────────────────────────────────────────

const METROS_POR_GRADO = 111_320

export interface EsquemaUbicacion {
  /** Posición del teléfono en un lienzo de `lado` × `lado`, con el centro del punto al medio. */
  x: number
  y: number
  /** Radio del círculo del punto, en el lienzo. */
  radioPx: number
  /** Radio del círculo de precisión del teléfono, en el lienzo (acotado para que no se salga). */
  precisionPx: number
  /** De dónde sale la dirección: `coordenadas` (rumbo entre el centro y el teléfono) o `desconocida` (no hay centro). */
  direccion: 'coordenadas' | 'desconocida'
}

/**
 * Las posiciones del dibujo de «dónde escaneó». **Es un esquema, no un mapa**: el círculo es el radio del punto, y el teléfono
 * se pone a `distancia_m` del centro (lo que calculó el servidor) en la dirección del rumbo entre el centro y sus coordenadas.
 * Sin las coordenadas del centro (la ficha del punto no llegó) se dibuja a la derecha y se dice que la dirección no se sabe.
 */
export function esquemaDeUbicacion(datos: {
  lado: number
  radioM: number
  distanciaM: number
  precisionM: number
  centro: { latitud: number; longitud: number } | null
  telefono: { latitud: number; longitud: number }
}): EsquemaUbicacion {
  const { lado, radioM, distanciaM, precisionM, centro, telefono } = datos
  const medio = lado / 2
  const radioPx = lado * 0.31
  const escala = radioPx / radioM
  let rumbo = Math.PI / 2 // al este
  let direccion: EsquemaUbicacion['direccion'] = 'desconocida'
  if (centro) {
    const norte = (telefono.latitud - centro.latitud) * METROS_POR_GRADO
    const este = (telefono.longitud - centro.longitud) * METROS_POR_GRADO * Math.cos((centro.latitud * Math.PI) / 180)
    if (norte !== 0 || este !== 0) {
      rumbo = Math.atan2(este, norte)
      direccion = 'coordenadas'
    }
  }
  const redondear = (n: number) => Math.round(n * 10) / 10
  return {
    x: redondear(medio + distanciaM * escala * Math.sin(rumbo)),
    y: redondear(medio - distanciaM * escala * Math.cos(rumbo)),
    radioPx: redondear(radioPx),
    precisionPx: redondear(Math.min(precisionM * escala, lado * 0.45)),
    direccion,
  }
}
