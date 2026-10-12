import { cx } from './cx'

export interface ProgressCounterProps {
  enviados: number
  porEnviar: number
  sinEmpezar: number
}

interface Grupo {
  n: number
  etiqueta: string
  color: string
}

/**
 * Contador de avance: tres cuadros de **alto fijo de 92 px**, con el número a 28 px y la etiqueta a
 * 11 px. Muestra solo los grupos que tienen algo: un «0 enviados» no le dice nada al conductor.
 *
 * Es solo presentación. Calcular los tres grupos y decidir si vale la pena mostrarlos (la app lo
 * hace desde 2 órdenes) es del dominio y llega con la home (O-01).
 *
 * Alto fijo y no un cuadrado: con alto fijo queda casi cuadrado en vertical y se vuelve un mosaico
 * ancho en horizontal, sin desbordar (misma razón que en `traslado_home_page.dart`).
 */
export function ProgressCounter({ enviados, porEnviar, sinEmpezar }: ProgressCounterProps) {
  const grupos: Grupo[] = [
    ...(enviados > 0 ? [{ n: enviados, etiqueta: enviados === 1 ? 'enviado' : 'enviados', color: 'text-success' }] : []),
    ...(porEnviar > 0 ? [{ n: porEnviar, etiqueta: 'por enviar', color: 'text-warning-ink' }] : []),
    ...(sinEmpezar > 0 ? [{ n: sinEmpezar, etiqueta: 'sin empezar', color: 'text-ink-3' }] : []),
  ]

  if (grupos.length === 0) return null

  return (
    <div role="group" aria-label="Avance de traslados" className="flex w-full gap-2">
      {grupos.map((g) => (
        <div
          key={g.etiqueta}
          className="flex h-[92px] min-w-0 flex-1 flex-col items-center justify-center rounded-ficha border border-line bg-surface"
        >
          <span className={cx('text-[28px] leading-[1.1] font-extrabold', g.color)}>{g.n}</span>
          <span className="mt-0.5 line-clamp-2 px-1.5 text-center text-[11px] text-ink-3">{g.etiqueta}</span>
        </div>
      ))}
    </div>
  )
}
