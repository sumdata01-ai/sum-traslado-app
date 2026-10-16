import { useEffect, useState, useSyncExternalStore } from 'react'
import { ControladorLlegada } from '../data/controladorLlegada'

/**
 * Un recorrido de «Marcar llegada» por pantalla, leído con `useSyncExternalStore`. Al salir de la pantalla se sueltan el GPS y los
 * temporizadores. `crear` solo se usa para armar el controlador con sus piezas (y sustituirlas en las pruebas).
 */
export function useLlegada(crear: () => ControladorLlegada) {
  const [controlador] = useState(crear)
  const instantanea = useSyncExternalStore(controlador.suscribir, controlador.getSnapshot)
  useEffect(() => () => controlador.dispose(), [controlador])
  return { controlador, instantanea }
}
