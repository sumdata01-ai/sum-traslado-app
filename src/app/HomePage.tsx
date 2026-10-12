import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Sesion } from '@/core/auth'
import { Banner, Button, ProgressCounter, SectionHeader, TextField, type TonoBanner } from '@/core/ui'
import type { ConfirmacionTraslado } from '@/features/traslado/data/confirmacionTraslado'
import type { FotoStorePort } from '@/features/traslado/data/fotoStorePort'
import type { SubidaFotos } from '@/features/traslado/data/subidaFotos'
import type { Momento } from '@/features/traslado/domain'
import { BuscarEnElSistema } from '@/features/traslado/components/BuscarEnElSistema'
import { TarjetaOrden, type TarjetaOrdenProps } from '@/features/traslado/components/TarjetaOrden'
import { useCatalogoTraslado } from '@/features/traslado/components/useCatalogoTraslado'
import { useListaOrdenes } from '@/features/traslado/components/useListaOrdenes'
import type { CatalogoTraslado } from '@/features/traslado/data/catalogoTraslado'
import type { IdentificadorVin, OrdenEncontrada } from '@/features/traslado/data/identificadorVin'
import type { ListaOrdenes, ResultadoAccion, VistaOrden } from '@/features/traslado/data/listaOrdenes'
import { filtrarPorVin, normalizarFiltro, valeMostrarAvance } from '@/features/traslado/domain'
import { CapturaPage } from './CapturaPage'
import { HerramientasDePrueba } from './HerramientasDePrueba'
import { SinPermisoPage } from './SinPermisoPage'

export interface HomePageProps {
  sesion: Sesion
  lista: ListaOrdenes
  /** Las placas y proveedores para elegir en la salida (O-04). */
  catalogo: CatalogoTraslado
  /** Busca en el sistema un VIN que no está en la lista del teléfono (O-03). */
  identificador: IdentificadorVin
  /** Las fotos y su subida (E4-01). Sin esto la home no ofrece fotografiar. */
  fotos?: { store: FotoStorePort; subidas: SubidaFotos; confirmacion: ConfirmacionTraslado }
  onCerrarSesion: () => void
}

/**
 * La home de Traslado: las órdenes del operario («Mis traslados») y las del pool del día
 * («Disponibles hoy»), dos secciones que no se fusionan. Primero se ve lo guardado en el teléfono y
 * después lo que trae el servidor; sin conexión se sigue viendo lo guardado. Desde aquí se toma una
 * orden del pool («Comenzar despacho») y se suelta una propia (O-02). Si el filtro no encuentra un VIN
 * en el teléfono, se puede buscar en el sistema (O-03).
 */
export function HomePage({ sesion, lista, catalogo, identificador, fotos, onCerrarSesion }: HomePageProps) {
  const instantanea = useListaOrdenes(lista, sesion.idUsuario)
  const opciones = useCatalogoTraslado(catalogo)
  const [filtro, setFiltro] = useState('')
  const [mensaje, setMensaje] = useState<{ tono: TonoBanner; texto: string } | null>(null)
  const [ocupadas, setOcupadas] = useState<ReadonlySet<number>>(new Set())
  const busqueda = useSyncExternalStore(identificador.suscribir, identificador.getSnapshot)
  const [capturando, setCapturando] = useState<{ idOrden: number; vin: string; momento: Momento } | null>(null)

  // Lo que se buscó en el sistema vale para el texto que se escribió: si el filtro cambia, o se sale de la
  // pantalla, el resultado (y lo que esté por llegar) ya no corresponde.
  useEffect(() => {
    identificador.cancelar()
    return () => identificador.cancelar()
  }, [filtro, identificador])

  if (fotos && capturando) {
    return (
      <CapturaPage
        ordenId={capturando.idOrden}
        vin={capturando.vin}
        momento={capturando.momento}
        store={fotos.store}
        subidas={fotos.subidas}
        confirmacion={fotos.confirmacion}
        onVolver={(resultado) => {
          setCapturando(null)
          // Confirmada: en verde. Descartada por el supervisor: no es un error del operario, pero tampoco una buena noticia.
          setMensaje(resultado ? { tono: resultado.tipo === 'confirmada' ? 'success' : 'warning', texto: resultado.mensaje } : null)
          void lista.recalcular() // los contadores de la tarjeta cuentan las fotos de la pantalla que se cierra
        }}
      />
    )
  }

  if (instantanea.sinPermiso) return <SinPermisoPage mensaje={instantanea.sinPermiso.mensaje} onCerrarSesion={onCerrarSesion} />

  const { mias, pool, avance } = instantanea
  const hayOrdenes = mias.length + pool.length > 0
  const primeraCarga = (instantanea.cargando || instantanea.actualizando) && !hayOrdenes
  const hayFiltro = normalizarFiltro(filtro) !== ''
  // El filtro trabaja sobre lo ya cargado: no consulta al servidor, así funciona sin red.
  const misFiltradas = filtrarVistas(mias, filtro)
  const poolFiltrado = filtrarVistas(pool, filtro)

  async function conOrdenOcupada(idOrden: number, accion: () => Promise<ResultadoAccion>): Promise<ResultadoAccion | null> {
    setOcupadas((actual) => new Set(actual).add(idOrden))
    try {
      const resultado = await accion()
      setMensaje({ tono: !resultado.ok ? 'danger' : resultado.pendiente ? 'warning' : 'success', texto: resultado.mensaje })
      return resultado
    } finally {
      setOcupadas((actual) => {
        const siguiente = new Set(actual)
        siguiente.delete(idOrden)
        return siguiente
      })
    }
  }

  async function elegir(vista: VistaOrden, cambio: Parameters<ListaOrdenes['elegir']>[1]) {
    const resultado = await lista.elegir(vista.orden.idOrden, cambio)
    if (!resultado.ok) setMensaje({ tono: 'danger', texto: resultado.mensaje })
  }

  /** Una orden del pool hallada buscando por VIN: se toma igual, aunque el teléfono no la tuviera. */
  async function tomarHallada({ orden }: OrdenEncontrada) {
    const resultado = await conOrdenOcupada(orden.idOrden, () => lista.tomar(orden.idOrden, orden))
    if (resultado?.ok) identificador.cancelar() // ya está en «Mis traslados»: el resultado de la búsqueda sobra
  }

  const mostrarEnLaLista = (vin: string) => {
    setFiltro(vin)
    void lista.actualizar() // por si la lista del teléfono estaba atrasada
  }

  const comenzar = (vista: VistaOrden) => conOrdenOcupada(vista.orden.idOrden, () => lista.tomar(vista.orden.idOrden))

  function soltar(vista: VistaOrden) {
    // Soltar con fotos las borra (O-02 AC6): se pregunta antes, con cuántas son.
    if (vista.fotosTomadas > 0) {
      const fotos = vista.fotosTomadas === 1 ? '1 foto' : `${vista.fotosTomadas} fotos`
      const seguro = window.confirm(
        `Ya tomaste ${fotos} de este auto. Si sueltas la orden, se borran de este teléfono y queda disponible para otra persona. ¿Soltarla igual?`,
      )
      if (!seguro) return
    }
    void conOrdenOcupada(vista.orden.idOrden, () => lista.soltar(vista.orden.idOrden))
  }

  const accionesDeLoPropio = (vista: VistaOrden): AccionesDeTarjeta => ({
    ocupada: ocupadas.has(vista.orden.idOrden),
    seleccion: {
      placas: opciones.placas,
      proveedores: opciones.proveedores,
      nuncaDescargado: opciones.nuncaDescargado && !opciones.cargando,
      onElegirPlaca: (placa) => void elegir(vista, { placa }),
      onElegirProveedor: (proveedor) => void elegir(vista, { proveedor }),
    },
    onSoltar: vista.puedeSoltarse ? () => soltar(vista) : undefined,
    onFotografiar:
      fotos && vista.momento && vista.puedeCapturar && vista.orden.tomaSync !== 'perdida'
        ? () => setCapturando({ idOrden: vista.orden.idOrden, vin: vista.orden.vin, momento: vista.momento! })
        : undefined,
  })
  const accionesDelPool = (vista: VistaOrden): AccionesDeTarjeta => ({
    ocupada: ocupadas.has(vista.orden.idOrden),
    onComenzar: () => void comenzar(vista),
  })

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-ink-2">Hola, {sesion.nombre ?? sesion.usuario}</p>
        <Button variante="secundario" tamano="compacto" onClick={onCerrarSesion}>
          Cerrar sesión
        </Button>
      </header>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold">Traslado</h1>
        <Button variante="secundario" tamano="compacto" disabled={instantanea.actualizando} onClick={() => void lista.actualizar()}>
          {instantanea.actualizando ? 'Actualizando…' : 'Actualizar'}
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        {mensaje && <Banner tono={mensaje.tono}>{mensaje.texto}</Banner>}
        {instantanea.sinConexion && <Banner tono="warning">Sin conexión. Se muestra lo último guardado en este teléfono.</Banner>}
        {instantanea.error && <Banner tono="danger">{instantanea.error}</Banner>}
        {opciones.error && !instantanea.error && <Banner tono="warning">{opciones.error.replace(/\.$/, '')}. Se usan las placas y proveedores guardados.</Banner>}
        {instantanea.descartadas > 0 && (
          <Banner tono="warning">
            {instantanea.descartadas === 1
              ? 'Un traslado no se pudo mostrar porque llegó con datos inválidos.'
              : `${instantanea.descartadas} traslados no se pudieron mostrar porque llegaron con datos inválidos.`}{' '}
            Avisa a soporte.
          </Banner>
        )}
      </div>

      {valeMostrarAvance(avance) && (
        <div className="mb-4">
          <ProgressCounter {...avance} />
        </div>
      )}

      {primeraCarga ? (
        <p role="status" className="text-ink-2">
          Cargando tus traslados…
        </p>
      ) : (
        <>
          <div className="mb-4">
            <TextField
              etiqueta="Filtrar por VIN"
              type="search"
              value={filtro}
              onChange={(evento) => setFiltro(evento.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {hayFiltro && misFiltradas.length === 0 && poolFiltrado.length === 0 && (
            <BuscarEnElSistema
              texto={filtro}
              resultado={busqueda.resultado}
              onBuscar={() => void identificador.buscar(filtro, sesion.idUsuario)}
              onElegirCandidato={(vin) => void identificador.identificar(vin, sesion.idUsuario)}
              onTomar={(encontrada) => void tomarHallada(encontrada)}
              onMostrar={mostrarEnLaLista}
              ocupadas={ocupadas}
            />
          )}

          <Seccion titulo="Mis traslados" vistas={misFiltradas} acciones={accionesDeLoPropio} vacio={textoVacio(hayFiltro, filtro, 'Todavía no tienes traslados asignados.')} />
          <Seccion titulo="Disponibles hoy" vistas={poolFiltrado} acciones={accionesDelPool} vacio={textoVacio(hayFiltro, filtro, 'No hay traslados disponibles hoy.')} />
        </>
      )}

      <HerramientasDePrueba />
    </main>
  )
}

function filtrarVistas(vistas: readonly VistaOrden[], filtro: string): VistaOrden[] {
  return filtrarPorVin(
    vistas.map((vista) => ({ vin: vista.orden.vin, vista })),
    filtro,
  ).map((elemento) => elemento.vista)
}

const textoVacio = (hayFiltro: boolean, filtro: string, sinFiltro: string) =>
  hayFiltro ? `Ningún traslado coincide con «${filtro.trim()}».` : sinFiltro

type AccionesDeTarjeta = Omit<TarjetaOrdenProps, 'vista'>

function Seccion({
  titulo,
  vistas,
  vacio,
  acciones,
}: {
  titulo: string
  vistas: readonly VistaOrden[]
  vacio: string
  acciones: (vista: VistaOrden) => AccionesDeTarjeta
}) {
  return (
    <section className="mb-6">
      <SectionHeader contador={vistas.length} className="mb-2">
        {titulo}
      </SectionHeader>
      {vistas.length === 0 ? (
        <p className="text-sm text-ink-3">{vacio}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vistas.map((vista) => (
            <li key={vista.orden.idOrden}>
              <TarjetaOrden vista={vista} {...acciones(vista)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
