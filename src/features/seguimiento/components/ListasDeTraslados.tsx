import { type TrasladoSeguimiento, formatoFecha } from '../domain'
import { IconoFlechaDerecha } from './iconos'
import { DatosVehiculo, EtiquetaEtapa } from './piezas'

/** «—» a la vista, con el motivo para quien escucha el texto. */
function SinDato({ motivo }: { motivo: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{motivo}</span>
    </>
  )
}

/**
 * La línea de fecha de un traslado: la salida registrada si va en camino o sigue en planta («—» mientras no sale), la entrega
 * si ya llegó. `null` donde no hay nada que decir.
 */
function LineaFecha({ traslado, ahora }: { traslado: TrasladoSeguimiento; ahora: Date }) {
  if (traslado.etapa === 'en_camino' || traslado.etapa === 'en_planta') {
    const salida = formatoFecha(traslado.salidaRegistrada, { ahora })
    return <>Salida registrada: {salida ?? <SinDato motivo="Todavía sin registro" />}</>
  }
  if (traslado.etapa === 'entregado') {
    const entrega = formatoFecha(traslado.entregadoEn, { conHora: !traslado.entregaEstimada, ahora })
    return <>Entregado: {entrega ?? <SinDato motivo="Sin registro" />}</>
  }
  return null
}

export interface ListaProps {
  traslados: readonly TrasladoSeguimiento[]
  ahora: Date
  /** Se llama con el botón que lo pidió, para devolverle el foco al cerrar el detalle. */
  onAbrir: (idOrden: number, abre: HTMLElement) => void
}

/** El botón «Ver detalle →»; su nombre accesible dice de qué vehículo es (la flecha es solo adorno). */
function VerDetalle({ traslado, onAbrir, className }: { traslado: TrasladoSeguimiento; onAbrir: ListaProps['onAbrir']; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Ver detalle de ${traslado.vin}`}
      onClick={(evento) => {
        evento.stopPropagation()
        onAbrir(traslado.idOrden, evento.currentTarget)
      }}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${className ?? ''}`}
    >
      Ver detalle
      <IconoFlechaDerecha aria-hidden="true" className="size-4" />
    </button>
  )
}

const CELDA = 'px-3 align-top'

/**
 * La tabla de escritorio y tableta: cada vehículo son dos filas (sus datos; y su fecha con «Ver detalle»). Se abre el detalle
 * con el botón (teclado) o tocando la fila (ratón).
 */
export function TablaTraslados({ traslados, ahora, onAbrir }: ListaProps) {
  return (
    <div className="mt-1 hidden overflow-x-auto md:block" role="region" aria-label="Tabla de vehículos" tabIndex={0}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {[
              ['Vehículo', 'w-[38%]'],
              ['Destino', 'w-[28%]'],
              ['Etapa', ''],
            ].map(([titulo, ancho]) => (
              <th key={titulo} scope="col" className={`${CELDA} ${ancho} pt-5 pb-3 text-left text-sm font-medium whitespace-nowrap text-ink-3`}>
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        {traslados.map((t) => (
          <tbody
            key={t.idOrden}
            onClick={(evento) => onAbrir(t.idOrden, evento.currentTarget.querySelector('button')!)}
            className="cursor-pointer border-t border-line hover:bg-surface-2"
          >
            <tr>
              <td className={`${CELDA} pt-5 pb-3`}>
                <DatosVehiculo traslado={t} />
              </td>
              <td className={`${CELDA} pt-5 pb-3 text-base font-semibold text-primary-deep`}>{t.destino ?? <SinDato motivo="Sin destino" />}</td>
              <td className={`${CELDA} pt-5 pb-3`}>
                <EtiquetaEtapa etapa={t.etapa} />
              </td>
            </tr>
            <tr>
              <td />
              <td className={`${CELDA} pt-1 pb-4 text-sm text-ink-2`}>
                <LineaFecha traslado={t} ahora={ahora} />
              </td>
              <td className={`${CELDA} pt-1 pb-4 text-right`}>
                <VerDetalle traslado={t} onAbrir={onAbrir} />
              </td>
            </tr>
          </tbody>
        ))}
      </table>
    </div>
  )
}

/** La lista del teléfono: filas continuas separadas por líneas, sin tarjetas ni sombras. */
export function ListaMovil({ traslados, ahora, onAbrir }: ListaProps) {
  return (
    <ul className="m-0 list-none p-0 md:hidden" aria-label="Lista de vehículos">
      {traslados.map((t) => (
        <li key={t.idOrden} className="border-b border-line py-4">
          <DatosVehiculo traslado={t} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 text-base font-semibold text-primary-deep">{t.destino ?? <SinDato motivo="Sin destino" />}</p>
            <EtiquetaEtapa etapa={t.etapa} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-2">
              <LineaFecha traslado={t} ahora={ahora} />
            </p>
            <VerDetalle traslado={t} onAbrir={onAbrir} />
          </div>
        </li>
      ))}
    </ul>
  )
}
