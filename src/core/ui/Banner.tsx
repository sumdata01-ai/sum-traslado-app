import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export type TonoBanner = 'warning' | 'success' | 'danger' | 'info'

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  tono: TonoBanner
}

const ESTILOS: Record<TonoBanner, string> = {
  warning: 'border-warning/40 bg-warning-soft text-warning-ink',
  success: 'border-success/40 bg-success-soft text-success-ink',
  danger: 'border-danger/40 bg-danger-soft text-danger-ink',
  info: 'border-info/30 bg-info-soft text-info',
}

/**
 * Banner de color arriba, **sin modal y sin bloquear**: ámbar sin conexión, verde listo, rojo error.
 * El rojo se anuncia como alerta; los demás, como estado, para no interrumpir al lector de pantalla.
 */
export function Banner({ tono, className, children, ...resto }: BannerProps) {
  return (
    <div
      role={tono === 'danger' ? 'alert' : 'status'}
      className={cx('w-full rounded-ficha border px-4 py-3 text-sm font-medium', ESTILOS[tono], className)}
      {...resto}
    >
      {children}
    </div>
  )
}
