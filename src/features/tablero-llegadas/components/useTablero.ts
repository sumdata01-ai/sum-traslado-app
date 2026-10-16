import { useEffect, useSyncExternalStore } from 'react'
import type { TableroLlegadas } from '../data/tableroLlegadas'

/**
 * El tablero de llegadas. Al montarse pide lo último al servidor y **no vuelve a pedir nada por su cuenta**: ni por tiempo, ni
 * al volver a ver la pestaña, ni al volver la red. Para ver lo último está el botón «Actualizar». Al desmontarse descarta lo
 * que llegue tarde.
 */
export function useTablero(tablero: TableroLlegadas, idUsuario: number | null) {
  const instantanea = useSyncExternalStore(tablero.suscribir, tablero.getSnapshot)

  useEffect(() => {
    void tablero.iniciar(idUsuario)
    return () => tablero.liberar()
  }, [tablero, idUsuario])

  return instantanea
}
