import { useMemo, useState } from 'react'
import logoSum from '@/assets/sum-logo.png'
import type { Sesion } from '@/core/auth'
import { Banner, Button, cx } from '@/core/ui'
import { IconoActualizar } from '@/features/seguimiento/components/iconos'
import { PanelDetalle } from '@/features/seguimiento/components/PanelDetalle'
import { DetalleLlegada } from '@/features/tablero-llegadas/components/DetalleLlegada'
import { FichasPuntos } from '@/features/tablero-llegadas/components/FichasPuntos'
import { ListaLlegadas } from '@/features/tablero-llegadas/components/ListaLlegadas'
import { ListaRechazados } from '@/features/tablero-llegadas/components/ListaRechazados'
import { ResumenDelDia } from '@/features/tablero-llegadas/components/ResumenDelDia'
import { useTablero } from '@/features/tablero-llegadas/components/useTablero'
import type { TableroLlegadas } from '@/features/tablero-llegadas/data/tableroLlegadas'
import {
  type ChipEstado,
  diaMasViejo,
  filtrarIntentos,
  filtrarLlegadas,
  horaMinutoLima,
  ordenarPorRecepcion,
  textoDia,
} from '@/features/tablero-llegadas/domain'
import { SinPermisoPage } from './SinPermisoPage'

export interface TableroLlegadasPageProps {
  sesion: Sesion
  tablero: TableroLlegadas
  onCerrarSesion: () => void
}

type Pestana = 'llegadas' | 'rechazados' | 'puntos'

/** El ancho de la vista: aprovecha la pantalla con un margen modesto a los lados, y no se estira en monitores enormes. */
const CONTENEDOR = 'mx-auto w-full max-w-[1280px] px-4 md:px-8'

const CAMPO =
  'min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/**
 * El tablero de llegadas por QR, en `/dashboard`: para el supervisor de Despacho y de Secado, el asistente de Despacho y el admin
 * (decidido el 2026-10-16), que **entran directo aquí y no ven Traslado**. **Solo lectura**: muestra **el orden de llegada y a qué distancia llegó cada conductor**, los códigos
 * rechazados y las reglas de cada punto, sin ninguna acción que modifique algo. Un día de Lima, por defecto hoy, y un punto o
 * todos. Los números salen del servicio; se piden al abrir y con «Actualizar» (sin renovación automática).
 */
export function TableroLlegadasPage({ sesion, tablero, onCerrarSesion }: TableroLlegadasPageProps) {
  const instantanea = useTablero(tablero, sesion.idUsuario)
  const [pestana, setPestana] = useState<Pestana>('llegadas')
  const [chip, setChip] = useState<ChipEstado>('todas')
  const [textoLlegadas, setTextoLlegadas] = useState('')
  const [masRecientesPrimero, setMasRecientesPrimero] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [textoRechazos, setTextoRechazos] = useState('')
  const [abierta, setAbierta] = useState<{ idLlegada: number; abre: HTMLElement | null } | null>(null)

  const { datos, dia, idPunto, hoy, actualizando } = instantanea
  const llegadas = useMemo(
    () => ordenarPorRecepcion(filtrarLlegadas(datos?.dia.llegadas ?? [], { chip, texto: textoLlegadas }), masRecientesPrimero),
    [datos, chip, textoLlegadas, masRecientesPrimero],
  )
  const intentos = useMemo(() => filtrarIntentos(datos?.intentos.intentos ?? [], { motivo, texto: textoRechazos }), [datos, motivo, textoRechazos])

  if (instantanea.sinPermiso) {
    return (
      <SinPermisoPage
        titulo="Sin permiso para ver las llegadas"
        mensaje={instantanea.sinPermiso.mensaje}
        explicacion="Tu usuario no tiene permiso para ver el tablero de llegadas por QR. Pide a SUM que lo revise."
        onCerrarSesion={onCerrarSesion}
      />
    )
  }

  const primeraCarga = instantanea.cargando && datos === null
  // Lo que se ve es de otro día o de otro punto que el elegido (la última petición falló): se dice.
  const desfasado = datos !== null && !actualizando && (datos.dia.dia !== dia || datos.dia.idPunto !== idPunto)
  const detalle = abierta && datos ? (datos.dia.llegadas.find((l) => l.idLlegada === abierta.idLlegada) ?? null) : null
  const fichaDelDetalle = detalle && datos ? (datos.puntos.puntos.find((p) => p.idPunto === detalle.punto.idPunto) ?? null) : null

  const irA = (nueva: Pestana, cambios: () => void = () => undefined) => {
    cambios()
    setAbierta(null)
    setPestana(nueva)
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-line bg-surface">
        <div className={cx(CONTENEDOR, 'flex items-center justify-between gap-4 py-2')}>
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            <img src={logoSum} alt="SUM Vehículos" width={200} height={200} className="-my-4 size-16 shrink-0 object-contain md:size-20" />
            <span aria-hidden="true" className="h-8 w-px shrink-0 bg-line-strong" />
            <span className="truncate text-base font-semibold text-primary-deep md:text-lg">Llegadas por QR</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 md:gap-4">
            <span className="hidden max-w-[260px] truncate text-sm font-medium text-ink-1 sm:block">{sesion.nombre ?? sesion.usuario}</span>
            <Button variante="secundario" tamano="compacto" onClick={onCerrarSesion}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>

      <main className={cx(CONTENEDOR, 'flex flex-col gap-5 pt-6 pb-12')}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary-deep md:text-[36px] md:leading-tight">Llegadas por QR</h1>
            <p className="mt-1 text-base text-ink-2">Quién llegó, en qué orden y a qué distancia. Solo lectura; las horas son de Lima.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span role="status" className="text-sm text-ink-2 tabular-nums">
              {instantanea.actualizadoEn !== null ? `Última actualización: ${horaMinutoLima(instantanea.actualizadoEn)}` : actualizando ? 'Actualizando…' : 'Sin actualizar'}
            </span>
            <Button variante="secundario" tamano="compacto" disabled={actualizando} onClick={() => void tablero.actualizar()}>
              <IconoActualizar className="mr-1.5 size-4" />
              {actualizando ? 'Actualizando…' : 'Actualizar'}
            </Button>
          </div>
        </div>

        <section aria-label="Filtros" className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="tablero-dia" className="text-[13px] font-semibold text-ink-2">
              Día
            </label>
            <div className="flex items-center gap-2">
              <input
                id="tablero-dia"
                type="date"
                value={dia}
                min={diaMasViejo(hoy)}
                max={hoy}
                onChange={(evento) => {
                  // Un campo vaciado a mano no es un día: se ignora y se sigue viendo el que había.
                  if (evento.target.value !== '') void tablero.elegirDia(evento.target.value)
                }}
                className={cx(CAMPO, 'tabular-nums')}
              />
              <Button variante="secundario" disabled={dia === hoy} onClick={() => void tablero.elegirDia(hoy)}>
                Hoy
              </Button>
            </div>
            <span className="text-[13px] text-ink-3">{textoDia(dia, hoy)} · como máximo 90 días atrás</span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tablero-punto" className="text-[13px] font-semibold text-ink-2">
              Punto
            </label>
            <select
              id="tablero-punto"
              value={idPunto === null ? 'todos' : String(idPunto)}
              onChange={(evento) => void tablero.elegirPunto(evento.target.value === 'todos' ? null : Number(evento.target.value))}
              className={cx(CAMPO, 'min-w-[220px]')}
            >
              <option value="todos">Todos los puntos</option>
              {(datos?.puntos.puntos ?? []).map((p) => (
                <option key={p.idPunto} value={p.idPunto}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="flex-1 basis-60 self-center text-[13px] text-ink-3">El punto cambia el resumen, las señales y las dos listas.</p>
        </section>

        <div className="flex flex-col gap-2">
          {instantanea.sinConexion && <Banner tono="warning">Sin conexión. Se muestra lo último recibido.</Banner>}
          {instantanea.error && (
            <Banner tono="danger">
              {instantanea.error}{' '}
              <button type="button" onClick={() => void tablero.actualizar()} className="font-bold underline">
                Reintentar
              </button>
            </Banner>
          )}
          {desfasado && datos && (
            <Banner tono="warning">
              Lo que se ve es del {textoDia(datos.dia.dia, hoy)}
              {datos.dia.idPunto !== idPunto ? ' y de otro punto' : ''}: no se pudo traer lo que elegiste.
            </Banner>
          )}
          {instantanea.descartadas > 0 && (
            <Banner tono="warning">
              {instantanea.descartadas === 1 ? 'Un dato no se pudo mostrar porque llegó inválido.' : `${instantanea.descartadas} datos no se pudieron mostrar porque llegaron inválidos.`}{' '}
              Avisa a soporte.
            </Banner>
          )}
        </div>

        {primeraCarga ? (
          <p role="status" className="py-6 text-ink-2">
            Cargando el tablero…
          </p>
        ) : datos === null ? (
          <p className="py-6 text-ink-3">Todavía no hay datos para mostrar.</p>
        ) : (
          <>
            <ResumenDelDia
              resumen={datos.dia.resumen}
              senales={datos.dia.senales}
              atenuado={actualizando}
              onVerConFlag={() => irA('llegadas', () => setChip('flag'))}
              onVerRechazados={() => irA('rechazados', () => setMotivo(null))}
              onVerVencidos={() => irA('rechazados', () => setMotivo('fuera_de_tope'))}
            />

            <section aria-label="Detalle del día" className="flex flex-col">
              <div role="group" aria-label="Vista" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line-strong px-1">
                {(
                  [
                    ['llegadas', 'Llegadas', datos.dia.resumen.total],
                    ['rechazados', 'Códigos rechazados', datos.dia.resumen.rechazados],
                    ['puntos', 'Puntos', datos.puntos.puntos.length],
                  ] as const
                ).map(([valor, nombre, cuenta]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={pestana === valor}
                    onClick={() => irA(valor)}
                    className={cx(
                      '-mb-px min-h-12 border-b-[3px] px-4 text-[15px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                      pestana === valor ? 'border-primary font-bold text-primary-deep' : 'border-transparent font-bold text-ink-2',
                    )}
                  >
                    {nombre} <span className="font-semibold text-ink-3 tabular-nums">({cuenta})</span>
                  </button>
                ))}
              </div>

              {pestana === 'llegadas' && (
                <ListaLlegadas
                  llegadas={llegadas}
                  chip={chip}
                  onChip={setChip}
                  texto={textoLlegadas}
                  onTexto={setTextoLlegadas}
                  masRecientesPrimero={masRecientesPrimero}
                  onOrden={() => setMasRecientesPrimero((v) => !v)}
                  truncado={datos.dia.truncado}
                  atenuado={actualizando}
                  onAbrir={(idLlegada, abre) => setAbierta({ idLlegada, abre })}
                />
              )}
              {pestana === 'rechazados' && (
                <ListaRechazados
                  intentos={intentos}
                  motivo={motivo}
                  onMotivo={setMotivo}
                  texto={textoRechazos}
                  onTexto={setTextoRechazos}
                  truncado={datos.intentos.truncado}
                  atenuado={actualizando}
                />
              )}
              {pestana === 'puntos' && <FichasPuntos puntos={datos.puntos.puntos} atenuado={actualizando} />}
            </section>
          </>
        )}
      </main>

      {detalle && abierta && (
        <PanelDetalle etiqueta="Detalle de la llegada" onCerrar={() => setAbierta(null)} devolverFoco={abierta.abre}>
          <DetalleLlegada llegada={detalle} punto={fichaDelDetalle} onCerrar={() => setAbierta(null)} />
        </PanelDetalle>
      )}
    </div>
  )
}
