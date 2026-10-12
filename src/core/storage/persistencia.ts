/** Lo que se usa de `navigator.storage`; todo opcional porque no todos los navegadores lo ofrecen. */
export interface StorageManagerLike {
  persisted?(): Promise<boolean>
  persist?(): Promise<boolean>
  estimate?(): Promise<{ usage?: number; quota?: number }>
}

export interface EstadoAlmacenamiento {
  /** El navegador ofrece `navigator.storage`. */
  soportado: boolean
  /** El navegador se comprometió a no borrar los datos sin avisar. En Safari puede ser `false`: no se depende de ello. */
  persistente: boolean
  usoBytes: number | null
  cuotaBytes: number | null
  /** Queda menos espacio que {@link ESPACIO_MINIMO_BYTES}; se avisa pero no se bloquea nada. */
  espacioBajo: boolean
}

/**
 * Por debajo de este espacio libre se avisa al operario. Una foto de 1920 px pesa del orden de
 * 1 MB, así que 50 MB sobran para un formulario; el valor es una propuesta, no una medida.
 */
export const ESPACIO_MINIMO_BYTES = 50 * 1024 * 1024

const NO_SOPORTADO: EstadoAlmacenamiento = { soportado: false, persistente: false, usoBytes: null, cuotaBytes: null, espacioBajo: false }

/**
 * Pide que el navegador conserve los datos y mide el espacio libre. **Nunca lanza ni bloquea**: un
 * navegador que no lo soporta, que rechaza la petición o que falla al estimar devuelve un estado
 * conservador, y el formulario sigue funcionando.
 */
export async function consultarAlmacenamiento(
  storage: StorageManagerLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage,
  espacioMinimoBytes: number = ESPACIO_MINIMO_BYTES,
): Promise<EstadoAlmacenamiento> {
  if (!storage) return NO_SOPORTADO

  const persistente = await pedirPersistencia(storage)
  const { usoBytes, cuotaBytes } = await medirEspacio(storage)
  const espacioBajo = usoBytes !== null && cuotaBytes !== null && cuotaBytes - usoBytes < espacioMinimoBytes
  return { soportado: true, persistente, usoBytes, cuotaBytes, espacioBajo }
}

async function pedirPersistencia(storage: StorageManagerLike): Promise<boolean> {
  try {
    // Si el navegador ya lo prometió no se vuelve a pedir.
    return (await storage.persisted?.()) === true || (await storage.persist?.()) === true
  } catch {
    return false
  }
}

async function medirEspacio(storage: StorageManagerLike): Promise<{ usoBytes: number | null; cuotaBytes: number | null }> {
  try {
    const estimacion = await storage.estimate?.()
    return {
      usoBytes: typeof estimacion?.usage === 'number' ? estimacion.usage : null,
      cuotaBytes: typeof estimacion?.quota === 'number' ? estimacion.quota : null,
    }
  } catch {
    return { usoBytes: null, cuotaBytes: null }
  }
}
