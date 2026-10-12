import { cx } from '@/core/ui'
import type { ZonaVista } from '../data/formularioCaptura'

export interface FichaZonaProps {
  vista: ZonaVista
  /** Es la zona a la que irá la próxima foto. */
  activa: boolean
  /** No se puede cambiar de zona mientras hay una foto en captura o en revisión. */
  deshabilitada: boolean
  /** Hay quien sube las fotos: la ficha muestra cómo va la subida, no solo «Tomada». */
  conSubida?: boolean
  onSeleccionar: () => void
  /** «Reintentar» la subida de una foto fallida. */
  onReintentar?: () => void
}

/**
 * Ficha de una zona: su miniatura o un hueco, y su estado. Tocarla la elige para la próxima foto
 * (para repetirla si ya tiene, o para completar un hueco). Si la subida de su foto falló, aparte
 * hay un botón «Reintentar»: son dos botones hermanos, no uno dentro del otro.
 */
export function FichaZona({ vista, activa, deshabilitada, conSubida = false, onSeleccionar, onReintentar }: FichaZonaProps) {
  const { etiqueta, foto, aRetomar } = vista
  const subida = conSubida && foto ? foto.subida : null
  const fallida = subida === 'fallida'

  const estado = !foto
    ? aRetomar
      ? 'Vuelve a tomarla'
      : activa
        ? 'Siguiente'
        : 'Sin foto'
    : subida === 'subida'
      ? 'Subida'
      : subida === 'subiendo'
        ? 'Subiendo…'
        : subida === 'enEspera'
          ? 'Tomada, por subir'
          : fallida
            ? 'No se pudo subir'
            : 'Tomada'
  const descripcion = !foto
    ? aRetomar
      ? 'la foto no se guardó. Tocar para volver a tomarla'
      : 'sin foto'
    : `foto ${estado.toLowerCase().replace('…', '')}. Tocar para repetirla`

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onSeleccionar}
        disabled={deshabilitada}
        aria-pressed={activa}
        aria-label={`${etiqueta}: ${descripcion}`}
        className={cx(
          'flex w-full items-center gap-3 rounded-ficha border bg-surface p-2 text-left',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          activa ? 'border-primary ring-2 ring-primary' : aRetomar || fallida ? 'border-danger' : 'border-line',
        )}
      >
        {foto ? (
          <img src={foto.urlMiniatura} alt="" className="h-14 w-14 shrink-0 rounded-[8px] object-cover" />
        ) : (
          <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-[8px] border-2 border-dashed border-line-strong bg-surface-2" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink-1">{etiqueta}</span>
          <span className={cx('block text-xs', fallida || aRetomar ? 'text-danger-ink' : foto ? 'text-success-ink' : 'text-ink-3')}>{estado}</span>
        </span>
      </button>
      {fallida && (
        <div className="flex items-center gap-2 px-1">
          <p role="alert" className="min-w-0 flex-1 text-xs text-danger-ink">
            {foto?.errorSubida ?? 'No se pudo subir la foto.'}
          </p>
          <button
            type="button"
            onClick={onReintentar}
            aria-label={`Reintentar subida: ${etiqueta}`}
            className="min-h-11 shrink-0 rounded-ficha border border-primary px-4 text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  )
}
