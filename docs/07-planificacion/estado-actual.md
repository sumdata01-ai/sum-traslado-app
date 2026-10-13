# Estado actual

Última actualización: 2026-10-13 (cierre de sesión) | Fuente: TODO.md, docs/07-planificacion/backlog.md, plan-sprints.md | Estado: vigente

> La lista viva y el registro de avances están en [TODO.md](../../TODO.md). Este documento solo resume y dice **qué documento es la fuente de cada cosa**.

## Fuente de cada cosa

| Documento | Qué contiene | Cuándo se edita |
|---|---|---|
| [backlog.md](backlog.md) | Historias, criterios de aceptación y decisiones por historia. | Al refinar o cerrar una historia. |
| [plan-sprints.md](plan-sprints.md) | Secuencia de sprints, riesgos, Definition of Done, avances por sprint. | Al planificar o cerrar un sprint. |
| [TODO.md](../../TODO.md) | Checklist por sprint, decisiones y bloqueos, pendientes, pedidos a terceros, verificación en teléfonos y **registro de avances**. | En cada sesión de trabajo. |

> Hay solapamiento entre `plan-sprints.md` (§2.1 a §2.3, avances) y el «Registro de avances» de `TODO.md`. Hoy no se reconcilian: ver [discrepancias.md](../ai/discrepancias.md).

## Resumen al 2026-10-13

| Estado | Historias |
|---|---|
| Hecha en código y con pruebas | Fundaciones, login con cookie (A-02), una sola sesión entre pestañas (A-03), home (O-01), tomar y soltar (O-02), identificar VIN (O-03), placa y proveedor (O-04, O-04b), subida de fotos (E4-01), confirmar salida y entrega (E4-02), foto de la galería (T12), escáner de VIN (O-05). |
| Probado en iPhone (iOS 26.5, desde Vercel) | Página carga con HTTPS válido; las fotos sobreviven a cerrar sesión y la app; la sesión sobrevive a recargar; la cámara vuelve sola tras bloquear o cambiar de app. |
| Falta en teléfono | JPEG y tamaño de la foto, 360 px, permisos denegados, galería (HEIC, fotos grandes), escáner con una etiqueta real, y todo en Android. |
| Bloqueado por terceros | Subir y confirmar de verdad: el backend local firma URLs del bucket de **producción**; hace falta un bucket y backend de desarrollo, y el CORS del origen de Vercel. Datos de prueba en el backend. |
| Esperando al backend | `otras_ordenes` en `/vin/{vin}`: sin él, el VIN de una orden que otra persona ya sacó dice «Sin orden pendiente». La página ya está preparada. Ver [pedido-backend-vin-otras-ordenes.md](pedido-backend-vin-otras-ordenes.md). |
| Sin commitear | Todo lo de la sesión del 2026-10-13: `docs/`, `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`, el skill y el aviso de orden ya tomada (último commit `8de83a7`). |
| Descartado | E4-03 y E4-04 (cola automática y sesión vencida con fotos pendientes). |
| Pendiente (P-01) | Validación de resolución y calidad con operarios; necesita el entorno público (D2) y las pruebas de teléfono. |

## Decisiones pendientes del usuario

Ver la sección «Pendientes por decidir» de [TODO.md](../../TODO.md).
