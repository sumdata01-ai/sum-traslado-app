import { useEffect } from 'react'
import { type AuthPort, useSesion } from '@/core/auth'
import type { ListaSeguimiento } from '@/features/seguimiento/data/listaSeguimiento'
import type { ConfirmacionTraslado } from '@/features/traslado/data/confirmacionTraslado'
import type { FotoStorePort } from '@/features/traslado/data/fotoStorePort'
import type { SubidaFotos } from '@/features/traslado/data/subidaFotos'
import type { CatalogoTraslado } from '@/features/traslado/data/catalogoTraslado'
import type { IdentificadorVin } from '@/features/traslado/data/identificadorVin'
import type { ListaOrdenes } from '@/features/traslado/data/listaOrdenes'
import { AppShell } from './AppShell'
import { HomePage } from './HomePage'
import type { ConfigLlegada } from './LlegadaPage'
import { SeguimientoPage } from './SeguimientoPage'

export interface AppProps {
  auth: AuthPort
  lista: ListaOrdenes
  catalogo: CatalogoTraslado
  identificador: IdentificadorVin
  /** Las fotos y su subida (E4-01). */
  fotos?: { store: FotoStorePort; subidas: SubidaFotos; confirmacion: ConfirmacionTraslado }
  /** La marcación de llegada por QR del conductor. Sin ella la home no ofrece «Marcar llegada». */
  llegada?: ConfigLlegada
  /** La lista de la vista del coordinador. Sin ella, un coordinador ve «Sin acceso». */
  seguimiento?: ListaSeguimiento
}

export function App({ auth, lista, catalogo, identificador, fotos, llegada, seguimiento }: AppProps) {
  const { estado } = useSesion(auth)

  // Las órdenes son de quien inició sesión: al cerrarla (o expirar) no deben verse desde otra cuenta.
  // Las fotos pendientes NO se tocan: son trabajo del operario y se conservan.
  useEffect(() => {
    if (estado === 'sinSesion') void lista.vaciar()
  }, [estado, lista])

  // Lo mismo para el coordinador: sus datos solo viven en memoria y no deben verse desde otra cuenta.
  useEffect(() => {
    if (estado === 'sinSesion') seguimiento?.vaciar()
  }, [estado, seguimiento])

  // La `key` es la persona: si otra pestaña cambia el usuario (A-03), la home se rehace desde cero,
  // sin el filtro ni nada de lo que veía la anterior.
  return (
    <AppShell
      auth={auth}
      home={(sesion, cerrarSesion) => (
        <HomePage key={sesion.idUsuario ?? sesion.usuario ?? ''} sesion={sesion} lista={lista} catalogo={catalogo} identificador={identificador} fotos={fotos} llegada={llegada} onCerrarSesion={cerrarSesion} />
      )}
      seguimiento={
        seguimiento
          ? (sesion, cerrarSesion) => <SeguimientoPage key={sesion.idUsuario ?? sesion.usuario ?? ''} sesion={sesion} lista={seguimiento} onCerrarSesion={cerrarSesion} />
          : undefined
      }
    />
  )
}
