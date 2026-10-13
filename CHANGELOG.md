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
- Despliegue en Vercel (`vercel.json`), con reenvío de `/api` y `/mobile`.
- Documentación en `docs/`, memoria para sesiones con LLM (`CLAUDE.md`, `AGENTS.md`, `docs/ai/`) y el skill `documentar-proyecto`.

### Changed
- Las herramientas de prueba de la home están ocultas salvo con `?herramientas` en la dirección.
- Los documentos de diseño y planificación se movieron a `docs/` (los enlaces y las citas del código se actualizaron).
- `.gitignore` ya no ignora toda la carpeta `.claude/`, solo `.claude/settings.local.json`.

### Security
- Regla del proyecto: ninguna prueba toca producción. `e2e/subida.spec.ts` queda apagada por defecto y aborta subidas a buckets con «prod» en el nombre.
