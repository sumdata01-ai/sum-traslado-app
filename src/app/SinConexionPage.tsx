import type { AuthPort } from '@/core/auth'
import { Banner, Button } from '@/core/ui'

/** Se sabe quién es el usuario, pero no se pudo comprobar su sesión porque no hay conexión. */
export function SinConexionPage({ auth }: { auth: AuthPort }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-[22px] font-bold">Traslado</h1>
      <Banner tono="warning">No se pudo comprobar tu sesión porque no hay conexión. Revisa la señal y vuelve a intentar.</Banner>
      <Button onClick={() => void auth.restaurar()}>Reintentar</Button>
      <Button variante="secundario" onClick={() => void auth.logout()}>
        Cerrar sesión
      </Button>
    </main>
  )
}
