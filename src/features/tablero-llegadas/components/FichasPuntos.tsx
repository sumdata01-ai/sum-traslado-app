import { cx } from '@/core/ui'
import { type PuntoFicha, horaLima, numero } from '../domain'

export interface FichasPuntosProps {
  puntos: readonly PuntoFicha[]
  atenuado: boolean
}

const coordenada = (n: number) => n.toFixed(6).replace('.', ',')

/**
 * Con qué reglas mide cada punto (HU-7): una ficha de **consulta**, sin ninguna acción (no se crea, edita ni desactiva nada
 * desde aquí). De la llave del punto solo se dice que existe: **nunca se muestra** (el servidor no la manda).
 */
export function FichasPuntos({ puntos, atenuado }: FichasPuntosProps) {
  return (
    <div className="flex flex-col gap-3 pt-4">
      <p className="text-sm text-ink-2">Ficha de consulta: con qué reglas mide cada punto. No se crea, edita ni desactiva nada desde aquí.</p>
      {puntos.length === 0 ? (
        <p role="status" className="py-10 text-center text-ink-3">
          Todavía no hay puntos para mostrar.
        </p>
      ) : (
        <ul aria-busy={atenuado} className={cx('grid grid-cols-1 gap-3 transition-opacity md:grid-cols-2 xl:grid-cols-3', atenuado && 'opacity-60')}>
          {puntos.map((p) => (
            <li key={p.idPunto} className="flex flex-col gap-2.5 rounded-ficha border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[17px] font-bold">{p.nombre}</h3>
                <span className={cx('rounded-chip px-2.5 py-1 text-[13px] font-bold', p.activo ? 'bg-success-soft text-success-ink' : 'bg-surface-2 text-ink-2')}>
                  {p.activo ? 'Activo' : 'Desactivado'}
                </span>
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-ink-3">Centro</dt>
                <dd className="text-right tabular-nums">
                  {coordenada(p.latitud)}, {coordenada(p.longitud)}
                </dd>
                <dt className="text-ink-3">Radio</dt>
                <dd className="text-right tabular-nums">{numero(p.radioM)} m</dd>
                <dt className="text-ink-3">Precisión máxima</dt>
                <dd className="text-right tabular-nums">{numero(p.precisionMaxM)} m</dd>
                <dt className="text-ink-3">Llegadas del día</dt>
                <dd className="text-right tabular-nums">{p.llegadasDia}</dd>
                <dt className="text-ink-3">Último escaneo</dt>
                <dd className="text-right tabular-nums">{p.ultimoEscaneo ? horaLima(p.ultimoEscaneo) : '—'}</dd>
                <dt className="text-ink-3">Secreto</dt>
                <dd className="text-right">guardado · no se muestra nunca</dd>
              </dl>
              <div className="rounded-control bg-primary-soft px-3 py-2.5 text-sm text-primary-deep">
                <strong>
                  Peor caso aceptado: <span className="tabular-nums">{numero(p.peorCasoM)} m</span>
                </strong>
                <br />
                <span className="text-[13px]">Radio + precisión máxima: la distancia máxima a la que puede estar el teléfono verdadero y que el sistema igual acepte la llegada.</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
