import { type CamaraError, errorContextoInseguro, errorSinSoporte } from './errors'
import { type EntornoNavegador, entornoActual } from './plataforma'

export type Soporte = { ok: true } | { ok: false; error: CamaraError }

/**
 * ¿Se puede intentar abrir la cámara? Sin contexto seguro (HTTP en la red) o sin
 * `mediaDevices.getUserMedia`, ni siquiera se llama al navegador: el intento no puede salir bien.
 */
export function detectarSoporte(entorno: EntornoNavegador = entornoActual()): Soporte {
  if (!entorno.isSecureContext) return { ok: false, error: errorContextoInseguro() }
  if (typeof entorno.mediaDevices?.getUserMedia !== 'function') return { ok: false, error: errorSinSoporte() }
  return { ok: true }
}
