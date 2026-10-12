import type { Zona } from '../domain'
import type { ClaveFormulario, FotoGuardada, FotoParaGuardar, FotoStorePort } from './fotoStorePort'

/**
 * Almacén provisional en memoria: sirve para probar el formulario y la pantalla de prueba antes
 * de T4a. Se pierde al recargar la página, así que **no** cumple la regla «disco antes que red».
 */
export class AlmacenEnMemoria implements FotoStorePort {
  readonly #filas = new Map<string, FotoGuardada>()

  // No puede dejar nada a medias entre sesiones: no tiene qué reconciliar.

  async listar(clave: ClaveFormulario): Promise<FotoGuardada[]> {
    const prefijo = `${clave.ordenId}|${clave.momento}|`
    return [...this.#filas.entries()].filter(([llave]) => llave.startsWith(prefijo)).map(([, foto]) => foto)
  }

  async guardar(clave: ClaveFormulario, zona: Zona, foto: FotoParaGuardar): Promise<FotoGuardada> {
    const guardada: FotoGuardada = { ...foto, zona, clientId: globalThis.crypto.randomUUID(), estado: 'pending', storageKey: null, errorMessage: null }
    this.#filas.set(`${clave.ordenId}|${clave.momento}|${zona}`, guardada)
    return guardada
  }

  #porId(clientId: string): [string, FotoGuardada] | undefined {
    return [...this.#filas.entries()].find(([, foto]) => foto.clientId === clientId)
  }

  async leerBlob(clientId: string): Promise<Blob | null> {
    return this.#porId(clientId)?.[1].blob ?? null
  }

  async marcarSubida(clientId: string, storageKey: string): Promise<boolean> {
    const fila = this.#porId(clientId)
    if (!fila) return false
    this.#filas.set(fila[0], { ...fila[1], estado: 'uploaded', storageKey, errorMessage: null })
    return true
  }

  async marcarFalloSubida(clientId: string, mensaje: string): Promise<boolean> {
    const fila = this.#porId(clientId)
    if (!fila) return false
    this.#filas.set(fila[0], { ...fila[1], estado: 'failed_upload', errorMessage: mensaje })
    return true
  }

  async prepararReintento(clientId: string): Promise<boolean> {
    const fila = this.#porId(clientId)
    if (!fila || fila[1].estado !== 'failed_upload') return false
    this.#filas.set(fila[0], { ...fila[1], estado: 'pending', errorMessage: null })
    return true
  }
}
