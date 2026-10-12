import { textoContador } from '../domain'

/** `3/6 fotos tomadas`. Se anuncia al lector de pantalla cada vez que cambia. */
export function ContadorFotos({ tomadas, total }: { tomadas: number; total: number }) {
  return (
    <p aria-live="polite" className="flex items-baseline gap-2 text-ink-2">
      <span className="text-[28px] leading-none font-extrabold text-ink-1">{textoContador(tomadas, total)}</span>
      <span className="text-sm">fotos tomadas</span>
    </p>
  )
}
