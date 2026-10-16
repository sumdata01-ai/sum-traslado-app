/**
 * Dónde se conectan las piezas reales: el cliente HTTP y la autenticación se necesitan entre sí
 * (el cliente pide el token y renueva la sesión; la autenticación hace sus peticiones por el
 * cliente). Cada una recibe a la otra como función, así que el orden de creación no importa.
 *
 * Las pruebas no importan este módulo: arman sus propias piezas con dobles.
 */
import { AuthCookie, canalDelNavegador } from '@/core/auth'
import { createApiClient } from '@/core/http'
import { crearLlegadaApi } from '@/features/llegada/api/llegadaApi'
import { crearSeguimientoApi } from '@/features/seguimiento/api/seguimientoApi'
import { ListaSeguimiento } from '@/features/seguimiento/data/listaSeguimiento'
import { crearTableroApi } from '@/features/tablero-llegadas/api/tableroApi'
import { TableroLlegadas } from '@/features/tablero-llegadas/data/tableroLlegadas'
import { crearStorageApi } from '@/features/traslado/api/storageApi'
import { crearTrasladoApi } from '@/features/traslado/api/trasladoApi'
import { ConfirmacionTraslado } from '@/features/traslado/data/confirmacionTraslado'
import { ConteoFotosDexie } from '@/features/traslado/data/conteoFotos'
import { CatalogoCacheDexie } from '@/features/traslado/data/catalogoCache'
import { CatalogoTraslado } from '@/features/traslado/data/catalogoTraslado'
import { DuenoEnAlmacen } from '@/features/traslado/data/duenoCache'
import { EleccionesDexie } from '@/features/traslado/data/eleccionesStore'
import { FotoStoreDexie } from '@/features/traslado/data/fotoStoreDexie'
import { IdentificadorVin } from '@/features/traslado/data/identificadorVin'
import { ListaOrdenes } from '@/features/traslado/data/listaOrdenes'
import { MarcaEnAlmacen } from '@/features/traslado/data/marcaLimpieza'
import { OrdenesCacheDexie } from '@/features/traslado/data/ordenesCache'
import { SubidaFotos } from '@/features/traslado/data/subidaFotos'
import { TomasDexie } from '@/features/traslado/data/tomasStore'
import { TrasladoDb } from '@/features/traslado/data/trasladoDb'

export const auth: AuthCookie = new AuthCookie({
  solicitar: (path, init) => api.request(path, init),
  canal: canalDelNavegador(), // A-03: una sola sesión en todas las pestañas
})

export const api = createApiClient({
  getToken: () => auth.getToken(),
  refreshSession: () => auth.refrescarSesion(),
  limpiarSesion: () => auth.limpiarSesion(),
})

const db = new TrasladoDb()
const trasladoApi = crearTrasladoApi(api)

export const lista = new ListaOrdenes({
  api: trasladoApi,
  cache: new OrdenesCacheDexie(db),
  fotos: new ConteoFotosDexie(db),
  marca: new MarcaEnAlmacen(), // sobrevive a una recarga: un borrado fallido se reintenta al volver
  dueno: new DuenoEnAlmacen(), // A-03: lo guardado de otra persona no se muestra
  tomas: new TomasDexie(db), // O-02: las tomas de este navegador, con su dueño
  elecciones: new EleccionesDexie(db), // O-04: la placa y el proveedor elegidos, con su dueño
})

/** O-04: placas y proveedores para el selector; no son de una persona, no se borran al cerrar sesión. */
export const catalogo = new CatalogoTraslado({ api: trasladoApi, cache: new CatalogoCacheDexie(db) })

/** O-03: búsqueda de un VIN en el sistema; es solo lectura y no guarda nada. */
export const identificador = new IdentificadorVin({ api: trasladoApi })

/** Vista del coordinador: los traslados que genera Traslado, solo lectura y solo en memoria (sin Dexie). */
export const seguimiento = new ListaSeguimiento({ api: crearSeguimientoApi(api) })

/** Marcación de llegada por QR (lado del conductor): solo con internet, no guarda nada en el teléfono. */
export const llegada = { api: crearLlegadaApi(api) }

/** Tablero de llegadas por QR (`/dashboard`): solo lectura y solo en memoria (sin Dexie). */
export const tablero = new TableroLlegadas({ api: crearTableroApi(api) })

/** E4-01: las fotos tomadas (en este teléfono) y su subida a GCS: cada una se sube al tomarla. */
export const fotos = (() => {
  const store = new FotoStoreDexie(db)
  return {
    store,
    subidas: new SubidaFotos({ store, storage: crearStorageApi(api) }),
    confirmacion: new ConfirmacionTraslado({ api: trasladoApi, store, lista }), // E4-02
  }
})()
