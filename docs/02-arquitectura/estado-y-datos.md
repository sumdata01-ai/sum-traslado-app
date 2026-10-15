# Estado y datos

Última actualización: 2026-10-15 | Fuente: src/features/traslado/data/, src/features/traslado/api/, src/features/seguimiento/, src/core/http/ | Estado: vigente

## Patrón de estado: stores externos

No hay librería de estado. Cada controlador de `data/` es una clase que expone `getSnapshot()` (inmutable, cambia de identidad solo cuando cambia algo) y `suscribir(escucha)`. Los componentes lo leen con `useSyncExternalStore` mediante un hook `use*` (`useListaOrdenes`, `useCatalogoTraslado`, `useFormularioCaptura`, `useCameraSession`).

| Controlador | Responsabilidad |
|---|---|
| `ListaOrdenes` | `mis-ordenes`, caché, tomar, soltar, elegir placa y proveedor, tomas pendientes, `alConfirmar`. |
| `CatalogoTraslado` | Placas y proveedores para el selector, con caché. |
| `IdentificadorVin` | Búsqueda por VIN parcial y exacto; solo lectura. |
| `FormularioCaptura` | Las fotos de un momento de una orden y su estado de subida. |
| `SubidaFotos` | Sube cada foto a GCS, de una en una por foto. |
| `ConfirmacionTraslado` | «Confirmar salida» y «Confirmar entrega». |
| `ListaSeguimiento` | La lista del coordinador (`features/seguimiento`): **solo en memoria, sin Dexie**. Una petición a la vez, no vacía lo mostrado ante un fallo, un 403 vacía y muestra «sin permiso», y se vacía al cerrar sesión o si entra otra persona (`iniciar(idUsuario)`). Hook `useListaSeguimiento`: pide la lista **una sola vez al abrir** y no vuelve a pedir nada por su cuenta (ni por tiempo, ni al volver a la pestaña, ni al volver la red); solo el botón «Actualizar». |

## Datos locales (Dexie, base `sum-traslado`, versión 5)

| Tabla | Clave | Contenido |
|---|---|---|
| `fotos` | `clientId`, único `[ordenId+momento+zona]` | Fotos aceptadas con su Blob, estado y `storageKey`. |
| `enEscritura` | `clientId` | Fotos en tránsito (`writing` o `failed_local`). |
| `ordenes` | `idOrden` | Caché de la última respuesta de `mis-ordenes`. |
| `tomas` | `clave`, `dueno` | Tomas del pool hechas en este navegador, con su dueño. |
| `catalogos` | `clave`, `tipo` | Placas y proveedores (no son de nadie: no se vacían al salir). |
| `elecciones` | `clave`, `dueno` | Placa y proveedor elegidos por orden, con su dueño. |

- **Dueño de los datos:** tomas, elecciones y caché de órdenes se guardan por id de usuario; lo guardado de otra persona no se muestra.
- **Dexie no garantiza el orden de las escrituras** (medido): la caché de órdenes las serializa con una cola.
- Cada almacén es un **puerto** (`FotoStorePort`, `OrdenesCachePort`, `TomasPort`…) con una implementación Dexie y otra en memoria para las pruebas.

## Cliente HTTP y API

- `createApiClient({ getToken, refreshSession, limpiarSesion })` agrega el token, renueva ante un 401 (una sola renovación a la vez) y traduce los fallos a `ApiError` (`isNetwork`, `status`, `message`).
- Las respuestas se **validan con zod** (`api/schemas.ts`). Un cuerpo que no cumple el contrato es un error 502, no un éxito; una orden mala se descarta y se cuenta, sin vaciar la lista.
- `crearTrasladoApi(cliente)` pasa siempre la política de 403 de Traslado (`OPCIONES_TRASLADO`); una prueba de guarda lo comprueba para cada función de esa API.

- `crearSeguimientoApi(cliente)` (`GET /api/seguimiento/traslados`) también pasa `cerrarSesionEn403: false` (`OPCIONES_SEGUIMIENTO`, con su prueba de guarda). **Ese endpoint todavía no existe en el backend**: el contrato es el de [pedido-backend-seguimiento-coordinador.md](../07-planificacion/pedido-backend-seguimiento-coordinador.md) y solo se probó contra servidores falsos. Esta web solo reenvía `/api` y `/mobile`: por eso el prefijo no es `/v1`.

## Qué se sabe del lado del servidor

- `/vin/{vin}` y `buscar` solo ven órdenes `pendiente`: una orden en tránsito, entregada o cancelada no aparece. La página ya sabe leer un campo opcional `otras_ordenes` para avisarlo ([pedido al backend](../07-planificacion/pedido-backend-vin-otras-ordenes.md)).
- `mis-ordenes` devuelve las propias más el pool del día (`fecha_despacho`); `buscar` tiene el mismo alcance; `vin/{vin}` encuentra órdenes pendientes de cualquier conductor.
- `tomar` es atómico (409 con el nombre de quien se adelantó); `soltar` solo funciona sobre una orden propia y `pendiente`.
- `confirmar-*` es idempotente para el mismo conductor y el ejecutor sale del JWT. Ver [subida-y-confirmacion.md](subida-y-confirmacion.md).
