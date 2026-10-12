import { useSyncExternalStore } from 'react'
import type { AuthPort } from './AuthPort'

/** El estado de la sesión, para pintar la pantalla que corresponde. */
export function useSesion(auth: AuthPort) {
  return useSyncExternalStore(auth.suscribir, auth.getSnapshot)
}
