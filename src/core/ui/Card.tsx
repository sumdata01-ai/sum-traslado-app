import type { HTMLAttributes } from 'react'
import { cx } from './cx'

/** Tarjeta: siempre con borde y **sin sombra**, radio 12 y 14 px de relleno. */
export function Card({ className, ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-ficha border border-line bg-surface p-3.5', className)} {...resto} />
}
