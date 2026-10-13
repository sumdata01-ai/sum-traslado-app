import { Banner, Button } from '@/core/ui'

/**
 * El backend respondió 403 al pedir las órdenes: el rol de este usuario no puede usar Traslado.
 * La sesión NO se cierra sola; el usuario decide (decisión del 2026-10-09, ver docs/07-planificacion/backlog.md O-01).
 */
export function SinPermisoPage({ mensaje, onCerrarSesion }: { mensaje: string; onCerrarSesion: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-[22px] font-bold">Sin permiso para Traslado</h1>
      <Banner tono="warning">{mensaje}</Banner>
      <p className="text-ink-2">Tu usuario no tiene un rol que pueda usar Traslado. Pide a tu supervisor que lo revise.</p>
      <Button variante="secundario" onClick={onCerrarSesion}>
        Cerrar sesión
      </Button>
    </main>
  )
}
