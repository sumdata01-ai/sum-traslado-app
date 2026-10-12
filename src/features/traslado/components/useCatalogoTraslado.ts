import { useEffect, useSyncExternalStore } from 'react'
import type { CatalogoTraslado } from '../data/catalogoTraslado'

/**
 * Las placas y proveedores del selector. Al montarse muestra lo guardado y pide lo último al
 * servidor; al volver la red pide de nuevo; al desmontarse descarta lo que llegue tarde.
 */
export function useCatalogoTraslado(catalogo: CatalogoTraslado) {
  const instantanea = useSyncExternalStore(catalogo.suscribir, catalogo.getSnapshot)

  useEffect(() => {
    void catalogo.iniciar()
    const alVolverLaRed = () => void catalogo.actualizar()
    window.addEventListener('online', alVolverLaRed)
    return () => {
      window.removeEventListener('online', alVolverLaRed)
      catalogo.liberar()
    }
  }, [catalogo])

  return instantanea
}
