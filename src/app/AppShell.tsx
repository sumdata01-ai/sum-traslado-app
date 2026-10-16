import { type ReactNode, useEffect } from 'react'
import { type AuthPort, type Sesion, esCoordinador, puedeVerTablero, tieneAcceso, useSesion } from '@/core/auth'
import { RUTA_TABLERO, useRuta } from '@/core/navegacion/ruta'
import { LoginPage } from './LoginPage'
import { SinAccesoPage } from './SinAccesoPage'
import { SinConexionPage } from './SinConexionPage'

export interface AppShellProps {
  auth: AuthPort
  /** Lo que ve quien tiene sesión y acceso a Traslado (y no cumple un par del tablero: esas personas no ven Traslado). */
  home: (sesion: Sesion, cerrarSesion: () => void) => ReactNode
  /**
   * Lo que ve el coordinador: el seguimiento de los traslados. Sin esto, un coordinador no tiene a dónde ir y ve «Sin acceso»
   * (así un despliegue sin la vista nueva no le muestra la home del operario).
   */
  seguimiento?: (sesion: Sesion, cerrarSesion: () => void) => ReactNode
  /**
   * El tablero de llegadas por QR, en `/dashboard`: para los pares supervisor+despacho, supervisor+secado, asistente+despacho y
   * admin (`puedeVerTablero`). **Esas personas no ven Traslado**: entran directo aquí. Sin esto, nadie ve el tablero.
   */
  tablero?: (sesion: Sesion, cerrarSesion: () => void) => ReactNode
}

/**
 * Decide qué pantalla corresponde según la sesión. Al montarse intenta recuperar la sesión con la
 * cookie de refresh; mientras lo comprueba no muestra el login (evita el parpadeo al recargar).
 *
 * Con sesión, el **rol** coordinador va a la vista de seguimiento (sin mirar `allowed_apps`). Quien cumple un par del tablero
 * (supervisor de Despacho o de Secado, asistente de Despacho, admin) **entra directo al tablero, en `/dashboard`, y no ve
 * Traslado** aunque su cuenta tenga `traslado` (decidido el 2026-10-16): cualquier otra dirección lo lleva ahí. El resto va a la
 * home de Traslado si tiene `traslado` en `allowed_apps`, y a «Sin acceso» si no. Una persona sin acceso al tablero que abre
 * `/dashboard` vuelve a `/` (la dirección no se queda con una ruta que no es suya).
 */
export function AppShell({ auth, home, seguimiento, tablero }: AppShellProps) {
  const { estado, sesion } = useSesion(auth)
  const { ruta, navegar } = useRuta()
  const veTablero = tablero !== undefined && !esCoordinador(sesion) && puedeVerTablero(sesion)

  useEffect(() => {
    void auth.restaurar()
  }, [auth])

  // La dirección corrige a la pantalla que corresponde, sin dejar una entrada nueva en el historial (el botón «atrás» no vuelve a la mala).
  useEffect(() => {
    if (!sesion) return
    if (veTablero && ruta !== RUTA_TABLERO) navegar(RUTA_TABLERO, { reemplazar: true })
    else if (!veTablero && ruta === RUTA_TABLERO) navegar('/', { reemplazar: true })
  }, [sesion, veTablero, ruta, navegar])

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
  if (veTablero && tablero) return <>{tablero(sesion, cerrarSesion)}</>
  if (!tieneAcceso(sesion)) return <SinAccesoPage auth={auth} sesion={sesion} />
  return <>{home(sesion, cerrarSesion)}</>
}
