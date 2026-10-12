import type { EstadoFoto, Momento, Zona } from '../domain'

/** El formulario de captura: las fotos de un momento de una orden. */
export interface ClaveFormulario {
  ordenId: number
  momento: Momento
}

/** Lo que el almacén necesita de una foto tomada; `FotoCapturada` de la cámara lo cumple. */
export interface FotoParaGuardar {
  blob: Blob
  ancho: number
  alto: number
  /** Instante medido de la captura: de aquí sale la fecha que se envía. */
  creadaEn: number
}

export interface FotoGuardada extends FotoParaGuardar {
  clientId: string
  zona: Zona
  /**
   * Cómo va su subida (E4-01): `pending` (guardada en el teléfono, sin subir), `uploaded` (ya está en
   * el almacenamiento) o `failed_upload` (la subida falló y se puede reintentar).
   */
  estado: Extract<EstadoFoto, 'pending' | 'uploaded' | 'failed_upload'>
  /** La ruta en el bucket; solo cuando `estado` es `uploaded`. Es lo que viaja al confirmar. */
  storageKey: string | null
  /** Por qué falló la última subida; solo con `failed_upload`. */
  errorMessage: string | null
}

/**
 * Dónde se guardan las fotos del operario. T5 usa este contrato; T4a lo implementa con Dexie
 * (estados `writing` → `pending`, lectura de vuelta y recuperación). Mientras tanto hay una
 * implementación en memoria.
 */
export interface ResultadoReconciliacion {
  /**
   * Zonas cuya foto no llegó a guardarse y que **no tienen** otra foto aceptada: hay que volver a
   * tomarlas. En el orden del formulario. Una zona que ya tiene foto no aparece aunque un intento
   * de repetirla haya fallado: esa foto sigue intacta.
   */
  zonasARetomar: Zona[]
}

export interface FotoStorePort {
  /**
   * Revisa lo que quedó a medias de una sesión anterior (la página se cerró en plena escritura) y
   * dice qué zonas hay que retomar. Es opcional: un almacén que no puede dejar nada a medias, como
   * el de memoria, no la necesita.
   */
  reconciliar?(clave: ClaveFormulario): Promise<ResultadoReconciliacion>
  listar(clave: ClaveFormulario): Promise<FotoGuardada[]>
  /**
   * Guarda la foto de una zona. **Reemplaza la anterior solo cuando la nueva quedó guardada y
   * verificada** (falla C15): si rechaza, la foto previa sigue intacta.
   */
  guardar(clave: ClaveFormulario, zona: Zona, foto: FotoParaGuardar): Promise<FotoGuardada>

  /**
   * El archivo de una foto, leído **del almacén** en el momento de subirla y no de una copia en
   * memoria (E4-01 AC7). `null` si la foto ya no está (se repitió esa zona o se borró la orden).
   */
  leerBlob(clientId: string): Promise<Blob | null>
  /**
   * La foto ya está en el almacenamiento en `storageKey`. Devuelve `false` si la foto ya no existe
   * (por ejemplo, porque se repitió la zona mientras subía) o si otra pestaña ya la había marcado: no hay
   * nada que marcar y no es un error. El primero que termina gana.
   */
  marcarSubida(clientId: string, storageKey: string): Promise<boolean>
  /** La subida falló con este motivo. `false` si la foto ya no existe. */
  marcarFalloSubida(clientId: string, mensaje: string): Promise<boolean>
  /** Vuelve una foto fallida a `pending` para reintentar. `false` si ya no existe o no estaba fallida. */
  prepararReintento(clientId: string): Promise<boolean>
}
