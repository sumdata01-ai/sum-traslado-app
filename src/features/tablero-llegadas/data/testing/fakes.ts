/**
 * Dobles de prueba del tablero de llegadas: los datos de ejemplo del apéndice del spec
 * (`sum-app/docs/specs/001-marcacion-qr/dashboard-llegadas-historias.md`, **datos inventados**: conductores `op.demo01` a
 * `op.demo07`) y una API de mentira que responde como el servidor. Solo se importan desde pruebas.
 */
import type { ConsultaTablero, TableroApi } from '../../api/tableroApi'
import type { ConductorTablero, DatosTablero, IntentoTablero, LlegadaTablero, PuntoFicha } from '../../domain'
import { TableroLlegadas } from '../tableroLlegadas'

export const DIA_APENDICE = '2026-10-15'
export const PATIO = 1
export const PUERTA = 2
export const MUELLE = 3

/** Los tres puntos del apéndice. Las coordenadas son inventadas. */
export const PUNTOS_APENDICE: readonly PuntoFicha[] = [
  { idPunto: PATIO, nombre: 'Patio de llegada', activo: true, latitud: -12.05, longitud: -77.05, radioM: 100, precisionMaxM: 100, peorCasoM: 200, llegadasDia: 16, ultimoEscaneo: '2026-10-15T11:40:35-05:00' },
  { idPunto: PUERTA, nombre: 'Puerta norte', activo: true, latitud: -12.0485, longitud: -77.0492, radioM: 80, precisionMaxM: 100, peorCasoM: 180, llegadasDia: 3, ultimoEscaneo: '2026-10-15T11:03:12-05:00' },
  { idPunto: MUELLE, nombre: 'Muelle sur', activo: false, latitud: -12.0525, longitud: -77.051, radioM: 100, precisionMaxM: 100, peorCasoM: 200, llegadasDia: 0, ultimoEscaneo: null },
]

export const conductorDePrueba = (n: number): ConductorTablero => ({ idUsuario: 100 + n, username: `op.demo0${n}`, nombre: `Conductor 0${n}` })

const lima = (hms: string) => `${DIA_APENDICE}T${hms}-05:00`
const segundos = (iso: string) => Date.parse(iso) / 1000

// turno, punto, conductor, hora del QR, recibida, distancia (m), precisión (m)
const FILAS: ReadonlyArray<readonly [number, number, number, string, string, number, number]> = [
  [1, PATIO, 1, '07:12:00', '07:12:09', 31.2, 8.4], [2, PATIO, 2, '07:14:30', '07:14:44', 55.0, 12.1],
  [3, PATIO, 3, '07:14:30', '07:14:52', 61.8, 6.3], [4, PATIO, 4, '07:31:00', '07:31:06', 18.9, 5.2],
  [5, PATIO, 5, '07:46:30', '07:47:41', 44.3, 51.6], [6, PATIO, 2, '07:58:00', '07:58:19', 38.0, 9.7],
  [7, PATIO, 6, '08:20:30', '08:20:33', 96.1, 4.0], [8, PATIO, 1, '08:41:00', '08:43:20', 27.5, 15.0],
  [9, PATIO, 7, '09:05:30', '09:05:42', 72.4, 88.0], [10, PATIO, 4, '09:30:00', '09:30:08', 12.0, 7.7],
  [11, PATIO, 6, '09:31:30', '09:31:41', 23.1, 6.9], [12, PATIO, 5, '10:02:00', '10:02:09', 40.6, 7.4],
  [13, PATIO, 5, '10:07:30', '10:07:37', 36.2, 6.8], [14, PATIO, 2, '10:44:30', '10:53:50', 48.7, 14.2],
  [15, PATIO, 3, '11:12:00', '11:12:17', 66.0, 9.1], [16, PATIO, 7, '11:40:30', '11:40:35', 35.5, 10.0],
  [1, PUERTA, 4, '08:02:00', '08:02:08', 40.2, 11.3], [2, PUERTA, 1, '09:48:30', '09:51:40', 77.9, 20.0],
  [3, PUERTA, 6, '11:03:00', '11:03:12', 52.6, 8.8],
]

/** Las 19 llegadas del apéndice, calculadas como lo haría el servidor (pasos, demora, flag y porcentaje del radio). */
export const LLEGADAS_APENDICE: readonly LlegadaTablero[] = FILAS.map(([turno, idPunto, cond, qr, recv, distancia, precision], i) => {
  const punto = PUNTOS_APENDICE.find((p) => p.idPunto === idPunto)!
  const oficial = lima(qr)
  const recepcion = lima(recv)
  const step = Math.floor(segundos(oficial) / 30)
  const pasos = Math.floor(segundos(recepcion) / 30) - step
  const rumbo = (((turno * 53 + idPunto * 97) % 360) * Math.PI) / 180
  const flag = Math.abs(pasos) > 2
  return {
    idLlegada: 1000 + i,
    turno,
    punto: { idPunto, nombre: punto.nombre, radioM: punto.radioM, precisionMaxM: punto.precisionMaxM },
    conductor: conductorDePrueba(cond),
    step,
    horaOficial: oficial,
    horaRecepcion: recepcion,
    demoraS: segundos(recepcion) - segundos(oficial),
    pasos,
    flag,
    flags: flag ? ['OUT_OF_WINDOW'] : [],
    latitud: Math.round((punto.latitud + (distancia * Math.cos(rumbo)) / 111_320) * 1e6) / 1e6,
    longitud: Math.round((punto.longitud + (distancia * Math.sin(rumbo)) / (111_320 * Math.cos((punto.latitud * Math.PI) / 180))) * 1e6) / 1e6,
    distanciaM: distancia,
    pctRadio: Math.round((distancia / punto.radioM) * 1000) / 10,
    precisionM: precision,
  }
})

// recibido, conductor, punto (null = no existe), motivo, antigüedad del QR (s), texto leído (inicio)
const INTENTOS_FILAS: ReadonlyArray<readonly [string, number, number | null, string, number | null, string]> = [
  ['07:40:12', 5, PATIO, 'payload_ilegible', null, 'WAUZZZ8U1HA004123'],
  ['08:15:03', 3, PATIO, 'codigo_no_coincide', null, 'SUM1|1|59736412|Qm9x'],
  ['09:12:44', 7, PATIO, 'fuera_de_tope', 64_920, 'SUM1|1|59734129|dE5a'],
  ['09:13:20', 7, PATIO, 'fuera_de_tope', 64_920, 'SUM1|1|59734129|dE5a'],
  ['09:14:05', 7, PATIO, 'fuera_de_tope', 64_980, 'SUM1|1|59734129|dE5a'],
  ['10:20:11', 2, PATIO, 'fuera_de_tope', 840, 'SUM1|1|59736622|Hk2P'],
  ['10:31:50', 6, null, 'punto_inexistente', null, 'SUM1|999|59736633|Zb7L'],
  ['11:05:27', 4, MUELLE, 'punto_inactivo', null, 'SUM1|3|59736689|Tn4V'],
  ['11:22:09', 1, null, 'payload_ilegible', null, 'https://ejemplo.pe/pro'],
]

const ETIQUETAS: Record<string, string> = {
  payload_ilegible: 'Texto ilegible',
  punto_inexistente: 'Punto inexistente',
  punto_inactivo: 'Punto desactivado',
  codigo_no_coincide: 'Código no coincide',
  fuera_de_tope: 'QR demasiado viejo',
}

/** Los 9 intentos del apéndice, del más reciente al más antiguo; `repeticionesConductorDia` ya calculada sobre todos los puntos. */
export const INTENTOS_APENDICE: readonly IntentoTablero[] = repeticiones(
  INTENTOS_FILAS.map(([recv, cond, idPunto, motivo, antiguedad, texto], i) => ({
    idIntento: 2000 + i,
    horaRecepcion: lima(recv),
    conductor: conductorDePrueba(cond),
    punto: idPunto === null ? null : { idPunto, nombre: PUNTOS_APENDICE.find((p) => p.idPunto === idPunto)!.nombre },
    motivo,
    etiqueta: ETIQUETAS[motivo]!,
    antiguedadQrS: antiguedad,
    textoInicio: texto,
    repeticionesConductorDia: 0,
  })).reverse(),
)

function repeticiones(intentos: IntentoTablero[]): IntentoTablero[] {
  const veces = new Map<number, number>()
  for (const i of intentos) if (i.motivo === 'fuera_de_tope') veces.set(i.conductor.idUsuario, (veces.get(i.conductor.idUsuario) ?? 0) + 1)
  return intentos.map((i) => ({ ...i, repeticionesConductorDia: i.motivo === 'fuera_de_tope' ? (veces.get(i.conductor.idUsuario) ?? 0) : 0 }))
}

const mediana = (valores: number[]): number => {
  if (valores.length === 0) return 0
  const o = [...valores].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2
}

/** Lo que el servidor devolvería para un día y un punto con los datos del apéndice (solo `DIA_APENDICE` tiene datos). */
export function datosDelApendice(consulta: ConsultaTablero = {}): DatosTablero {
  const dia = consulta.dia ?? DIA_APENDICE
  const idPunto = consulta.idPunto ?? null
  const hayDatos = dia === DIA_APENDICE
  const llegadas = hayDatos ? LLEGADAS_APENDICE.filter((l) => idPunto === null || l.punto.idPunto === idPunto) : []
  const intentos = hayDatos ? repeticiones(INTENTOS_APENDICE.filter((i) => idPunto === null || i.punto?.idPunto === idPunto)) : []
  const porPunto = PUNTOS_APENDICE.map((p) => ({ idPunto: p.idPunto, nombre: p.nombre, total: llegadas.filter((l) => l.punto.idPunto === p.idPunto).length })).filter((p) => p.total > 0)
  const repetidos = new Map<number, { conductor: ConductorTablero; veces: number }>()
  for (const i of intentos.filter((x) => x.motivo === 'fuera_de_tope')) {
    const actual = repetidos.get(i.conductor.idUsuario)
    repetidos.set(i.conductor.idUsuario, { conductor: i.conductor, veces: (actual?.veces ?? 0) + 1 })
  }
  const conFlag = llegadas.filter((l) => l.flag).length
  return {
    dia: {
      dia,
      idPunto,
      resumen: { total: llegadas.length, porPunto, conFlag, rechazados: intentos.length, medianaDemoraS: mediana(llegadas.map((l) => l.demoraS)) },
      senales: { conFlag, qrVencidoRepetido: [...repetidos.values()].filter((r) => r.veces >= 2) },
      llegadas: [...llegadas].sort((a, b) => Date.parse(a.horaRecepcion) - Date.parse(b.horaRecepcion)),
      truncado: false,
    },
    intentos: { dia, idPunto, intentos, truncado: false },
    puntos: { dia, puntos: PUNTOS_APENDICE.map((p) => ({ ...p, llegadasDia: hayDatos ? p.llegadasDia : 0, ultimoEscaneo: hayDatos ? p.ultimoEscaneo : null })) },
  }
}

export interface EstadoApiTablero {
  /** Cada consulta recibida, por lectura. */
  dia: ConsultaTablero[]
  intentos: ConsultaTablero[]
  puntos: ConsultaTablero[]
  /** Si se pone, la próxima llamada (de cualquiera de las tres) falla con esto (y se limpia). */
  fallo: unknown
  /** Si se pone, las respuestas esperan a que se resuelva. */
  puerta: Promise<void> | null
  /** Se aplica a la lista de llegadas y de intentos que devuelve el servidor falso. */
  truncado: boolean
  descartadas: number
}

/** Una API del tablero de mentira: responde con los datos del apéndice, filtrados como el servidor, y anota las consultas. */
export function crearTableroApiDePrueba() {
  const estado: EstadoApiTablero = { dia: [], intentos: [], puntos: [], fallo: null, puerta: null, truncado: false, descartadas: 0 }

  async function pasar(): Promise<void> {
    if (estado.puerta) await estado.puerta
    if (estado.fallo) {
      const fallo = estado.fallo
      estado.fallo = null
      throw fallo
    }
  }

  const api: TableroApi = {
    async dia(consulta = {}) {
      estado.dia.push({ ...consulta })
      await pasar()
      return { dia: { ...datosDelApendice(consulta).dia, truncado: estado.truncado }, descartadas: estado.descartadas }
    },
    async intentos(consulta = {}) {
      estado.intentos.push({ ...consulta })
      await pasar()
      return { intentos: { ...datosDelApendice(consulta).intentos, truncado: estado.truncado }, descartados: 0 }
    },
    async puntos(consulta = {}) {
      estado.puntos.push({ ...consulta })
      await pasar()
      return { puntos: datosDelApendice(consulta).puntos, descartados: 0 }
    },
  }
  return { api, estado }
}

/** Un tablero con su API de mentira y un reloj que se mueve a mano (por defecto, el 15/10/2026 12:00 en Lima). */
export function crearTableroDePrueba() {
  const doble = crearTableroApiDePrueba()
  const reloj = { ahora: Date.parse('2026-10-15T17:00:00Z') }
  const tablero = new TableroLlegadas({ api: doble.api, reloj: () => reloj.ahora })
  return { tablero, ...doble, reloj }
}
