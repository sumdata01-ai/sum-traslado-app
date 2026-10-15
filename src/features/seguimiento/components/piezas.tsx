import { cx } from '@/core/ui'
import {
  ETIQUETA_ETAPA,
  type EtapaSeguimiento,
  type Hito,
  type TrasladoSeguimiento,
  identificadorVehiculo,
  logoDeMarca,
  nombreVehiculo,
} from '../domain'
import { IconoVisto } from './iconos'

const TONO_ETAPA: Record<EtapaSeguimiento, string> = {
  en_camino: 'bg-info-soft text-info',
  en_planta: 'bg-page text-ink-2',
  entregado: 'bg-success-soft text-success-ink',
  anulado: 'bg-danger-soft text-danger-ink',
}

/** La etapa, siempre **con texto**: el color acompaña, no es lo único que dice el estado. */
export function EtiquetaEtapa({ etapa, grande = false }: { etapa: EtapaSeguimiento; grande?: boolean }) {
  return (
    <span className={cx('inline-block rounded-lg font-medium whitespace-nowrap', grande ? 'px-3.5 py-1 text-base' : 'px-2.5 py-0.5 text-[13px]', TONO_ETAPA[etapa])}>{ETIQUETA_ETAPA[etapa]}</span>
  )
}

/**
 * Los logos de marca que SUM agregó en `src/assets/marcas/` (ver el README de esa carpeta), por clave de marca
 * (`toyota`, `volkswagen`…). Sin archivos queda vacío y se muestra la inicial.
 */
const LOGOS_DE_MARCA: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('/src/assets/marcas/*.{svg,png}', { eager: true, query: '?url', import: 'default' })).map(([ruta, url]) => [
    /([^/]+)\.[a-z]+$/.exec(ruta)?.[1]?.toLowerCase() ?? ruta,
    url,
  ]),
)

/**
 * El logo de la marca si está en `src/assets/marcas/`; si no, un círculo neutro con su inicial (las marcas son registradas y
 * no se usa ningún logo sin permiso). Decorativo: la marca ya está escrita al lado.
 */
export function LogoMarca({ marca, grande = false }: { marca: string | null; grande?: boolean }) {
  const logo = logoDeMarca(LOGOS_DE_MARCA, marca)
  // Más ancha que alta: hay logos de palabra (Jetour) que en una caja angosta quedarían diminutos.
  const caja = grande ? 'h-16 w-24' : 'h-10 w-20'
  if (logo) {
    return (
      <span aria-hidden="true" className={cx('inline-flex shrink-0 items-center justify-center', caja)}>
        <img src={logo} alt="" className="max-h-full max-w-full object-contain" decoding="async" />
      </span>
    )
  }
  return (
    <span aria-hidden="true" className={cx('inline-flex shrink-0 items-center justify-center', caja)}>
      <span
        className={cx(
          'inline-flex items-center justify-center rounded-full border-[1.6px] border-ink-2 font-bold text-ink-2',
          grande ? 'size-16 text-3xl' : 'size-[38px] text-[15px]',
        )}
      >
        {marca?.trim().charAt(0).toUpperCase() || '·'}
      </span>
    </span>
  )
}

/**
 * El vehículo: logo, marca y modelo en negrita, el VIN completo y el color. Lo que el servidor no manda, no aparece.
 * Con `encabezado`, el nombre es un título de nivel 2 (en el detalle); en las listas es solo texto.
 */
export function DatosVehiculo({
  traslado,
  grande = false,
  encabezado = false,
}: {
  traslado: Pick<TrasladoSeguimiento, 'marca' | 'modelo' | 'color' | 'vin'>
  grande?: boolean
  encabezado?: boolean
}) {
  const Nombre = encabezado ? 'h2' : 'span'
  return (
    <span className="flex min-w-0 items-center gap-4 text-left">
      <LogoMarca marca={traslado.marca} grande={grande} />
      <span className="min-w-0">
        <Nombre className={cx('block leading-tight font-semibold text-primary-deep', grande ? 'text-xl md:text-2xl' : 'text-base')}>{nombreVehiculo(traslado)}</Nombre>
        <span className={cx('block break-all text-ink-2', grande ? 'mt-1 text-base' : 'text-sm')}>{identificadorVehiculo(traslado.vin)}</span>
        {traslado.color && <span className={cx('block text-ink-2', grande ? 'text-base' : 'text-sm')}>{traslado.color}</span>}
      </span>
    </span>
  )
}

/** Hitos registrados: un nodo con visto donde hay fecha, vacío donde no la hay. */
export function LineaDeTiempo({ hitos, grande = false }: { hitos: readonly Hito[]; grande?: boolean }) {
  return (
    <ol className="m-0 list-none p-0">
      {hitos.map((hito, i) => {
        const hecho = hito.fecha !== null
        const siguienteHecho = hecho && hitos[i + 1]?.fecha != null
        const ultimo = i === hitos.length - 1
        return (
          <li key={hito.titulo} className={cx('relative', grande ? 'min-h-8 pl-14' : 'min-h-6 pl-10', ultimo ? 'pb-0' : grande ? 'pb-10' : 'pb-6')}>
            <span
              aria-hidden="true"
              className={cx(
                'absolute top-0 left-0 flex items-center justify-center rounded-full border-2',
                grande ? 'size-8' : 'size-6',
                hecho ? 'border-primary bg-primary text-surface' : 'border-line-strong bg-surface',
              )}
            >
              {hecho && <IconoVisto className={grande ? 'size-[18px]' : 'size-3.5'} />}
            </span>
            {!ultimo && (
              <span
                aria-hidden="true"
                className={cx('absolute -bottom-0.5 w-0.5', grande ? 'top-[34px] left-[15px]' : 'top-[26px] left-[11px]', siguienteHecho ? 'bg-primary' : 'bg-line-strong')}
              />
            )}
            <p className={cx('font-medium', grande ? 'text-lg leading-8' : 'text-[15px] leading-6', hecho ? 'text-ink-1' : 'text-ink-2')}>{hito.titulo}</p>
            <p className={cx('text-ink-3 tabular-nums', grande ? 'text-base' : 'text-sm')}>
              {hecho ? (
                hito.fecha
              ) : (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Sin registro</span>
                </>
              )}
            </p>
            {hito.nota && <p className={cx('text-ink-3', grande ? 'text-sm' : 'text-xs')}>{hito.nota}</p>}
          </li>
        )
      })}
    </ol>
  )
}
