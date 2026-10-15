import { type TrasladoSeguimiento, hitosDe } from '../domain'
import { IconoCerrar } from './iconos'
import { DatosVehiculo, EtiquetaEtapa, LineaDeTiempo } from './piezas'

export interface DetalleTrasladoProps {
  traslado: TrasladoSeguimiento
  /** Para decidir si una fecha lleva el año. */
  ahora: Date
  onCerrar: () => void
}

/**
 * El detalle de un vehículo: quién es, a qué destino va, en qué etapa está y los hitos registrados. **Nada de GPS**: ni
 * ubicación ni si lleva dispositivo (decisión del 2026-10-15). Sin conductor, velocidad ni fotos. Una sola columna; lo pone
 * dentro de un panel `PanelDetalle`.
 */
export function DetalleTraslado({ traslado, ahora, onCerrar }: DetalleTrasladoProps) {
  return (
    <section aria-label="Detalle del vehículo" className="bg-surface">
      <div className="flex justify-end px-4 pt-3">
        <button
          type="button"
          data-cerrar
          onClick={onCerrar}
          className="inline-flex min-h-12 items-center gap-2 rounded-control px-4 text-base font-medium text-ink-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <IconoCerrar className="size-5" />
          Cerrar
        </button>
      </div>

      <div className="border-b border-line px-6 pb-6">
        <DatosVehiculo traslado={traslado} grande encabezado />
      </div>

      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-4 border-b border-line px-6 py-6 text-lg">
        <dt className="text-ink-3">Destino</dt>
        <dd className="m-0 font-semibold text-primary-deep">{traslado.destino ?? 'Sin destino'}</dd>
        <dt className="text-ink-3">Etapa</dt>
        <dd className="m-0">
          <EtiquetaEtapa etapa={traslado.etapa} grande />
        </dd>
      </dl>

      <div className="px-6 pt-6 pb-10">
        <h3 className="mb-6 text-xl font-semibold text-primary-deep">Hitos del traslado</h3>
        <LineaDeTiempo hitos={hitosDe(traslado, ahora)} grande />
      </div>
    </section>
  )
}
