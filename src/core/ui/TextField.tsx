import { type InputHTMLAttributes, useId } from 'react'
import { cx } from './cx'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string
}

/**
 * Campo de texto con su etiqueta visible y asociada. El texto mide 16 px (`text-base`) a propósito:
 * por debajo de eso Safari en iPhone amplía la página al enfocar el campo.
 */
export function TextField({ etiqueta, id, className, ...resto }: TextFieldProps) {
  const idGenerado = useId()
  const idCampo = id ?? idGenerado

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={idCampo} className="text-sm font-bold text-ink-2">
        {etiqueta}
      </label>
      <input
        id={idCampo}
        className={cx(
          'min-h-11 w-full rounded-control border border-line-strong bg-surface px-4 text-base text-ink-1',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...resto}
      />
    </div>
  )
}
