import { useMemo, useState } from 'react'
import logoSum from '@/assets/sum-logo.png'
import type { Sesion } from '@/core/auth'
import { Banner, Button, cx } from '@/core/ui'
import { ConsultaMasiva } from '@/features/seguimiento/components/ConsultaMasiva'
import { DetalleTraslado } from '@/features/seguimiento/components/DetalleTraslado'
import { IconoActualizar, IconoBuscar, IconoFiltro, IconoFlecha } from '@/features/seguimiento/components/iconos'
import { ListaMovil, TablaTraslados } from '@/features/seguimiento/components/ListasDeTraslados'
import { PanelDetalle } from '@/features/seguimiento/components/PanelDetalle'
import { useConsultaVines } from '@/features/seguimiento/components/useConsultaVines'
import { useAhora, useListaSeguimiento } from '@/features/seguimiento/components/useListaSeguimiento'
import type { ListaSeguimiento } from '@/features/seguimiento/data/listaSeguimiento'
import { FILTROS_ETAPA, type FiltroEtapa, contarPorEtapa, destinosDe, esVisible, filtrarTraslados, horaDeLima } from '@/features/seguimiento/domain'
import { SinPermisoPage } from './SinPermisoPage'

export interface SeguimientoPageProps {
  sesion: Sesion
  lista: ListaSeguimiento
  onCerrarSesion: () => void
}

const CAMPO =
  'flex min-h-11 items-center gap-2.5 rounded-control border border-line-strong bg-surface px-3 text-ink-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary'

/** El ancho de la vista: aprovecha la pantalla con un margen modesto a los lados, y no se estira en monitores enormes. */
const CONTENEDOR = 'mx-auto w-full max-w-[1480px] px-4 md:px-8'

/**
 * La vista del coordinador: todos los traslados que genera la app de Traslado, con su etapa y los hitos registrados. **Sin
 * nada de GPS** (ni ubicación ni si lleva dispositivo). Solo lectura y sin filtro por destino (primera versión, decisión del 2026-10-15). Una tabla (lista en el
 * teléfono) a todo lo ancho; «Ver detalle» abre el detalle en un panel por encima (a pantalla completa en el teléfono), para que
 * se vea sin importar cuánto se haya bajado. Sin mapa y sin datos que la primera versión no muestra (PDI, órdenes anuladas).
 *
 * Además tiene la **consulta masiva de VIN**: se pega una lista y se ve el estado de cada uno, de cualquier fecha (solo en
 * tránsito o entregado; lo demás es «pendiente de información»). Es otra vista de la misma pantalla.
 */
export function SeguimientoPage({ sesion, lista, onCerrarSesion }: SeguimientoPageProps) {
  const instantanea = useListaSeguimiento(lista, sesion.idUsuario)
  const ahora = useAhora()
  const [etapa, setEtapa] = useState<FiltroEtapa>('todos')
  const [texto, setTexto] = useState('')
  const [destinoElegido, setDestinoElegido] = useState('todos')
  // De dónde se abrió el detalle: de la lista o del resultado de la consulta masiva (cada uno se busca en lo suyo).
  const [abierto, setAbierto] = useState<{ idOrden: number; abre: HTMLElement | null; origen: 'lista' | 'consulta' } | null>(null)
  const [vista, setVista] = useState<'lista' | 'consulta'>('lista')
  const [textoVines, setTextoVines] = useState('')
  const consulta = useConsultaVines(lista)

  // Lo anulado no se muestra: se descarta antes de todo lo demás (lista, destinos, conteos, «no hay traslados»).
  const traslados = useMemo(() => instantanea.traslados.filter(esVisible), [instantanea.traslados])
  const destinos = useMemo(() => destinosDe(traslados), [traslados])
  // Un destino que dejó de venir en la lista no puede seguir filtrando: se vería una lista vacía sin explicación.
  const destino = destinos.includes(destinoElegido) ? destinoElegido : 'todos'
  // Los conteos de las pestañas siguen al buscador y al destino, para que cada número sea lo que se vería al elegirla.
  const conteo = useMemo(() => contarPorEtapa(filtrarTraslados(traslados, { etapa: 'todos', texto, destino })), [traslados, texto, destino])
  const visibles = useMemo(() => filtrarTraslados(traslados, { etapa, texto, destino }), [traslados, etapa, texto, destino])

  if (instantanea.sinPermiso) {
    return (
      <SinPermisoPage
        titulo="Sin permiso para ver el seguimiento"
        mensaje={instantanea.sinPermiso.mensaje}
        explicacion="Tu usuario no tiene permiso para ver el seguimiento de los traslados. Pide a SUM que lo revise."
        onCerrarSesion={onCerrarSesion}
      />
    )
  }

  const hayTraslados = traslados.length > 0
  const primeraCarga = instantanea.cargando && instantanea.traslados.length === 0
  const hayFiltro = etapa !== 'todos' || texto.trim() !== '' || destino !== 'todos'
  // El detalle de un vehículo que el servidor ya no manda no se sigue mostrando (ni se muestra otro en su lugar).
  const trasladosConsultados = (consulta.estado.resultados ?? []).flatMap((r) => (r.informacion === 'disponible' ? [r.traslado] : []))
  const detalle = abierto ? ((abierto.origen === 'lista' ? traslados : trasladosConsultados).find((t) => t.idOrden === abierto.idOrden) ?? null) : null
  const ahoraComoFecha = new Date(ahora)

  const abrir = (idOrden: number, abre: HTMLElement) => setAbierto({ idOrden, abre, origen: 'lista' })
  const abrirConsultado = (idOrden: number, abre: HTMLElement) => setAbierto({ idOrden, abre, origen: 'consulta' })
  const enConsulta = vista === 'consulta'

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line">
        <div className={cx(CONTENEDOR, 'flex items-center justify-between gap-4 py-2')}>
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            {/* El PNG es cuadrado con aire blanco alrededor: el margen negativo recorta ese aire sin tocar la imagen. */}
            <img src={logoSum} alt="SUM Vehículos" width={200} height={200} className="-my-4 size-16 shrink-0 object-contain md:size-20" />
            <span aria-hidden="true" className="h-8 w-px shrink-0 bg-line-strong" />
            <span className="truncate text-base font-semibold text-primary-deep md:text-lg">Portal de destinos</span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden max-w-[260px] truncate text-sm font-medium text-ink-1 sm:block">{sesion.nombre ?? sesion.usuario}</span>
            <Button variante="secundario" tamano="compacto" onClick={onCerrarSesion}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>

      <main className={cx(CONTENEDOR, 'pb-10')}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary-deep md:text-[40px] md:leading-tight">{enConsulta ? 'Consulta masiva de VIN' : 'Mis vehículos'}</h1>
            <p className="mt-1 text-base text-ink-2 md:text-lg">{enConsulta ? 'Revisa el estado de varios vehículos a la vez.' : 'Consulta el avance de los traslados.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!enConsulta && (
              <>
                <span role="status" className="text-sm text-ink-2 tabular-nums">
                  {instantanea.actualizadoEn !== null
                    ? `Última actualización: ${horaDeLima(instantanea.actualizadoEn)}`
                    : instantanea.actualizando
                      ? 'Actualizando…'
                      : 'Sin actualizar'}
                </span>
                <Button variante="secundario" tamano="compacto" disabled={instantanea.actualizando} onClick={() => void lista.actualizar()}>
                  <IconoActualizar className="mr-1.5 size-4" />
                  {instantanea.actualizando ? 'Actualizando…' : 'Actualizar'}
                </Button>
              </>
            )}
            <Button
              variante={enConsulta ? 'secundario' : 'primario'}
              tamano="compacto"
              onClick={() => {
                setAbierto(null)
                setVista(enConsulta ? 'lista' : 'consulta')
              }}
            >
              {enConsulta ? 'Volver a mis vehículos' : 'Consulta masiva de VIN'}
            </Button>
          </div>
        </div>

        {enConsulta && (
          <ConsultaMasiva
            texto={textoVines}
            onTexto={setTextoVines}
            estado={consulta.estado}
            onConsultar={(vines) => void consulta.consultar(vines)}
            onLimpiar={() => {
              setTextoVines('')
              setAbierto(null)
              consulta.limpiar()
            }}
            ahora={ahoraComoFecha}
            onAbrir={abrirConsultado}
          />
        )}

        <div className={cx('mt-5 flex flex-col gap-2', enConsulta && 'hidden')}>
          {instantanea.sinConexion && <Banner tono="warning">Sin conexión. Se muestra lo último recibido.</Banner>}
          {instantanea.error && <Banner tono="danger">{instantanea.error}</Banner>}
          {instantanea.descartados > 0 && (
            <Banner tono="warning">
              {instantanea.descartados === 1
                ? 'Un traslado no se pudo mostrar porque llegó con datos inválidos.'
                : `${instantanea.descartados} traslados no se pudieron mostrar porque llegaron con datos inválidos.`}{' '}
              Avisa a soporte.
            </Banner>
          )}
        </div>

        {enConsulta ? null : primeraCarga ? (
          <p role="status" className="mt-6 text-ink-2">
            Cargando los traslados…
          </p>
        ) : (
          <>
            <div className="mt-5 flex flex-col gap-2.5 md:flex-row md:gap-4">
              <label className={cx(CAMPO, 'md:flex-1')}>
                <span className="sr-only">Buscar vehículo</span>
                <IconoBuscar className="size-[18px] shrink-0" />
                <input
                  type="search"
                  value={texto}
                  onChange={(evento) => setTexto(evento.target.value)}
                  placeholder="Buscar por VIN o vehículo..."
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-base text-ink-1 outline-none placeholder:text-ink-3"
                />
              </label>
              {destinos.length > 1 && (
                <label className={cx(CAMPO, 'relative md:w-[360px]')}>
                  <span className="sr-only">Destino</span>
                  <IconoFiltro className="size-[18px] shrink-0" />
                  <select
                    value={destino}
                    onChange={(evento) => setDestinoElegido(evento.target.value)}
                    className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-base text-ink-1 outline-none"
                  >
                    <option value="todos">Todos los destinos</option>
                    {destinos.map((nombre) => (
                      <option key={nombre} value={nombre}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                  <IconoFlecha className="pointer-events-none absolute right-3 size-4" />
                </label>
              )}
            </div>

            <div role="group" aria-label="Filtrar por etapa" className="-mx-1 mt-5 flex gap-1 overflow-x-auto border-b border-line px-1">
              {FILTROS_ETAPA.map((filtro) => (
                <button
                  key={filtro.valor}
                  type="button"
                  aria-pressed={etapa === filtro.valor}
                  onClick={() => setEtapa(filtro.valor)}
                  className={cx(
                    '-mb-px min-h-11 border-b-2 px-3 text-[15px] md:px-4 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                    etapa === filtro.valor ? 'border-primary font-bold text-primary' : 'border-transparent text-ink-2',
                  )}
                >
                  {filtro.etiqueta} ({conteo[filtro.valor]})
                </button>
              ))}
            </div>

            {visibles.length === 0 ? (
              <p className="py-8 text-center text-ink-3">
                {hayTraslados && hayFiltro ? 'Ningún vehículo coincide con lo que buscas.' : 'Todavía no hay traslados para mostrar.'}
              </p>
            ) : (
              <>
                <TablaTraslados traslados={visibles} ahora={ahoraComoFecha} onAbrir={abrir} />
                <ListaMovil traslados={visibles} ahora={ahoraComoFecha} onAbrir={abrir} />
              </>
            )}
          </>
        )}
      </main>

      {detalle && abierto && (
        <PanelDetalle onCerrar={() => setAbierto(null)} devolverFoco={abierto.abre}>
          <DetalleTraslado traslado={detalle} ahora={ahoraComoFecha} onCerrar={() => setAbierto(null)} />
        </PanelDetalle>
      )}
    </div>
  )
}
