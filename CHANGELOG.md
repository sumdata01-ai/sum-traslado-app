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
- Vista de seguimiento para el rol `coordinador` (`SeguimientoPage`, `features/seguimiento`): todos los traslados, solo lectura y en memoria, con buscador, destino, pestañas, tabla en escritorio, lista en el teléfono y detalle con hitos, **sin nada de GPS**, sin mapa y sin PDI. Con logos de marca locales (`src/assets/marcas/`). Entra **por rol**, sin mirar `allowed_apps`. **El endpoint (`GET /api/seguimiento/traslados`) y el rol aún no existen en el backend**: solo se probó con servidores falsos ([pedido](docs/07-planificacion/pedido-backend-seguimiento-coordinador.md)).
- **Consulta masiva de VIN** en la vista del coordinador: se pega una lista (hasta 200), se lee antes de consultar (repetidos, no-VIN, exceso) y cada VIN sale con su estado si está en tránsito o entregado (de cualquier fecha) o como «Pendiente de información» si no. Usa `POST /api/seguimiento/consulta-vines`.
- Documentación del rol: propuesta de la vista, [mapeo del rol `coordinador`](docs/07-planificacion/mapeo-rol-coordinador.md) y pedido al backend.
- Despliegue en Vercel (`vercel.json`), con reenvío de `/api` y `/mobile`.
- Documentación en `docs/`, memoria para sesiones con LLM (`CLAUDE.md`, `AGENTS.md`, `docs/ai/`) y el skill `documentar-proyecto`.

### Changed
- `AppShell` decide por rol: un `coordinador` va a la vista de seguimiento; el resto, como antes. `SinPermisoPage` acepta título y explicación (por defecto, los de Traslado).
- Las herramientas de prueba de la home están ocultas salvo con `?herramientas` en la dirección.
- Los documentos de diseño y planificación se movieron a `docs/` (los enlaces y las citas del código se actualizaron).
- `.gitignore` ya no ignora toda la carpeta `.claude/`, solo `.claude/settings.local.json`.

### Security
- Regla del proyecto: ninguna prueba toca producción. `e2e/subida.spec.ts` queda apagada por defecto y aborta subidas a buckets con «prod» en el nombre.
