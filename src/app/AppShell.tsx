import { type ReactNode, useEffect } from 'react'
import { type AuthPort, type Sesion, tieneAcceso, useSesion } from '@/core/auth'
import { LoginPage } from './LoginPage'
import { SinAccesoPage } from './SinAccesoPage'
import { SinConexionPage } from './SinConexionPage'

export interface AppShellProps {
  auth: AuthPort
  /** Lo que ve quien tiene sesión y acceso a Traslado. */
  home: (sesion: Sesion, cerrarSesion: () => void) => ReactNode
}

/**
 * Decide qué pantalla corresponde según la sesión. Al montarse intenta recuperar la sesión con la
 * cookie de refresh; mientras lo comprueba no muestra el login (evita el parpadeo al recargar).
 */
export function AppShell({ auth, home }: AppShellProps) {
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
  if (!tieneAcceso(sesion)) return <SinAccesoPage auth={auth} sesion={sesion} />
  return <>{home(sesion, () => void auth.logout())}</>
}
