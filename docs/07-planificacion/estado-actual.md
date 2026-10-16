# Estado actual

Última actualización: 2026-10-16 | Fuente: TODO.md, docs/07-planificacion/backlog.md, plan-sprints.md, git | Estado: vigente

> La lista viva y el registro de avances están en [TODO.md](../../TODO.md). Este documento solo resume y dice **qué documento es la fuente de cada cosa**.

## Fuente de cada cosa

| Documento | Qué contiene | Cuándo se edita |
|---|---|---|
| [backlog.md](backlog.md) | Historias, criterios de aceptación y decisiones por historia. | Al refinar o cerrar una historia. |
| [plan-sprints.md](plan-sprints.md) | Secuencia de sprints, riesgos, Definition of Done, avances por sprint. | Al planificar o cerrar un sprint. |
| [TODO.md](../../TODO.md) | Checklist por sprint, decisiones y bloqueos, pendientes, pedidos a terceros, verificación en teléfonos y **registro de avances**. | En cada sesión de trabajo. |

> Hay solapamiento entre `plan-sprints.md` (§2.1 a §2.3, avances) y el «Registro de avances» de `TODO.md`. Hoy no se reconcilian: ver [discrepancias.md](../ai/discrepancias.md).

## Resumen al 2026-10-15

| Estado | Historias |
|---|---|
| Hecha en código y con pruebas | Fundaciones, login con cookie (A-02), una sola sesión entre pestañas (A-03), home (O-01), tomar y soltar (O-02), identificar VIN (O-03), placa y proveedor (O-04, O-04b), subida de fotos (E4-01), confirmar salida y entrega (E4-02), foto de la galería (T12), escáner de VIN (O-05). |
| Hecha en código y con backend (en `main`) | Vista de seguimiento del rol `coordinador` (E7, C-00) y consulta masiva de VIN (C-01): todos los traslados, solo lectura, **sin GPS, sin mapa, sin PDI y sin órdenes anuladas**; entra por rol; la lista no se renueva sola. Web en `origin/main` (`29fcde0`); backend en el `origin/main` de `sum-bck-modulos` (`65afcac`: rol `coordinador`, `GET /api/seguimiento/traslados`, `POST /api/seguimiento/consulta-vines`). Probada con servidores falsos (Vitest, Playwright en Chrome y Edge) y con el backend en la **base local**; **sin comprobar en producción** ni en un teléfono. Ver [pedido-backend-seguimiento-coordinador.md](pedido-backend-seguimiento-coordinador.md) y [mapeo-rol-coordinador.md](mapeo-rol-coordinador.md). |
| Hecha en código, con servidores falsos | **Marcación de llegada por QR del conductor** (E8, L-01): botón «Marcar llegada» en la home, visor del QR, ubicación, envío a `POST /mobile/llegadas` y resultado con el turno. Solo el lado del conductor (el backend y la tablet ya existen en la app). Probada con Vitest y Playwright en Chrome y Edge (lector de QR real, ubicación simulada, servidor falso); **sin probar en un teléfono ni contra el backend real**. Ver [marcacion-llegada-qr.md](../01-vision-y-alcance/marcacion-llegada-qr.md) y el [ADR 0012](../06-decisiones/0012-marcacion-de-llegada-por-qr-solo-lado-conductor-y-solo-con-internet.md). |
| Hecha en código, con servidores falsos | **Tablero de llegadas por QR** (E9): `/dashboard`, solo lectura, para supervisor de Despacho y de Secado, asistente de Despacho y admin; **entran directo y no ven Traslado**. Web probada con Vitest y Playwright (Chrome y Edge); backend mezclado a `main` de `sum-bck-modulos` (`c2e83c5`) y probado contra la réplica local. **El backend no está desplegado** y no se probó con la web ni en un teléfono. Ver [tablero-llegadas-qr.md](../01-vision-y-alcance/tablero-llegadas-qr.md) y [plan-dashboard-llegadas.md](plan-dashboard-llegadas.md). |
| Probado en iPhone (iOS 26.5, desde Vercel) | Página carga con HTTPS válido; las fotos sobreviven a cerrar sesión y la app; la sesión sobrevive a recargar; la cámara vuelve sola tras bloquear o cambiar de app. |
| Falta en teléfono | JPEG y tamaño de la foto, 360 px, permisos denegados, galería (HEIC, fotos grandes), escáner con una etiqueta real, **la marcación de llegada (cámara, permiso de ubicación y precisión del GPS)**, y todo en Android. |
| Bloqueado por terceros | **Seguimiento del coordinador en producción:** hay que comprobar que Cloud Run tenga el backend nuevo y que un `admin` cree la cuenta `coordinador`; antes de dar cuentas reales, que el backend cierre los endpoints que solo exigen sesión. Subir y confirmar de verdad: el backend local firma URLs del bucket de **producción**; hace falta un bucket y backend de desarrollo, y el CORS del origen de Vercel. Datos de prueba en el backend. |
| Hecho en producción | Aviso de orden ya tomada: el backend ya manda `otras_ordenes` y la página desplegada muestra «Orden ya tomada el 13/10, 10:38» (probado en solo lectura el 2026-10-13). Detalle y puntos abiertos en [pedido-backend-vin-otras-ordenes.md](pedido-backend-vin-otras-ordenes.md). |
| A confirmar | A qué base apunta `localhost:8050` (puede leer producción). Mientras tanto no se corren pruebas que escriban contra él. Ver [discrepancias.md](../ai/discrepancias.md) #11. |
| Descartado | E4-03 y E4-04 (cola automática y sesión vencida con fotos pendientes). |
| Pendiente (P-01) | Validación de resolución y calidad con operarios; necesita el entorno público (D2) y las pruebas de teléfono. |

## Decisiones pendientes del usuario

Ver la sección «Pendientes por decidir» de [TODO.md](../../TODO.md).
