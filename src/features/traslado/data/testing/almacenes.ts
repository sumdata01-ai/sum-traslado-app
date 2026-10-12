import type { Zona } from '../../domain'
import type { FotoGuardada, FotoParaGuardar, FotoStorePort } from '../fotoStorePort'

/** Una `FotoGuardada` recién guardada (sin subir), para los dobles de prueba que la construyen a mano. */
export function fotoRecienGuardada(foto: FotoParaGuardar, zona: Zona, clientId = 'x'): FotoGuardada {
  return { ...foto, zona, clientId, estado: 'pending', storageKey: null, errorMessage: null }
}

/**
 * Un almacén que delega todo en `real` salvo lo que se le sobrescriba: sirve para fallar solo una
 * operación (por ejemplo, `guardar`) sin reescribir el resto del puerto en cada prueba.
 */
export function almacenDelegando(real: FotoStorePort, cambios: Partial<FotoStorePort> = {}): FotoStorePort {
  return {
    reconciliar: real.reconciliar?.bind(real),
    listar: (clave) => real.listar(clave),
    guardar: (clave, zona, foto) => real.guardar(clave, zona, foto),
    leerBlob: (clientId) => real.leerBlob(clientId),
    marcarSubida: (clientId, storageKey) => real.marcarSubida(clientId, storageKey),
    marcarFalloSubida: (clientId, mensaje) => real.marcarFalloSubida(clientId, mensaje),
    prepararReintento: (clientId) => real.prepararReintento(clientId),
    ...cambios,
  }
}
