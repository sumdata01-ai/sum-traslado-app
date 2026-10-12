import { ETIQUETA_ZONA, type Momento, type Zona, zonasDe } from './zonas'

/**
 * Reglas previas a `confirmar-salida` y `confirmar-entrega`: se validan antes de llamar al
 * servidor para no provocar un 422 evitable y para decirle al operario qué falta.
 */

export type CodigoProblema =
  | 'CONTEO_INCORRECTO'
  | 'ZONA_REPETIDA'
  | 'ZONA_NO_ESPERADA'
  | 'ZONA_FALTANTE'
  | 'FALTA_STORAGE_KEY'

export interface Problema {
  codigo: CodigoProblema
  zona?: string
  detalle: string
}

/** `zona` va como texto: viene de datos guardados, y una zona inválida es justo lo que se detecta. */
export interface FotoParaConfirmar {
  zona: string
  storageKey?: string | null
}

export type ResultadoValidacion = { ok: true } | { ok: false; problemas: Problema[] }

/**
 * Exactamente 6 fotos de 6 zonas distintas en la salida, exactamente 5 en la entrega, y todas con
 * `storage_key`. Devuelve **todos** los problemas juntos, en un orden estable: conteo, repetidas o
 * no esperadas (en orden de aparición), faltantes (en orden del formulario) y claves faltantes.
 */
export function validarConfirmacion(momento: Momento, fotos: readonly FotoParaConfirmar[]): ResultadoValidacion {
  const esperadas = zonasDe(momento)
  const problemas: Problema[] = []

  if (fotos.length !== esperadas.length) {
    problemas.push({
      codigo: 'CONTEO_INCORRECTO',
      detalle: `Se esperan ${esperadas.length} fotos y hay ${fotos.length}.`,
    })
  }

  const veces = new Map<string, number>()
  for (const foto of fotos) veces.set(foto.zona, (veces.get(foto.zona) ?? 0) + 1)

  for (const [zona, cuantas] of veces) {
    if (!(esperadas as readonly string[]).includes(zona)) {
      problemas.push({ codigo: 'ZONA_NO_ESPERADA', zona, detalle: `La zona ${zona} no corresponde a la ${momento}.` })
    } else if (cuantas > 1) {
      problemas.push({ codigo: 'ZONA_REPETIDA', zona, detalle: `La zona ${zona} aparece ${cuantas} veces.` })
    }
  }

  for (const zona of esperadas) {
    if (!veces.has(zona)) problemas.push({ codigo: 'ZONA_FALTANTE', zona, detalle: `Falta la foto de ${zona}.` })
  }

  for (const foto of fotos) {
    if (!foto.storageKey || foto.storageKey.trim() === '') {
      problemas.push({ codigo: 'FALTA_STORAGE_KEY', zona: foto.zona, detalle: `La foto de ${foto.zona} aún no se subió.` })
    }
  }

  return problemas.length === 0 ? { ok: true } : { ok: false, problemas }
}

/**
 * La fecha de la tanda es la **última captura medida**, nunca el reloj del momento de enviar:
 * una entrega hecha sin señal a las 9:00 y enviada a las 15:00 debe quedar registrada a las 9:00.
 * `toISOString()` del resultado es UTC, que es lo que espera el backend.
 */
export function fechaMedida(fotos: readonly { createdAt: number }[]): Date {
  if (fotos.length === 0) throw new RangeError('No hay fotos: no se puede medir la fecha de la tanda.')
  if (!fotos.every((f) => Number.isFinite(f.createdAt))) throw new RangeError('Hay una foto con fecha de captura inválida.')
  return new Date(Math.max(...fotos.map((f) => f.createdAt)))
}

const etiquetaDe = (zona: string | undefined): string => (zona && ETIQUETA_ZONA[zona as Zona]) || zona || 'una zona'

/** Lo que se le dice al operario de un problema: con el nombre de la zona, no su código interno. */
export function mensajeDelProblema(problema: Problema): string {
  switch (problema.codigo) {
    case 'ZONA_FALTANTE':
      return `Falta la foto de ${etiquetaDe(problema.zona)}.`
    case 'FALTA_STORAGE_KEY':
      return `La foto de ${etiquetaDe(problema.zona)} todavía no se subió.`
    case 'ZONA_REPETIDA':
      return `Hay más de una foto de ${etiquetaDe(problema.zona)}.`
    case 'ZONA_NO_ESPERADA':
      return `La foto de ${etiquetaDe(problema.zona)} no corresponde a este paso.`
    case 'CONTEO_INCORRECTO':
      return problema.detalle
  }
}
