/**
 * Valores de la captura en un solo lugar: la resolución se valida en el testeo (P-01) y tiene que
 * poder cambiarse sin tocar la lógica. Ver docs/02-arquitectura/arquitectura-front.md §5.2 y §5.3.
 */

/** Resolución pedida al stream. Un frame del video tiene la del *track*, no la del sensor. */
export const RESOLUCION_IDEAL = { ancho: 1920, alto: 1080 } as const

/** Lado largo máximo de la foto final (lo usa T3). */
export const LADO_LARGO_MAXIMO_PX = 1920

/** Cuánto se espera el primer frame válido antes de dar la cámara por no iniciada. */
export const TIEMPO_PRIMER_FRAME_MS = 8_000

/**
 * Calidad del JPEG (0 a 1). El valor es una primera propuesta, no una medida: se ajusta junto con
 * la resolución en el testeo (P-01), mirando el peso y la nitidez de las fotos reales.
 */
export const CALIDAD_JPEG = 0.9

/** Cuánto se espera a que el navegador entregue el JPEG antes de dar la captura por fallida. */
export const TIEMPO_CAPTURA_MS = 10_000

/**
 * Tras mostrar la foto, los botones de la revisión ignoran toques durante este tiempo. Un doble
 * toque sobre «Tomar foto» deja el segundo toque encima de «Repetir» justo cuando aparece, y
 * descartaría la foto recién tomada. Medio segundo es una propuesta; se ajusta en el testeo (P-01).
 */
export const PROTECCION_TOQUE_ACCIDENTAL_MS = 500

/**
 * Cámara trasera si hay, con la resolución ideal. No se fija `deviceId: { exact }`: es frágil
 * entre sesiones y entre navegadores.
 */
export const RESTRICCIONES_PREFERIDAS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: RESOLUCION_IDEAL.ancho },
    height: { ideal: RESOLUCION_IDEAL.alto },
  },
  audio: false,
}

/** Respaldo cuando el dispositivo no admite las preferidas (`OverconstrainedError`). */
export const RESTRICCIONES_MINIMAS: MediaStreamConstraints = { video: true, audio: false }
