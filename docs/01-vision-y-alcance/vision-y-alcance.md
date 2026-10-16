# Visión y alcance

Última actualización: 2026-10-15 | Fuente: README.md, docs/07-planificacion/backlog.md, código en src/ | Estado: vigente

## Qué es

**Traslado web** es el front web del flujo de Traslado de SUM Vehículos: el operario toma una orden de traslado, fotografía el vehículo a la **salida** (6 zonas) y a la **entrega** (5 zonas) y confirma cada momento. Reutiliza los endpoints `/mobile/*` que ya usa la app móvil (`sum-app`, Flutter) sobre el backend `sum-bck-modulos`; no define un contrato nuevo.

- **Dispositivos:** iPhone (Safari) y Android (Chrome), más PC para desarrollo.
- **Sin PWA:** es una página web normal. Las fotos se toman dentro de la página con `getUserMedia`.
- **Solo con internet** (decisión del 2026-10-10, [ADR 0004](../06-decisiones/0004-solo-con-internet.md)): sin internet no se llega a la página. Si un envío falla, se muestra el error con «Reintentar».

## Qué hace hoy

| Área | Capacidad |
|---|---|
| Acceso | Login con cookie de refresh, una sola sesión entre pestañas, pantalla «Sin acceso» y «Sin permiso». |
| Órdenes | «Mis traslados» y «Disponibles hoy», filtro por VIN, tomar y soltar, elegir placa y proveedor. |
| Búsqueda | Filtro local, búsqueda en el sistema por VIN parcial o exacto y **escáner de QR y código de barras** (O-05). |
| Captura | Cámara dentro de la página o **foto de la galería** (T12), vista previa «Usar / Repetir», una ficha por zona. |
| Envío | Cada foto se **sube a GCS al tomarla** (con «Reintentar» por foto) y «Confirmar salida» / «Confirmar entrega» registra el despacho. |
| Llegada | **«Marcar llegada»** (L-01): el conductor escanea el QR de la tablet del punto y manda su ubicación; el servidor le da el turno del día. Solo el lado del conductor; solo con internet; no guarda nada. Detalle: [marcacion-llegada-qr.md](marcacion-llegada-qr.md). |
| Seguimiento (rol `coordinador`) | Una vista de **solo lectura** con todos los traslados que genera Traslado: etapa (en planta, en camino, entregado, anulado), si llevan GPS y los hitos registrados. Buscador, destino y pestañas. **Sin mapa y sin PDI** en este MVP. Entra **por rol**, sin filtro por destino. Solo en esta web. Detalle: [propuesta-vista-cliente.md](propuesta-vista-cliente.md) y [mapeo-rol-coordinador.md](../07-planificacion/mapeo-rol-coordinador.md). **El endpoint aún no existe en el backend.** |

## Fuera de alcance

- Cola automática y sincronización en segundo plano (E4-03 y E4-04, **descartadas** por la decisión de «solo con internet»).
- Telemetría remota de errores.
- Panel del supervisor (vive en el portal).

## Endpoints que usa

| Método y ruta | Para qué |
|---|---|
| `POST /api/login`, `POST /api/refresh` | Sesión (token en memoria, refresh por cookie). |
| `GET /mobile/traslado/mis-ordenes` | Órdenes propias y pool del día. |
| `GET /mobile/traslado/catalogos` | Placas y proveedores. |
| `GET /mobile/traslado/buscar?q=` | Candidatos por VIN parcial (mínimo 4 caracteres). |
| `GET /mobile/traslado/vin/{vin}` | Órdenes pendientes de un VIN exacto. |
| `POST /mobile/traslado/{id}/tomar` y `/soltar` | Tomar una orden del pool y devolverla. |
| `POST /mobile/llegadas` | Marcar la llegada del conductor a un punto (QR + ubicación). |
| `POST /mobile/storage/upload-url` | URL firmada para subir una foto a GCS. |
| `PUT` a la URL firmada | Subida directa a GCS (sin token). |
| `POST /mobile/traslado/{id}/confirmar-salida` y `/confirmar-entrega` | Registrar el despacho con las fotos ya subidas. |
| `GET /api/seguimiento/traslados` | **Propuesto, todavía no existe en el backend.** Lista de traslados para el rol `coordinador` ([pedido](../07-planificacion/pedido-backend-seguimiento-coordinador.md)). |

> TODO(verificar): el endpoint de cierre de sesión (`logout`) no se listó aquí; ver `src/core/auth/authCookie.ts`.

El contrato completo y los desenlaces de cada confirmación están en [patron-traslado-web.md](patron-traslado-web.md).

## Estado

Ver [estado-actual.md](../07-planificacion/estado-actual.md) y la lista viva en [TODO.md](../../TODO.md).
