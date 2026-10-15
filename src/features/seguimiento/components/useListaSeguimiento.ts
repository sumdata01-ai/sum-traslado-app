import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ListaSeguimiento } from '../data/listaSeguimiento'

/**
 * La lista de traslados del coordinador. Al montarse pide lo último al servidor y **no vuelve a pedir nada por su cuenta**:
 * ni por tiempo, ni al volver a ver la pestaña, ni al volver la red (decisión del 2026-10-15: el usuario no pidió refrescos
 * automáticos). Para ver lo último está el botón «Actualizar». Al desmontarse descarta lo que llegue tarde.
 */
export function useListaSeguimiento(lista: ListaSeguimiento, idUsuario: number | null) {
  const instantanea = useSyncExternalStore(lista.suscribir, lista.getSnapshot)

  useEffect(() => {
    void lista.iniciar(idUsuario)
    return () => lista.liberar()
  }, [lista, idUsuario])

  return instantanea
}

/** La hora actual, renovada cada `cadaMs`, para que «Actualizado hace N min» avance sin tocar nada. */
export function useAhora(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const temporizador = window.setInterval(() => setAhora(Date.now()), cadaMs)
    return () => window.clearInterval(temporizador)
  }, [cadaMs])
  return ahora
}
