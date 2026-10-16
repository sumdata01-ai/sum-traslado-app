# Contexto del proyecto (resumen denso)

Última actualización: 2026-10-15 | Fuente: package.json, src/, docs/, git (2026-10-15) | Estado: vigente

## Qué es
Front web de **Traslado** de SUM Vehículos: el operario toma una orden, fotografía la **salida** (6 zonas) y la **entrega** (5 zonas) y confirma cada momento. Mismos endpoints `/mobile/*` que la app móvil (`sum-app`, Flutter) sobre el backend `sum-bck-modulos`. iPhone (Safari) y Android (Chrome). Sin PWA. **Solo con internet.**

**Segunda audiencia (2026-10-15):** el rol **`coordinador`** ve, solo en esta web, el seguimiento de **todos** los traslados (`SeguimientoPage`, `features/seguimiento`): solo lectura, solo en memoria, **sin GPS, sin mapa, sin PDI y sin órdenes anuladas**, entra **por rol** y no por `allowed_apps`. Tiene una **consulta masiva de VIN** (pegar hasta 200; en tránsito o entregado, lo demás «pendiente de información») y la lista **no se renueva sola** (solo al abrir y con «Actualizar»). El backend ya tiene el rol y los endpoints (`sum-bck-modulos`, merge `65afcac`, en su `origin/main`): ver [pedido-backend-seguimiento-coordinador.md](../07-planificacion/pedido-backend-seguimiento-coordinador.md). La web está en `origin/main` (`29fcde0`); no se comprobó que Cloud Run ni Vercel ya lo tengan desplegado.

**Tercera funcionalidad (2026-10-15):** la **marcación de llegada por QR** del conductor (`features/llegada`, `LlegadaPage`, botón «Marcar llegada» en la home): escanea el QR de la tablet del punto y manda su ubicación a `POST /mobile/llegadas`; ve el punto, su turno y la hora de Lima. Solo el lado del conductor (el backend y la tablet ya existen en la app `sum-app`), solo con internet y sin guardar nada. **No se probó en un teléfono ni contra el backend real.** Ver [marcacion-llegada-qr.md](../01-vision-y-alcance/marcacion-llegada-qr.md).

**Cuarta funcionalidad (2026-10-16):** el **tablero de llegadas por QR** (`features/tablero-llegadas`, `TableroLlegadasPage`, ruta **`/dashboard`**): solo lectura, para supervisor de Despacho y de Secado, asistente de Despacho y admin (el **par rol + área**), que **entran directo y no ven Traslado**. Muestra el orden de llegada y la distancia, los códigos rechazados y la ficha de los puntos. Usa `GET /api/llegada-qr/*` del backend (**sin desplegar**). Ver [tablero-llegadas-qr.md](../01-vision-y-alcance/tablero-llegadas-qr.md) y el [ADR 0013](../06-decisiones/0013-tablero-de-llegadas-en-esta-web-por-rol-y-area-en-dashboard.md).

## Stack
Vite 8 · React 19 · TypeScript ~6 estricto · Tailwind 4 · Dexie 4 (IndexedDB) · zod 4 · `@zxing/browser` (carga bajo demanda) · Vitest 4 + Testing Library + vitest-axe + fake-indexeddb · Playwright (Chrome y Edge instalados) · Vercel.

## Arquitectura en cinco líneas
1. Capas: `domain/` (puro, ESLint lo exige) → `api/` y `data/` → `camera/` y `components/` → `app/`.
2. Estado en **stores externos** (`getSnapshot` + `suscribir`) leídos con `useSyncExternalStore`; sin librería de estado ni router.
3. Mismo origen: el navegador solo habla con su servidor (proxy de Vite / rewrites de Vercel) que reenvía `/api` y `/mobile`.
4. Cada foto: cámara o galería → JPEG verificado → Dexie (`pending`) → URL firmada → PUT a GCS → `uploaded` con su `storage_key`.
5. «Confirmar salida/entrega» solo registra el despacho con las rutas ya subidas; el servidor guarda las fotos siempre.

Detalle: [docs/02-arquitectura/vision-general.md](../02-arquitectura/vision-general.md).

## Reglas que no se negocian
- **Ninguna prueba toca producción.** El backend local firma URLs del bucket `sum-fotos-prod` (producción) y `vercel.json` apunta al Cloud Run de producción. Subir fotos o confirmar de verdad se pregunta antes. ([ADR 0008](../06-decisiones/0008-no-tocar-produccion.md))
- **Qué es seguro:** pruebas con servidores falsos, y las pruebas contra el backend local que solo toman y sueltan órdenes.
- No leer ni mostrar `.env.local` ni `.certs/`.
- El `domain/` no importa nada del navegador ni de otras capas.

## Estado
Ver [docs/07-planificacion/estado-actual.md](../07-planificacion/estado-actual.md) y [TODO.md](../../TODO.md).

## Dónde está cada cosa
| Busco | Voy a |
|---|---|
| Historias y criterios de aceptación | [backlog.md](../07-planificacion/backlog.md) |
| Contrato del backend y desenlaces | [patron-traslado-web.md](../01-vision-y-alcance/patron-traslado-web.md) |
| Cómo correr, probar, desplegar | [comandos.md](comandos.md), [entorno-local.md](../03-configuracion/entorno-local.md), [vercel.md](../05-despliegue/vercel.md) |
| Por qué se decidió algo | [docs/06-decisiones/](../06-decisiones/) |
