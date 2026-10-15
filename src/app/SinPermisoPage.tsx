import { Banner, Button } from '@/core/ui'

export interface SinPermisoPageProps {
  mensaje: string
  onCerrarSesion: () => void
  /** Por defecto, el de Traslado. La vista de seguimiento pone el suyo. */
  titulo?: string
  explicacion?: string
}

/**
 * El backend respondió 403: el rol de este usuario no puede usar esta parte. La sesión NO se cierra sola; el usuario decide
 * (decisión del 2026-10-09, ver docs/07-planificacion/backlog.md O-01).
 */
export function SinPermisoPage({
  mensaje,
  onCerrarSesion,
  titulo = 'Sin permiso para Traslado',
  explicacion = 'Tu usuario no tiene un rol que pueda usar Traslado. Pide a tu supervisor que lo revise.',
}: SinPermisoPageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-[22px] font-bold">{titulo}</h1>
      <Banner tono="warning">{mensaje}</Banner>
      <p className="text-ink-2">{explicacion}</p>
      <Button variante="secundario" onClick={onCerrarSesion}>
        Cerrar sesión
      </Button>
    </main>
  )
}
