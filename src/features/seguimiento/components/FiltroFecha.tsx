import { useEffect, useId, useRef, useState } from 'react'
import { Button, cx } from '@/core/ui'
import { PRESETS_FECHA, type PresetFecha, type RangoFechas, errorDeRango, etiquetaDeRango, presetDeRango, rangoDePreset } from '../domain'
import { IconoCalendario, IconoFlecha } from './iconos'

export interface FiltroFechaProps {
  /** El rango que se está mostrando. */
  rango: RangoFechas
  /** El día de hoy en Lima (`AAAA-MM-DD`): de él salen «Hoy», «Ayer» y el tope de los selectores de fecha. */
  hoy: string
  /**
   * Pide el rango. Devuelve el motivo si no se pudo (un rango que el servidor rechazaría) o `null` si se pidió. El filtro
   * solo actúa aquí, al pulsar «Aplicar»: elegir una opción no pide nada.
   */
  onAplicar: (rango: RangoFechas) => Promise<string | null>
}

type Opcion = PresetFecha | 'personalizado'

interface Borrador {
  opcion: Opcion
  desde: string
  hasta: string
}

const OPCIONES: ReadonlyArray<{ valor: Opcion; etiqueta: string }> = [...PRESETS_FECHA, { valor: 'personalizado', etiqueta: 'Rango personalizado' }]

const borradorDe = (rango: RangoFechas, hoy: string): Borrador => ({
  opcion: presetDeRango(rango, hoy) ?? 'personalizado',
  desde: rango.desde,
  hasta: rango.hasta,
})

const CAMPO_FECHA =
  'min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/**
 * El filtro por fecha de la lista: un botón con el rango actual que abre un panel con «Hoy», «Ayer», «Últimos 7 días»,
 * «Últimos 30 días» y «Rango personalizado» (Desde / Hasta). **Elegir no pide nada**: el rango se pide al servidor al pulsar
 * «Aplicar». «Cancelar», Escape o tocar fuera cierran sin cambiar nada y devuelven el foco al botón.
 *
 * No hay «Todas las fechas»: el servidor acota lo que devuelve (a lo más 90 días), así que esa opción prometería más de lo
 * que se puede traer.
 */
export function FiltroFecha({ rango, hoy, onAplicar }: FiltroFechaProps) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(rango, hoy))
  const [error, setError] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const idPanel = useId()
  const idError = useId()

  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false)
    setError(null)
    if (devolverFoco) boton.current?.focus()
  }

  const alternar = () => {
    if (abierto) return cerrar(true)
    // Cada vez que se abre muestra lo que está aplicado: lo que se eligió y no se aplicó no se recuerda.
    setBorrador(borradorDe(rango, hoy))
    setError(null)
    setAbierto(true)
  }

  // Al abrir, el foco va a la opción marcada.
  useEffect(() => {
    if (abierto) panel.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus()
  }, [abierto])

  // Escape y tocar fuera cierran sin aplicar.
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      evento.stopPropagation()
      setAbierto(false)
      setError(null)
      boton.current?.focus()
    }
    const alTocarFuera = (evento: PointerEvent) => {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false)
        setError(null)
      }
    }
    document.addEventListener('keydown', alPulsar)
    document.addEventListener('pointerdown', alTocarFuera)
    return () => {
      document.removeEventListener('keydown', alPulsar)
      document.removeEventListener('pointerdown', alTocarFuera)
    }
  }, [abierto])

  const aplicar = async () => {
    const elegido = borrador.opcion === 'personalizado' ? { desde: borrador.desde, hasta: borrador.hasta } : rangoDePreset(borrador.opcion, hoy)
    const motivo = errorDeRango(elegido.desde, elegido.hasta, hoy)
    if (motivo) return setError(motivo)
    setAplicando(true)
    const rechazo = await onAplicar(elegido)
    setAplicando(false)
    if (rechazo) return setError(rechazo)
    cerrar(true)
  }

  const cambiarFecha = (campo: 'desde' | 'hasta', valor: string) => {
    setError(null)
    setBorrador((anterior) => ({ ...anterior, [campo]: valor }))
  }

  return (
    <div ref={contenedor} className="relative md:w-auto">
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={alternar}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-control border border-line-strong bg-surface px-3 text-base text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:w-auto"
      >
        <IconoCalendario className="size-[18px] shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="text-ink-2">Fecha:</span>{' '}
          <span className="font-semibold">{etiquetaDeRango(rango, hoy)}</span>
        </span>
        <IconoFlecha className={cx('size-4 shrink-0 text-ink-2', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div
          ref={panel}
          id={idPanel}
          role="dialog"
          aria-label="Filtrar por fecha"
          // En el teléfono el botón ocupa todo el ancho y el panel también. En pantallas anchas el botón queda en el extremo derecho
          // de la fila: el panel se alinea con SU borde derecho (si se alineara con el izquierdo, se saldría por la derecha de la ventana).
          className="absolute top-full left-0 z-30 mt-2 w-full max-w-[calc(100vw-2rem)] min-w-[280px] rounded-ficha border border-line-strong bg-surface p-4 shadow-xl md:right-0 md:left-auto md:w-[340px]"
        >
          <fieldset>
            <legend className="mb-2 text-base font-bold text-ink-1">Fecha de registro</legend>
            <div className="flex flex-col">
              {OPCIONES.map((opcion) => (
                <label key={opcion.valor} className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-ink-1">
                  <input
                    type="radio"
                    name={`${idPanel}-opcion`}
                    value={opcion.valor}
                    checked={borrador.opcion === opcion.valor}
                    onChange={() => {
                      setError(null)
                      setBorrador((anterior) => ({ ...anterior, opcion: opcion.valor }))
                    }}
                    className="size-5 accent-primary"
                  />
                  {opcion.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>

          {borrador.opcion === 'personalizado' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
                Desde
                <input
                  type="date"
                  value={borrador.desde}
                  max={hoy}
                  onChange={(evento) => cambiarFecha('desde', evento.target.value)}
                  aria-describedby={error ? idError : undefined}
                  className={CAMPO_FECHA}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
                Hasta
                <input
                  type="date"
                  value={borrador.hasta}
                  max={hoy}
                  onChange={(evento) => cambiarFecha('hasta', evento.target.value)}
                  aria-describedby={error ? idError : undefined}
                  className={CAMPO_FECHA}
                />
              </label>
            </div>
          )}

          {error && (
            <p id={idError} role="alert" className="mt-3 text-sm text-danger-ink">
              {error}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variante="secundario" onClick={() => cerrar(true)}>
              Cancelar
            </Button>
            <Button disabled={aplicando} onClick={() => void aplicar()}>
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
