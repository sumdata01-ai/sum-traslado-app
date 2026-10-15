# Estructura de `src/`

Última actualización: 2026-10-15 | Fuente: git ls-files src, eslint.config.js | Estado: vigente

```
src/
  main.tsx                    arranque: monta <App> con las piezas de composicion.ts
  index.css                   Tailwind 4 y tokens de color (única fuente de verdad)
  app/                        pantallas raíz y composición
  core/
    auth/                     sesión: AuthPort, AuthCookie, canal entre pestañas, identidad del token
    config/                   URL base del API (relativa)
    http/                     cliente HTTP y ApiError
    storage/                  persistencia del navegador (storage.persist y espacio libre)
    ui/                       componentes base y utilidad cx
  features/traslado/
    domain/                   reglas puras (zonas, estados, VIN, confirmación, mezcla de caché…)
    api/                      TrasladoApi, StorageApi, subida a GCS y esquemas zod
    data/                     controladores (stores externos), puertos y Dexie
    camera/                   sesión de cámara, captura, galería y escáner
    components/               componentes de la funcionalidad y sus hooks
  features/seguimiento/       vista del rol coordinador (solo lectura, solo en memoria)
    domain/                   etapas, hitos, fechas en hora de Lima, filtros y orden (sin nada de GPS)
    api/                      SeguimientoApi y esquemas zod
    data/                     ListaSeguimiento (store externo, sin Dexie)
    components/               tabla, lista del teléfono, detalle, línea de tiempo y hooks
  test/                       setup de Vitest y utilidades
```

## Qué hay en cada carpeta

| Carpeta | Contenido principal |
|---|---|
| `app/` | `App`, `AppShell` (decide la pantalla por la sesión), `HomePage`, `SeguimientoPage`, `CapturaPage`, `LoginPage`, `SinAccesoPage`, `SinConexionPage`, `SinPermisoPage`, `HerramientasDePrueba` y `PruebaCamara` (ocultas), `composicion.ts`. |
| `core/auth/` | `AuthCookie` (login, refresh, logout), `canalSesion` (BroadcastChannel), `identidadToken`, `useSesion`. |
| `core/http/` | `apiClient` (401 → renovar y reintentar una vez, política de 403, tiempo límite) y `ApiError`. |
| `features/traslado/domain/` | `zonas`, `estadoFoto`, `estadoOrden`, `presentacionOrden`, `vin`, `confirmacion`, `tomas`, `elecciones`, `catalogo`, `mezclaCache`, `avance`, `formulario`, `orden`. |
| `features/traslado/api/` | `trasladoApi` (órdenes, catálogos, VIN, tomar, soltar, confirmar), `storageApi` (URL firmada), `subidaGcs` (PUT), `schemas`. |
| `features/traslado/data/` | `listaOrdenes`, `catalogoTraslado`, `identificadorVin`, `formularioCaptura`, `subidaFotos`, `confirmacionTraslado`, almacenes (`fotoStoreDexie`, `tomasStore`, `eleccionesStore`, `ordenesCache`, `catalogoCache`), `trasladoDb`. |
| `features/seguimiento/domain/` | `traslado` (tipos y pestañas), `presentacion` (`estadoGps`, `bloqueGps`, `hitosDe`, `formatoFecha`, `horaDeLima`, `filtrarTraslados`, `contarPorEtapa`, `esVisible`, `claveMarca`, `logoDeMarca`…) y `consulta` (`leerVines`, `resumirConsulta`, `ResultadoVin`). |
| `features/seguimiento/api/` | `seguimientoApi` (`GET /api/seguimiento/traslados`, con su política de 403) y `schemas` (zod: deja pasar solo lo que la pantalla usa). |
| `features/seguimiento/data/` | `listaSeguimiento` (store externo en memoria, una petición a la vez, vacía al cambiar de persona) y `testing/fakes`. |
| `features/seguimiento/components/` | `TablaTraslados`, `ListaMovil`, `DetalleTraslado`, `PanelDetalle` (diálogo modal), `ConsultaMasiva` y `useConsultaVines`, `piezas` (etiqueta, logo de marca, datos del vehículo, línea de seguimiento, bloque de GPS, línea de tiempo), `iconos` y los hooks `useListaSeguimiento` y `useAhora`. |
| `features/traslado/camera/` | `cameraSession`, `estadoCamara`, `captureFrame`, `fotoDeArchivo`, `escaneo`, `CameraWidget`, `capabilities`, `errors`. |
| `features/traslado/components/` | `TarjetaOrden`, `SelectorCatalogo`, `BuscarEnElSistema`, `FormularioCaptura`, `FichaZona`, `ContadorFotos`, `ConfirmarDespacho`, `EscanerVin` y los hooks `use*`. |

Las carpetas `testing/` (dentro de `core/auth`, `camera` y `data`) tienen dobles de prueba; solo las importan las pruebas.

## Reglas de dependencia

- `domain/` no importa nada de las demás capas ni del navegador (`eslint.config.js`).
- Las pruebas de `domain/` suelen declarar el entorno `node` de Vitest (`// @vitest-environment node`).
- La prueba [`src/test/lint-boundaries.test.ts`](../../src/test/lint-boundaries.test.ts) comprueba que la regla de ESLint realmente falla.
