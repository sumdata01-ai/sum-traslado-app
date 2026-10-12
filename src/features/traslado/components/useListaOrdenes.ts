import { useEffect, useSyncExternalStore } from 'react'
import type { ListaOrdenes } from '../data/listaOrdenes'

/**
 * Las órdenes de la home. Al montarse muestra lo guardado y pide lo último al servidor; al volver la
 * red pide de nuevo; al desmontarse descarta lo que llegue tarde. `idUsuario` es quien tiene la
 * sesión: si cambia, la lista vuelve a empezar para esa persona (A-03).
 */
export function useListaOrdenes(lista: ListaOrdenes, idUsuario: number | null) {
  const instantanea = useSyncExternalStore(lista.suscribir, lista.getSnapshot)

  useEffect(() => {
    void lista.iniciar(idUsuario)
    const alVolverLaRed = () => void lista.actualizar()
    window.addEventListener('online', alVolverLaRed)
    return () => {
      window.removeEventListener('online', alVolverLaRed)
      lista.liberar()
    }
  }, [lista, idUsuario])

  return instantanea
}
