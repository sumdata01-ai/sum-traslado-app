import { useState, useSyncExternalStore } from 'react'
import { CameraSession } from './cameraSession'

/**
 * Una sesión por componente, leída con `useSyncExternalStore`. La sesión conserva su identidad
 * entre renders; `crear` solo se usa para sustituirla en las pruebas.
 */
export function useCameraSession(crear: () => CameraSession = () => new CameraSession()) {
  const [sesion] = useState(crear)
  const instantanea = useSyncExternalStore(sesion.suscribir, sesion.getSnapshot)
  return { sesion, ...instantanea }
}
