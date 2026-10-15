import { type ReactNode, useEffect } from 'react'
import { type AuthPort, type Sesion, esCoordinador, tieneAcceso, useSesion } from '@/core/auth'
import { LoginPage } from './LoginPage'
import { SinAccesoPage } from './SinAccesoPage'
import { SinConexionPage } from './SinConexionPage'

export interface AppShellProps {
  auth: AuthPort
  /** Lo que ve quien tiene sesión y acceso a Traslado. */
  home: (sesion: Sesion, cerrarSesion: () => void) => ReactNode
  /**
   * Lo que ve el coordinador: el seguimiento de los traslados. Sin esto, un coordinador no tiene a dónde ir y ve «Sin acceso»
   * (así un despliegue sin la vista nueva no le muestra la home del operario).
   */
  seguimiento?: (sesion: Sesion, cerrarSesion: () => void) => ReactNode
}

/**
 * Decide qué pantalla corresponde según la sesión. Al montarse intenta recuperar la sesión con la
 * cookie de refresh; mientras lo comprueba no muestra el login (evita el parpadeo al recargar).
 *
 * Con sesión, el **rol** coordinador va a la vista de seguimiento (sin mirar `allowed_apps`); el resto va a la home
 * de Traslado si tiene `traslado` en `allowed_apps`, y a «Sin acceso» si no.
 */
export function AppShell({ auth, home, seguimiento }: AppShellProps) {
  const { estado, sesion } = useSesion(auth)

  useEffect(() => {
    void auth.restaurar()
  }, [auth])

  if (estado === 'restaurando') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
        <p role="status" className="text-ink-2">
          Comprobando tu sesión…
        </p>
      </main>
    )
  }
  if (estado === 'sinConexion') return <SinConexionPage auth={auth} />
  if (estado === 'sinSesion' || !sesion) return <LoginPage auth={auth} />
  const cerrarSesion = () => void auth.logout()
  if (esCoordinador(sesion)) {
    return seguimiento ? <>{seguimiento(sesion, cerrarSesion)}</> : <SinAccesoPage auth={auth} sesion={sesion} />
  }
  if (!tieneAcceso(sesion)) return <SinAccesoPage auth={auth} sesion={sesion} />
  return <>{home(sesion, cerrarSesion)}</>
}
