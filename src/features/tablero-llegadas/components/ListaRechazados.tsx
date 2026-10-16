import type { ReactNode } from 'react'
import { Banner, cx } from '@/core/ui'
import { type IntentoTablero, ORDEN_MOTIVOS, type TonoMotivo, descripcionDeMotivo, horaLima, nombreConductor, textoAntiguedad, usuarioConductor } from '../domain'

export interface ListaRechazadosProps {
  /** Ya filtrados. */
  intentos: readonly IntentoTablero[]
  /** `null` = todos los motivos. */
  motivo: string | null
  onMotivo: (motivo: string | null) => void
  texto: string
  onTexto: (texto: string) => void
  truncado: boolean
  atenuado: boolean
}

const TONOS: Record<TonoMotivo, string> = {
  neutro: 'bg-surface-2 text-ink-2',
  rojo: 'bg-danger-soft text-danger-ink',
  ambar: 'bg-warning-soft text-warning-ink',
}

const COLUMNAS = 'md:grid md:grid-cols-[84px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_130px_minmax(0,1.2fr)_minmax(0,2fr)] md:gap-3'

const CHIP = 'min-h-11 rounded-chip border border-line-strong bg-surface px-4 text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

function Dato({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-xs font-semibold text-ink-3 md:hidden">{rotulo}</span>
      {children}
    </span>
  )
}

/**
 * Los códigos rechazados del día (HU-5 y HU-6), del más reciente al más antiguo. Al conductor siempre le aparece «El código no
 * es válido»: el motivo solo se ve aquí, y se dice. **Nunca se muestra el código completo**: solo el inicio del texto que leyó la
 * cámara (la firma del punto no sale del servidor).
 */
export function ListaRechazados({ intentos, motivo, onMotivo, texto, onTexto, truncado, atenuado }: ListaRechazadosProps) {
  return (
    <div className="flex flex-col gap-3 pt-4">
      <Banner tono="warning">
        Al conductor <strong>siempre</strong> le aparece «El código no es válido». El motivo solo se ve aquí. Los escaneos fuera de zona o con poca precisión no se
        registran y no aparecen en esta lista.
      </Banner>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div role="group" aria-label="Filtrar por motivo" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={motivo === null} onClick={() => onMotivo(null)} className={cx(CHIP, motivo === null && 'border-primary bg-primary text-surface')}>
            Todos
          </button>
          {ORDEN_MOTIVOS.map((m) => (
            <button key={m} type="button" aria-pressed={motivo === m} onClick={() => onMotivo(m)} className={cx(CHIP, motivo === m && 'border-primary bg-primary text-surface')}>
              {descripcionDeMotivo(m).etiqueta}
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
      </div>

      {truncado && <Banner tono="warning">Hay más códigos rechazados de los que caben en esta lista. El número de arriba cuenta todos.</Banner>}

      <div aria-busy={atenuado} className={cx('min-h-[260px] overflow-hidden rounded-ficha border border-line bg-surface transition-opacity', atenuado && 'opacity-60')}>
        <div aria-hidden="true" className={cx(COLUMNAS, 'hidden border-b border-line bg-surface-2 px-4 py-2.5 text-xs font-bold tracking-wide text-ink-3 uppercase')}>
          <span>Recibido</span>
          <span>Conductor</span>
          <span>Punto</span>
          <span>Motivo</span>
          <span>Antigüedad del QR</span>
          <span>Lo que leyó</span>
          <span>Qué puede significar</span>
        </div>
        {intentos.length === 0 ? (
          <p role="status" className="px-4 py-10 text-center text-ink-3">
            Ningún código rechazado con estos filtros
          </p>
        ) : (
          <ul aria-label="Códigos rechazados">
            {intentos.map((i) => {
              const m = descripcionDeMotivo(i.motivo)
              return (
                <li key={i.idIntento} className={cx(COLUMNAS, 'grid grid-cols-2 gap-x-4 gap-y-2.5 border-b border-line px-4 py-3.5 text-sm md:items-start md:py-3')}>
                  <Dato rotulo="Recibido" className="tabular-nums">
                    {horaLima(i.horaRecepcion)}
                  </Dato>
                  <Dato rotulo="Conductor">
                    <span className="truncate font-semibold">{nombreConductor(i.conductor)}</span>
                    <span className="truncate text-xs text-ink-3">{usuarioConductor(i.conductor)}</span>
                  </Dato>
                  <Dato rotulo="Punto">{i.punto ? i.punto.nombre : '— (no existe)'}</Dato>
                  <Dato rotulo="Motivo">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={cx('rounded-chip px-2.5 py-1 text-[13px] font-bold', TONOS[m.tono])}>{m.etiqueta}</span>
                      {i.repeticionesConductorDia >= 2 && (
                        <span
                          title="Intentos de este conductor con este motivo en el día"
                          className="rounded-chip bg-primary-deep px-2 py-1 text-[13px] font-extrabold text-surface"
                        >
                          <span aria-hidden="true">×{i.repeticionesConductorDia}</span>
                          <span className="sr-only">{i.repeticionesConductorDia} veces ese día</span>
                        </span>
                      )}
                    </span>
                  </Dato>
                  <Dato rotulo="Antigüedad del QR">{i.antiguedadQrS === null ? '—' : textoAntiguedad(i.antiguedadQrS)}</Dato>
                  <Dato rotulo="Lo que leyó la cámara" className="font-mono text-[13px] break-all">
                    {i.textoInicio}…
                  </Dato>
                  <Dato rotulo="Qué puede significar" className="text-[13px] text-ink-2">
                    {m.ayuda}
                  </Dato>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="text-[13px] text-ink-3">Del más reciente al más antiguo. Se muestran los últimos 90 días. Nunca se muestra el código completo: es la firma del punto.</p>
    </div>
  )
}
