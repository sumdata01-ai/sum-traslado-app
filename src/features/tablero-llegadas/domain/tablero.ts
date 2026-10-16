/**
 * Tablero de llegadas por QR (solo lectura): los tipos de lo que el backend manda en `GET /api/llegada-qr/dia`,
 * `/intentos` y `/puntos` (`sum-bck-modulos`, `app/schemas/llegada_qr_lectura.py`).
 *
 * Los cálculos (pasos, demora, porcentaje del radio, antigüedad del QR, señales y mediana) los hace **el servidor**: aquí solo
 * se muestran. Las horas llegan como texto ISO con zona y se muestran siempre en hora de Lima.
 */

export interface ConductorTablero {
  idUsuario: number
  /** Nulos solo si la fila del usuario no existe: entonces se muestra el id. */
  username: string | null
  nombre: string | null
}

export interface PuntoRef {
  idPunto: number
  nombre: string
  radioM: number
  precisionMaxM: number
}

export interface LlegadaTablero {
  idLlegada: number
  turno: number
  punto: PuntoRef
  conductor: ConductorTablero
  /** El contador de 30 s del QR escaneado. */
  step: number
  /** Hora oficial de la llegada (la del `step`), ISO con zona. */
  horaOficial: string
  /** Cuándo la recibió el servidor, ISO con zona. Ordena la lista. */
  horaRecepcion: string
  demoraS: number
  /** Normal: 0, 1 o 2. Negativo: QR «del futuro» (el reloj de la tablet iba adelantado). */
  pasos: number
  /** Entró con flag `OUT_OF_WINDOW` (lo decidió el servidor al registrar). */
  flag: boolean
  flags: readonly string[]
  /** Dónde estaba el teléfono: solo se muestra en el detalle de la llegada. */
  latitud: number
  longitud: number
  distanciaM: number
  /** `distancia / radio × 100`. Puede pasar de 100 si el radio cambió después. */
  pctRadio: number
  precisionM: number
}

export interface DesglosePunto {
  idPunto: number
  nombre: string
  total: number
}

export interface ResumenDia {
  total: number
  /** Un elemento por punto con llegadas. */
  porPunto: readonly DesglosePunto[]
  conFlag: number
  rechazados: number
  /** Mediana de la demora, en segundos; 0 sin llegadas. */
  medianaDemoraS: number
}

export interface ConductorRepetido {
  conductor: ConductorTablero
  veces: number
}

export interface SenalesDia {
  conFlag: number
  /** Conductores con 2 o más intentos de QR vencido ese día. */
  qrVencidoRepetido: readonly ConductorRepetido[]
}

export interface DiaTablero {
  /** Día de Lima, `AAAA-MM-DD`. */
  dia: string
  idPunto: number | null
  resumen: ResumenDia
  senales: SenalesDia
  /** Por hora de recepción, de la más antigua a la más reciente. */
  llegadas: readonly LlegadaTablero[]
  /** La lista se recortó por el tope del servidor; el resumen y las señales cuentan todo. */
  truncado: boolean
}

export interface IntentoTablero {
  idIntento: number
  horaRecepcion: string
  conductor: ConductorTablero
  /** `null` si el texto no se pudo leer o el punto no existe. */
  punto: { idPunto: number; nombre: string } | null
  /** El valor guardado (`fuera_de_tope`…). */
  motivo: string
  etiqueta: string
  /** Solo `fuera_de_tope`: segundos que tenía el QR al recibirse; negativo = QR «del futuro». */
  antiguedadQrS: number | null
  /** Los primeros 20 caracteres del texto leído. **Nunca el código completo.** */
  textoInicio: string
  /** Intentos de QR vencido de este conductor ese día (solo en esas filas; 0 en las demás). */
  repeticionesConductorDia: number
}

export interface IntentosTablero {
  dia: string
  idPunto: number | null
  /** Del más reciente al más antiguo. */
  intentos: readonly IntentoTablero[]
  truncado: boolean
}

export interface PuntoFicha {
  idPunto: number
  nombre: string
  activo: boolean
  latitud: number
  longitud: number
  radioM: number
  precisionMaxM: number
  /** `radio + precisión máxima`: la distancia máxima a la que puede estar el teléfono verdadero y que igual se acepte. */
  peorCasoM: number
  llegadasDia: number
  ultimoEscaneo: string | null
}

export interface PuntosTablero {
  dia: string
  puntos: readonly PuntoFicha[]
}

/** Lo que muestra el tablero: las tres lecturas de un mismo día y filtro. */
export interface DatosTablero {
  dia: DiaTablero
  intentos: IntentosTablero
  puntos: PuntosTablero
}
