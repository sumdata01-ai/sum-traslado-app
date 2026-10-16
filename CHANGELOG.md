# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto aún no tiene versiones publicadas (`package.json` está en `0.0.0`): todo lo hecho está en **Unreleased**.

## [Unreleased]

### Added
- Cámara dentro de la página con sesión de estados, captura de un frame JPEG verificado y formulario por zonas (6 en la salida, 5 en la entrega).
- Guardado de fotos en IndexedDB con verificación de lectura, y recuperación de lo que quedó a medias.
- Login con cookie de refresh, una sola sesión entre pestañas y pantallas de acceso, sin conexión y sin permiso.
- Home con «Mis traslados» y «Disponibles hoy», filtro por VIN, tomar y soltar órdenes, y avance.
- Selector de placa y proveedor con lápiz para corregir.
- Identificación de un VIN en el sistema (búsqueda parcial y exacta).
- Subida de cada foto a GCS al tomarla, con «Reintentar» por foto.
- «Confirmar salida» y «Confirmar entrega».
- Foto de la galería (T12), con orientación corregida y recodificada como JPEG.
- Escáner de VIN por QR y código de barras (O-05), con la librería cargada bajo demanda.
- Búsqueda por VIN: aviso «Orden ya tomada / ya entregada / cancelada» cuando el servidor mande las órdenes del VIN que ya no están pendientes (`otras_ordenes`); sin ese campo todo sigue igual.
- Vista de seguimiento para el rol `coordinador` (`SeguimientoPage`, `features/seguimiento`): todos los traslados, solo lectura y en memoria, con buscador, destino, pestañas, tabla en escritorio, lista en el teléfono y detalle con hitos, **sin nada de GPS**, sin mapa y sin PDI. Con logos de marca locales (`src/assets/marcas/`). Entra **por rol**, sin mirar `allowed_apps`. **El backend ya tiene el rol y los endpoints** (`sum-bck-modulos`, merge `65afcac`); falta crear la cuenta `coordinador` en producción; se probó con servidores falsos y con el backend en la base local ([pedido](docs/07-planificacion/pedido-backend-seguimiento-coordinador.md)).
- **Consulta masiva de VIN** en la vista del coordinador: se pega una lista (hasta 200), se lee antes de consultar (repetidos, no-VIN, exceso) y cada VIN sale con su estado si está en tránsito o entregado (de cualquier fecha) o como «Pendiente de información» si no. Usa `POST /api/seguimiento/consulta-vines`.
- **Filtro por fecha** en la vista del coordinador: abre en **«Hoy»** (día de Lima; en camino y entregado) y el botón «Fecha» ofrece «Hoy», «Ayer», «Últimos 7 días», «Últimos 30 días» y un rango propio (hasta 90 días); el rango se pide al servidor (`GET /api/seguimiento/traslados?desde&hasta`) **solo al pulsar «Aplicar»**. Un traslado cuenta para un día si ese día se registró su salida o su entrega. Necesita el backend nuevo (rama `feat/seguimiento-filtro-fecha` de `sum-bck-modulos`, **sin mezclar ni desplegar**). Ver el [ADR 0014](docs/06-decisiones/0014-filtro-por-fecha-del-coordinador-rango-al-servidor-y-abre-en-hoy.md).
- Logo de KYC (`src/assets/marcas/kyc.svg`) en la vista del coordinador.
- **Esqueletos de carga** en la vista del coordinador (`EsqueletoTraslados`): mientras llega la lista (primera carga o cambio de fecha) y el primer resultado de la consulta masiva se dibuja la silueta de la tabla o de la lista del teléfono, con el lugar de las pestañas y del selector de destino reservado para que al llegar los datos nada se mueva; oculto para el lector de pantalla (que oye «Cargando los traslados…») y sin animación con «reducir movimiento».
- **Destinos que no se muestran** en la vista del coordinador: los vehículos con destino `PLANETA` o `SATELITAL` no aparecen en la lista, las pestañas, el selector de destino ni el buscador, y en la consulta masiva de VIN salen como «pendiente de información». Se compara el nombre entero (sin importar mayúsculas ni tildes). Se aplica en la web (`esVisible`, lista `DESTINOS_OCULTOS`); el backend no cambió.
- **Marcación de llegada por QR** (L-01, `features/llegada`, `LlegadaPage`): el conductor escanea el QR de la tablet del punto y manda su ubicación (`POST /mobile/llegadas`, mismo contrato y mismos textos que la app móvil); ve el punto, su turno y la hora de Lima. Solo el lado del conductor, solo con internet y sin guardar nada. Botón «Marcar llegada» en la home. Ver [marcacion-llegada-qr.md](docs/01-vision-y-alcance/marcacion-llegada-qr.md) y el [ADR 0012](docs/06-decisiones/0012-marcacion-de-llegada-por-qr-solo-lado-conductor-y-solo-con-internet.md).
- **Tablero de llegadas por QR** (`features/tablero-llegadas`, `TableroLlegadasPage`, ruta **`/dashboard`**): una vista de solo lectura para el supervisor de Despacho y de Secado, el asistente de Despacho y el admin con el orden de llegada y la distancia de cada conductor, los códigos rechazados (con su motivo) y la ficha de los puntos. **Esas personas entran directo al tablero y no ven Traslado.** Necesita el backend nuevo (`/api/llegada-qr/*`, ya mezclado en `sum-bck-modulos` y **sin desplegar**). Ver [tablero-llegadas-qr.md](docs/01-vision-y-alcance/tablero-llegadas-qr.md) y el [ADR 0013](docs/06-decisiones/0013-tablero-de-llegadas-en-esta-web-por-rol-y-area-en-dashboard.md).
- Un lector mínimo de la ruta del navegador (`core/navegacion/ruta.ts`), solo para `/dashboard`.
- Documentación del rol: propuesta de la vista, [mapeo del rol `coordinador`](docs/07-planificacion/mapeo-rol-coordinador.md) y pedido al backend.
- Despliegue en Vercel (`vercel.json`), con reenvío de `/api` y `/mobile`.
- Documentación en `docs/`, memoria para sesiones con LLM (`CLAUDE.md`, `AGENTS.md`, `docs/ai/`) y el skill `documentar-proyecto`.

### Changed
- `AppShell` decide también por el **par rol + área**: quien ve el tablero no ve Traslado. `PanelDetalle` acepta un nombre para el lector de pantalla.
- La vista del coordinador ya **no muestra las órdenes en planta** y abre en «Hoy» en vez de mostrar todo lo que el servidor mandaba.
- `AppShell` decide por rol: un `coordinador` va a la vista de seguimiento; el resto, como antes. `SinPermisoPage` acepta título y explicación (por defecto, los de Traslado).
- Las herramientas de prueba de la home están ocultas salvo con `?herramientas` en la dirección.
- Los documentos de diseño y planificación se movieron a `docs/` (los enlaces y las citas del código se actualizaron).
- `.gitignore` ya no ignora toda la carpeta `.claude/`, solo `.claude/settings.local.json`.

### Fixed
- **El lector de QR dejaba de leer en producción** (Vercel): reconocía «este cuadro no tiene código» por el `name` de la excepción de `@zxing/library`, que el minificador cambia por una letra; el primer cuadro sin QR detenía el escáner («No se pudo leer el código») y solo leía si el QR ya estaba a la vista al abrir la cámara. Ahora se reconoce por `getKind()`. Afectaba también al escáner de VIN.

### Security
- Regla del proyecto: ninguna prueba toca producción. `e2e/subida.spec.ts` queda apagada por defecto y aborta subidas a buckets con «prod» en el nombre.
