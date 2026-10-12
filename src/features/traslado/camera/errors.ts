import type { Plataforma } from './plataforma'

export type CodigoCamara =
  | 'CONTEXTO_INSEGURO'
  | 'SIN_SOPORTE'
  | 'PERMISO_DENEGADO'
  | 'SIN_CAMARA'
  | 'CAMARA_OCUPADA'
  | 'RESTRICCIONES_IMPOSIBLES'
  | 'REPRODUCCION_RECHAZADA'
  | 'TIEMPO_AGOTADO'
  | 'DESCONOCIDO'

/**
 * Error de cámara con el mensaje que ve el operario. `reintentable` dice si tiene sentido ofrecer
 * «Reintentar»: abrir la cámara de nuevo no arregla un contexto inseguro ni la ausencia de cámara.
 */
export class CamaraError extends Error {
  readonly codigo: CodigoCamara
  readonly reintentable: boolean

  constructor(codigo: CodigoCamara, mensaje: string, opciones: { reintentable: boolean; causa?: unknown }) {
    super(mensaje, { cause: opciones.causa })
    this.name = 'CamaraError'
    this.codigo = codigo
    this.reintentable = opciones.reintentable
  }
}

// Los pasos exactos de cada sistema no están verificados en dispositivo (S-01 / P-01).
const COMO_DAR_PERMISO: Record<Plataforma, string> = {
  ios: 'En el iPhone: Ajustes › Safari › Cámara, elige «Preguntar» o «Permitir» y recarga la página.',
  android: 'En Android: toca el candado junto a la dirección › Permisos › Cámara › Permitir, y recarga la página.',
  otra: 'Permite el acceso a la cámara en la configuración del navegador y recarga la página.',
}

export const errorContextoInseguro = () =>
  new CamaraError('CONTEXTO_INSEGURO', 'La cámara solo funciona con HTTPS. Abre la página con una dirección que empiece por https://.', {
    reintentable: false,
  })

export const errorSinSoporte = () =>
  new CamaraError('SIN_SOPORTE', 'Este navegador no permite usar la cámara desde la página. Prueba con Safari o Chrome actualizados.', {
    reintentable: false,
  })

export const errorReproduccion = () =>
  new CamaraError('REPRODUCCION_RECHAZADA', 'El navegador no inició el video de la cámara. Toca para iniciarla.', { reintentable: true })

export const errorTiempoAgotado = () =>
  new CamaraError('TIEMPO_AGOTADO', 'La cámara tardó demasiado en iniciar. Vuelve a intentarlo.', { reintentable: true })

function nombreDe(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
}

export function esErrorDeRestricciones(error: unknown): boolean {
  const nombre = nombreDe(error)
  return nombre === 'OverconstrainedError' || nombre === 'ConstraintNotSatisfiedError'
}

/** Traduce lo que lanza `getUserMedia` a un error con mensaje para el operario. */
export function errorDeNavegador(error: unknown, plataforma: Plataforma): CamaraError {
  switch (nombreDe(error)) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new CamaraError('PERMISO_DENEGADO', `No hay permiso para usar la cámara. ${COMO_DAR_PERMISO[plataforma]}`, {
        reintentable: true,
        causa: error,
      })
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CamaraError('SIN_CAMARA', 'No se encontró ninguna cámara en el dispositivo.', { reintentable: false, causa: error })
    case 'NotReadableError':
    case 'TrackStartError':
      return new CamaraError('CAMARA_OCUPADA', 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.', {
        reintentable: true,
        causa: error,
      })
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new CamaraError('RESTRICCIONES_IMPOSIBLES', 'La cámara no admite la configuración pedida.', {
        reintentable: true,
        causa: error,
      })
    default:
      return new CamaraError('DESCONOCIDO', 'No se pudo abrir la cámara.', { reintentable: true, causa: error })
  }
}
