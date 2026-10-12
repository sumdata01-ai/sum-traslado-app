import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export type VarianteBoton = 'primario' | 'secundario' | 'peligro'
export type TamanoBoton = 'normal' | 'compacto'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton
  tamano?: TamanoBoton
}

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-primary text-surface hover:bg-primary-deep',
  secundario: 'border border-line-strong bg-surface text-primary hover:bg-primary-soft',
  peligro: 'bg-danger text-surface hover:bg-danger-ink',
}

// Compacto: los botones de tarjeta miden de 30 a 32 px (patron-traslado-web.md §5). El normal mide
// 44 px de alto como mínimo para tocarlo con el pulgar; ese valor no está en el documento.
const TAMANOS: Record<TamanoBoton, string> = {
  normal: 'min-h-11 px-5',
  compacto: 'h-8 px-3',
}

/** Botón relleno: peso 700 y 15 px, radio 14. `type="button"` por defecto, para no enviar formularios sin querer. */
export function Button({ variante = 'primario', tamano = 'normal', type = 'button', className, ...resto }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center rounded-control text-[15px] font-bold whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...resto}
    />
  )
}
