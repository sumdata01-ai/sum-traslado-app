import type { AuthPort, Sesion } from '@/core/auth'
import { Banner, Button } from '@/core/ui'

/** El usuario inició sesión pero su cuenta no tiene `traslado` en `allowed_apps`. */
export function SinAccesoPage({ auth, sesion }: { auth: AuthPort; sesion: Sesion }) {
  const nombre = sesion.nombre ?? sesion.usuario
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-[22px] font-bold">Sin acceso a Traslado</h1>
      {nombre && <p className="text-ink-2">Sesión iniciada como {nombre}.</p>}
      <Banner tono="warning">Tu usuario no tiene permiso para usar Traslado. Pide a tu supervisor que lo active.</Banner>
      <Button variante="secundario" onClick={() => void auth.logout()}>
        Cerrar sesión
      </Button>
    </main>
  )
}
