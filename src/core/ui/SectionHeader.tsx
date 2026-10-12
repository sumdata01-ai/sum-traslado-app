import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export interface SectionHeaderProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Cantidad de elementos de la sección; se muestra en una píldora. */
  contador?: number
}

/**
 * Encabezado de sección: MAYÚSCULAS, 12 px, peso 800, con un contador en píldora. Las mayúsculas
 * son solo de presentación (`uppercase`): el texto real y el que lee el lector de pantalla no cambian.
 */
export function SectionHeader({ contador, className, children, ...resto }: SectionHeaderProps) {
  return (
    <h2
      className={cx('flex items-center gap-2 text-[12px] font-extrabold tracking-wide text-ink-2 uppercase', className)}
      {...resto}
    >
      {children}
      {contador !== undefined && (
        <span className="rounded-chip bg-line px-2 py-0.5 text-[11px] font-bold text-ink-2 normal-case">{contador}</span>
      )}
    </h2>
  )
}
