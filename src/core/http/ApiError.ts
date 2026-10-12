const REINTENTABLES = new Set([408, 500, 502, 503, 504])

/**
 * Error de una llamada al API.
 *
 * Sin `status` significa que no hubo respuesta (red caída o tiempo agotado). Misma clasificación
 * que `ApiException` de la app (`api_client.dart`): solo lo transitorio vale reintentarlo.
 */
export class ApiError extends Error {
  readonly status: number | undefined

  constructor(message: string, opciones: { status?: number } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = opciones.status
  }

  /** Sin respuesta, o 408/500/502/503/504. Un 4xx de negocio no mejora reintentando. */
  get isRetryable(): boolean {
    return this.status === undefined || REINTENTABLES.has(this.status)
  }

  get isNetwork(): boolean {
    return this.status === undefined
  }

  get isSessionExpired(): boolean {
    return this.status === 401
  }

  get isConflict(): boolean {
    return this.status === 409
  }
}
