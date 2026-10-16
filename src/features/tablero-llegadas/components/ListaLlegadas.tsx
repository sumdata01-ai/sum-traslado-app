import type { ReactNode } from 'react'
import { Banner, Button, cx } from '@/core/ui'
import { type ChipEstado, type LlegadaTablero, estadoDe, horaLima, metros, nombreConductor, textoDemora, usuarioConductor } from '../domain'

export interface ListaLlegadasProps {
  /** Ya filtradas y ordenadas. */
  llegadas: readonly LlegadaTablero[]
  chip: ChipEstado
  onChip: (chip: ChipEstado) => void
  texto: string
  onTexto: (texto: string) => void
  masRecientesPrimero: boolean
  onOrden: () => void
  /** El servidor recortó la lista por su tope de seguridad. */
  truncado: boolean
  atenuado: boolean
  /** Se llama con el botón que lo pidió, para devolverle el foco al cerrar el detalle. */
  onAbrir: (idLlegada: number, abre: HTMLElement) => void
}

const COLUMNAS = 'md:grid md:grid-cols-[56px_minmax(0,1.5fr)_minmax(0,1.1fr)_76px_76px_96px_minmax(0,1.3fr)_76px_minmax(0,1.5fr)] md:items-center md:gap-3'

const CHIP = 'min-h-11 rounded-chip border border-line-strong bg-surface px-4 text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Un dato con su rótulo: el rótulo solo se ve en el teléfono, donde la tabla es una tarjeta. */
function Dato({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-xs font-semibold text-ink-3 md:hidden">{rotulo}</span>
      {children}
    </span>
  )
}

/**
 * La lista de llegadas del día (HU-2): una fila por llegada, por hora de recepción. En pantalla ancha es una tabla; debajo de
 * 768 px cada fila es una tarjeta con cada dato rotulado. Tocar una fila (o abrirla con el teclado) muestra su detalle. **El
 * color nunca va solo**: el estado «Normal» o «OUT_OF_WINDOW · N pasos» lleva su texto, y la fila con flag, además, su raya ámbar.
 * No se muestran coordenadas aquí, solo en el detalle.
 */
export function ListaLlegadas({ llegadas, chip, onChip, texto, onTexto, masRecientesPrimero, onOrden, truncado, atenuado, onAbrir }: ListaLlegadasProps) {
  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div role="group" aria-label="Filtrar por estado" className="flex gap-2">
          {(
            [
              ['todas', 'Todas'],
              ['flag', 'Con flag'],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={chip === valor}
              onClick={() => onChip(valor)}
              className={cx(CHIP, chip === valor && 'border-primary bg-primary text-surface')}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <label className="flex max-w-sm min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[13px] font-semibold text-ink-2">Buscar conductor</span>
          <input
            type="search"
            value={texto}
            onChange={(evento) => onTexto(evento.target.value)}
            placeholder="Nombre o usuario"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3.5 text-base text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
        <Button variante="secundario" onClick={onOrden}>
          {masRecientesPrimero ? 'Más recientes primero' : 'Más antiguas primero'}
        </Button>
      </div>

      {truncado && (
        <Banner tono="warning">Hay más llegadas de las que caben en esta lista. Los números de arriba cuentan todas; filtra por punto o por día para ver el resto.</Banner>
      )}

      <div aria-busy={atenuado} className={cx('min-h-[260px] overflow-hidden rounded-ficha border border-line bg-surface transition-opacity', atenuado && 'opacity-60')}>
        <div aria-hidden="true" className={cx(COLUMNAS, 'hidden border-b border-line bg-surface-2 py-2.5 pr-4 pl-5 text-xs font-bold tracking-wide text-ink-3 uppercase')}>
          <span>Turno</span>
          <span>Conductor</span>
          <span>Punto</span>
          <span>Hora QR</span>
          <span>Recibida</span>
          <span>Demora</span>
          <span>Distancia</span>
          <span>Precisión</span>
          <span>Estado</span>
        </div>

        {llegadas.length === 0 ? (
          <p role="status" className="px-4 py-10 text-center text-ink-3">
            Ninguna llegada con estos filtros
          </p>
        ) : (
          <ul aria-label="Llegadas">
            {llegadas.map((l) => {
              const estado = estadoDe(l)
              return (
                <li key={l.idLlegada}>
                  <button
                    type="button"
                    onClick={(evento) => onAbrir(l.idLlegada, evento.currentTarget)}
                    aria-label={`Turno ${l.turno}, ${nombreConductor(l.conductor)}, ${l.punto.nombre}, ${l.flag ? 'con flag' : 'normal'}. Abrir detalle`}
                    className={cx(
                      COLUMNAS,
                      'grid w-full grid-cols-2 gap-x-4 gap-y-2.5 border-b border-l-4 border-b-line px-4 py-3.5 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:py-3',
                      l.flag ? 'border-l-warning' : 'border-l-transparent',
                    )}
                  >
                    <Dato rotulo="Turno" className="text-lg font-extrabold tabular-nums">
                      {l.turno}
                    </Dato>
                    <Dato rotulo="Conductor">
                      <span className="truncate text-sm font-semibold">{nombreConductor(l.conductor)}</span>
                      <span className="truncate text-xs text-ink-3">{usuarioConductor(l.conductor)}</span>
                    </Dato>
                    <Dato rotulo="Punto" className="text-sm">
                      {l.punto.nombre}
                    </Dato>
                    <Dato rotulo="Hora del QR" className="text-sm tabular-nums">
                      {horaLima(l.horaOficial)}
                    </Dato>
                    <Dato rotulo="Recibida" className="text-sm tabular-nums">
                      {horaLima(l.horaRecepcion)}
                    </Dato>
                    <Dato rotulo="Demora" className="text-sm tabular-nums">
                      {textoDemora(l.demoraS)}
                    </Dato>
                    <Dato rotulo="Distancia">
                      <span className="text-sm tabular-nums">
                        {metros(l.distanciaM)} · {Math.round(l.pctRadio)} %
                      </span>
                      {/* Una sola barra de un solo color, hasta el 100 %: no hay umbral de advertencia. */}
                      <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
                        <span className="block h-1.5 bg-primary" style={{ width: `${Math.min(100, Math.max(0, l.pctRadio))}%` }} />
                      </span>
                    </Dato>
                    <Dato rotulo="Precisión" className="text-sm tabular-nums">
                      {metros(l.precisionM)}
                    </Dato>
                    <Dato rotulo="Estado">
                      <span
                        className={cx(
                          'inline-flex w-fit items-center gap-1.5 rounded-chip px-2.5 py-1 text-[13px] font-bold',
                          estado.tono === 'flag' ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success-ink',
                        )}
                      >
                        {estado.tono === 'flag' && (
                          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true" focusable="false">
                            <path d="M1 13V1h9l-2 3.5L10 8H2v5z" fill="currentColor" />
                          </svg>
                        )}
                        {estado.texto}
                      </span>
                    </Dato>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="text-[13px] text-ink-3">
        Ordenadas por hora de recepción. El turno es por punto y por día: con todos los puntos se repite entre puntos distintos. La barra mide la distancia contra
        el radio del punto.
      </p>
    </div>
  )
}
