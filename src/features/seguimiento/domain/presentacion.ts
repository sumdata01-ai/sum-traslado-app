import type { EtapaSeguimiento, FiltroEtapa, TrasladoSeguimiento } from './traslado'

export const ETIQUETA_ETAPA: Record<EtapaSeguimiento, string> = {
  en_planta: 'En planta',
  en_camino: 'En camino',
  entregado: 'Entregado',
  anulado: 'Anulado',
}

const ORDEN_ETAPA: Record<EtapaSeguimiento, number> = { en_camino: 0, en_planta: 1, entregado: 2, anulado: 3 }

/**
 * Lima no tiene horario de verano: es siempre UTC-5. Se calcula a mano en vez de pedírselo a `Intl` para que el
 * texto sea el mismo en todos los navegadores (los nombres cortos de los meses cambian según la configuración regional).
 */
const OFFSET_LIMA_MS = -5 * 60 * 60 * 1000
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const TIENE_ZONA = /(Z|[+-]\d{2}:?\d{2})$/i

function aInstante(iso: string | null | undefined): number | null {
  if (!iso) return null
  // Un texto sin zona se lee como UTC: el navegador lo leería como hora local y cada persona vería una hora distinta.
  const instante = Date.parse(TIENE_ZONA.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(instante) ? null : instante
}

const dosDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * «15 oct, 07:40» en hora de Lima, o `null` si el texto no es una fecha (la pantalla muestra «—», nunca una fecha inventada).
 * Sin `conHora` solo «15 oct». El año se agrega únicamente si no es el actual.
 */
export function formatoFecha(iso: string | null | undefined, opciones: { conHora?: boolean; ahora?: Date } = {}): string | null {
  const instante = aInstante(iso)
  if (instante === null) return null
  const { conHora = true, ahora = new Date() } = opciones
  const lima = new Date(instante + OFFSET_LIMA_MS)
  const anioActual = new Date(ahora.getTime() + OFFSET_LIMA_MS).getUTCFullYear()
  const anio = lima.getUTCFullYear()
  const fecha = `${lima.getUTCDate()} ${MESES[lima.getUTCMonth()]}${anio === anioActual ? '' : ` ${anio}`}`
  return conHora ? `${fecha}, ${dosDigitos(lima.getUTCHours())}:${dosDigitos(lima.getUTCMinutes())}` : fecha
}

/** «12:10»: la hora de Lima de un instante (el de la última actualización de la lista). */
export function horaDeLima(instante: number): string {
  const lima = new Date(instante + OFFSET_LIMA_MS)
  return `${dosDigitos(lima.getUTCHours())}:${dosDigitos(lima.getUTCMinutes())}`
}

/** El VIN completo (2026-10-15: el coordinador pidió verlo entero; antes se abreviaba a los últimos 6 caracteres). */
export function identificadorVehiculo(vin: string): string {
  return `VIN ${vin}`
}

/**
 * La clave con la que se busca el logo de una marca: minúsculas, sin tildes ni signos («Mercedes-Benz» → `mercedesbenz`).
 * Las variantes de Volkswagen que usa el catálogo de SUM (`VW`, `VW PASAJEROS`, `VWPASAJEROS`, `VW COMERCIALES`, `VW CAMIONES`)
 * se leen como Volkswagen. `null` si no hay marca.
 */
export function claveMarca(marca: string | null | undefined): string | null {
  const clave = normalizarTexto(marca ?? '').replace(/[^a-z0-9]/g, '')
  if (clave === '') return null
  return ALIAS_MARCA[clave] ?? clave
}

const ALIAS_MARCA: Record<string, string> = {
  vw: 'volkswagen',
  vwpasajeros: 'volkswagen',
  vwcomerciales: 'volkswagen',
  vwcamiones: 'volkswagen',
}

/** El logo de una marca entre los disponibles (por clave: `toyota`, `volkswagen`…), o `undefined` si no hay. */
export function logoDeMarca(logos: Readonly<Record<string, string>>, marca: string | null | undefined): string | undefined {
  const clave = claveMarca(marca)
  return clave === null ? undefined : logos[clave]
}

/** «Toyota Corolla», o «Vehículo» si el servidor no mandó ni marca ni modelo. */
export function nombreVehiculo(t: Pick<TrasladoSeguimiento, 'marca' | 'modelo'>): string {
  return [t.marca, t.modelo].filter(Boolean).join(' ') || 'Vehículo'
}

export interface Hito {
  titulo: string
  /** `null`: sin registro; la pantalla muestra «—». Nunca «Pendiente» ni una fecha supuesta. */
  fecha: string | null
  nota: string | null
}

/** Los hitos que el sistema registró: la salida y la entrega. */
export function hitosDe(t: Pick<TrasladoSeguimiento, 'salidaRegistrada' | 'entregadoEn' | 'entregaEstimada'>, ahora: Date = new Date()): Hito[] {
  const entregaSinHora = t.entregadoEn !== null && t.entregaEstimada
  return [
    { titulo: 'Salida registrada', fecha: formatoFecha(t.salidaRegistrada, { ahora }), nota: null },
    {
      titulo: 'Entrega',
      fecha: formatoFecha(t.entregadoEn, { conHora: !t.entregaEstimada, ahora }),
      nota: entregaSinHora && formatoFecha(t.entregadoEn) !== null ? 'Hora no disponible' : null,
    },
  ]
}

/** En camino primero, luego en planta, entregados y anulados; dentro de cada grupo, lo más reciente arriba. */
export function ordenarTraslados(traslados: readonly TrasladoSeguimiento[]): TrasladoSeguimiento[] {
  const reciente = (t: TrasladoSeguimiento) => aInstante(t.entregadoEn ?? t.salidaRegistrada) ?? Number.NEGATIVE_INFINITY
  return [...traslados].sort((a, b) => ORDEN_ETAPA[a.etapa] - ORDEN_ETAPA[b.etapa] || reciente(b) - reciente(a) || b.idOrden - a.idOrden)
}

const normalizarTexto = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export interface FiltrosSeguimiento {
  etapa: FiltroEtapa
  texto: string
  /** El nombre del destino, o `'todos'`. */
  destino: string
}

/**
 * Filtra y ordena. La pestaña «En camino» y «Entregados» muestran solo esa etapa; «Todos» muestra todo, también
 * lo que está en planta o anulado. El texto busca (todas las palabras) en VIN, marca, modelo, color y destino, sin
 * distinguir mayúsculas ni tildes.
 */
export function filtrarTraslados(traslados: readonly TrasladoSeguimiento[], filtros: FiltrosSeguimiento): TrasladoSeguimiento[] {
  const palabras = normalizarTexto(filtros.texto).split(/\s+/).filter(Boolean)
  const coinciden = traslados.filter((t) => {
    if (filtros.etapa !== 'todos' && t.etapa !== filtros.etapa) return false
    if (filtros.destino !== 'todos' && t.destino !== filtros.destino) return false
    if (palabras.length === 0) return true
    const pajar = normalizarTexto([t.vin, t.marca, t.modelo, t.color, t.destino].filter(Boolean).join(' '))
    return palabras.every((palabra) => pajar.includes(palabra))
  })
  return ordenarTraslados(coinciden)
}

/** Cuántos traslados hay en cada pestaña. «Todos» es el total. */
export function contarPorEtapa(traslados: readonly Pick<TrasladoSeguimiento, 'etapa'>[]): Record<FiltroEtapa, number> {
  return {
    todos: traslados.length,
    en_camino: traslados.filter((t) => t.etapa === 'en_camino').length,
    entregado: traslados.filter((t) => t.etapa === 'entregado').length,
  }
}

/**
 * ¿Se muestra este traslado al coordinador? **Las órdenes anuladas no** (2026-10-15, a pedido del usuario: ver una orden
 * anulada en la lista confunde y no hay nada que seguir). El servidor puede seguir mandándolas: la web las descarta aquí,
 * antes de armar la lista, el selector de destinos y los conteos, para que no aparezcan por ningún camino.
 */
export const esVisible = (t: Pick<TrasladoSeguimiento, 'etapa'>): boolean => t.etapa !== 'anulado'

/** Los destinos distintos, por orden alfabético, para el selector. */
export function destinosDe(traslados: readonly TrasladoSeguimiento[]): string[] {
  return [...new Set(traslados.map((t) => t.destino).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, 'es'))
}
