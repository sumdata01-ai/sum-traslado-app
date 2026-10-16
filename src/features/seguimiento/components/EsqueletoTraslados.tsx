import { cx } from '@/core/ui'

/** Una barra gris del esqueleto. Solo ocupa lugar: el tamaño lo ponen quienes la usan. */
function Barra({ className }: { className: string }) {
  return <span className={cx('block bg-line', className)} />
}

/** Los datos de un vehículo: el logo (la caja de 80 × 40), el nombre, el VIN y el color. */
function EsqueletoVehiculo() {
  return (
    <span className="flex items-center gap-4">
      <Barra className="h-10 w-20 shrink-0 rounded-ficha" />
      <span className="block">
        <Barra className="h-4 w-36 rounded-ficha" />
        <Barra className="mt-2 h-3.5 w-48 max-w-full rounded-ficha" />
        <Barra className="mt-2 h-3.5 w-16 rounded-ficha" />
      </span>
    </span>
  )
}

export interface EsqueletoTrasladosProps {
  /** Lo que oye quien usa un lector de pantalla (el esqueleto, que es dibujo, no se lee): «Cargando los traslados…». */
  mensaje: string
  /** Cuántos vehículos dibuja. */
  filas?: number
  /** Dibuja también la barra de pestañas (Todos / En camino / Entregados), para que no salte al llegar la lista. */
  conPestanas?: boolean
}

/**
 * El esqueleto de la lista de traslados mientras llega la información: **la misma silueta que la tabla de escritorio y que la
 * lista del teléfono**, para que al llegar los datos nada se mueva. Es solo un dibujo: está oculto para el lector de pantalla
 * (que oye `mensaje` en un aviso de estado), no tiene nada que se pueda enfocar o tocar, y **no se anima** si la persona pidió
 * menos movimiento. Solo usa los colores de la paleta.
 */
export function EsqueletoTraslados({ mensaje, filas = 6, conPestanas = false }: EsqueletoTrasladosProps) {
  const indices = Array.from({ length: filas }, (_, i) => i)
  return (
    <div role="status">
      <span className="sr-only">{mensaje}</span>
      <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
        {conPestanas && (
          <div className="-mx-1 mt-5 flex h-11 items-center gap-6 border-b border-line px-4">
            <Barra className="h-4 w-20 rounded-ficha" />
            <Barra className="h-4 w-24 rounded-ficha" />
            <Barra className="h-4 w-24 rounded-ficha" />
          </div>
        )}

        {/* Escritorio y tableta: tres columnas como la tabla (Vehículo, Destino, Etapa) y dos líneas por vehículo. */}
        <div className="mt-1 hidden md:block">
          <div className="grid grid-cols-[38%_28%_1fr] px-3 pt-5 pb-3">
            <Barra className="h-3.5 w-20 rounded-ficha" />
            <Barra className="h-3.5 w-16 rounded-ficha" />
            <Barra className="h-3.5 w-14 rounded-ficha" />
          </div>
          {indices.map((i) => (
            <div key={i} className="grid grid-cols-[38%_28%_1fr] border-t border-line px-3 pt-5 pb-4">
              <EsqueletoVehiculo />
              <span className="block">
                <Barra className="h-5 w-28 rounded-ficha" />
                <Barra className="mt-6 h-3.5 w-44 max-w-full rounded-ficha" />
              </span>
              <span className="block">
                <Barra className="h-6 w-24 rounded-chip" />
                <Barra className="mt-6 ml-auto h-4 w-24 rounded-ficha" />
              </span>
            </div>
          ))}
        </div>

        {/* Teléfono: filas continuas como la lista (vehículo; destino y etapa; fecha y «Ver detalle»). */}
        <ul className="m-0 list-none p-0 md:hidden">
          {indices.map((i) => (
            <li key={i} className="border-b border-line py-4">
              <EsqueletoVehiculo />
              <div className="mt-3 flex items-center justify-between gap-3">
                <Barra className="h-5 w-28 rounded-ficha" />
                <Barra className="h-6 w-20 rounded-chip" />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <Barra className="h-3.5 w-40 rounded-ficha" />
                <Barra className="h-4 w-24 rounded-ficha" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
