export type Plataforma = 'ios' | 'android' | 'otra'

/** Lo que se necesita saber del navegador, aislado para poder simularlo en las pruebas. */
export interface EntornoNavegador {
  isSecureContext: boolean
  mediaDevices: { getUserMedia?: unknown } | undefined
  userAgent: string
  platform: string
  maxTouchPoints: number
}

export function entornoActual(): EntornoNavegador {
  return {
    isSecureContext: window.isSecureContext,
    mediaDevices: navigator.mediaDevices,
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  }
}

export function detectarPlataforma(entorno: Pick<EntornoNavegador, 'userAgent' | 'platform' | 'maxTouchPoints'>): Plataforma {
  if (/iPhone|iPad|iPod/i.test(entorno.userAgent)) return 'ios'
  // iPadOS 13 en adelante se presenta como un Mac: se distingue por la pantalla táctil.
  if (entorno.platform === 'MacIntel' && entorno.maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(entorno.userAgent)) return 'android'
  return 'otra'
}
