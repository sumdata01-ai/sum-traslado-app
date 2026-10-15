# Sesión 2026-10-15 — Vista de seguimiento para el rol `coordinador`

Herramienta: Claude Code

## Objetivo
1. Proponer qué ofrecer a un usuario que debe seguir los vehículos que se trasladan (¿ya salió?, ¿va en camino?, ¿lleva GPS?, ¿por dónde va?), definir su **MVP** y **replicar la vista en esta web**.
2. Revisar el backend para decidir **cómo entra** esa persona (login y roles) y mapear el rol nuevo.

Estado al empezar: `main` en `1cb9faa`, con 8 `.md` de la sesión anterior ya modificados y sin commitear.

## Cambios realizados (archivos)

**Código (`src/`, `e2e/`) — autorizado por el usuario ("ok para empezar a construir")**
- Nuevo `src/features/seguimiento/`: `domain/` (`traslado`, `presentacion`: etapa, texto del GPS, hitos, fechas en hora de Lima, filtros y orden), `api/` (`seguimientoApi`, `schemas` con zod), `data/` (`listaSeguimiento`, `testing/fakes`), `components/` (`DetalleTraslado`, `ListasDeTraslados`, `piezas`, `iconos`, `useListaSeguimiento`).
- Nuevo `src/app/SeguimientoPage.tsx`.
- Modificados: `core/auth/sesion.ts` y `index.ts` (`ROL_COORDINADOR`, `esCoordinador`), `app/AppShell.tsx` (rama del coordinador), `app/App.tsx` (pasa la vista y vacía la lista al cerrar sesión), `app/SinPermisoPage.tsx` (título y explicación opcionales), `app/composicion.ts` y `main.tsx`.
- Pruebas nuevas: 4 archivos en `features/seguimiento/`, `app/SeguimientoPage.test.tsx`, `app/App.seguimiento.test.tsx` y `e2e/seguimiento.spec.ts`.

**Documentación (`.md`)**
- Nuevos: [propuesta-vista-cliente.md](../../01-vision-y-alcance/propuesta-vista-cliente.md), [mapeo-rol-coordinador.md](../../07-planificacion/mapeo-rol-coordinador.md), [pedido-backend-seguimiento-coordinador.md](../../07-planificacion/pedido-backend-seguimiento-coordinador.md) y el [ADR 0011](../../06-decisiones/0011-vista-del-coordinador-por-rol-solo-lectura-y-en-memoria.md).
- Actualizados: `00-indice`, `vision-y-alcance`, `navegacion-y-sesion`, `estructura-src`, `estado-y-datos`, `pruebas-unitarias`, `pruebas-e2e`, `backlog` (épica E7), `estado-actual`, `TODO.md`, `CHANGELOG.md`, y en `docs/ai/`: `contexto-proyecto`, `glosario`, `discrepancias` (#12 a #14), `comandos` y `convenciones`.

**No se tocó:** el backend, el portal ni la app Flutter (solo se leyeron), `vite.config.ts`, `vercel.json`, `.env.local` ni `.certs/`.

## Decisiones tomadas
Del usuario (todas del 2026-10-15; detalle en el [ADR 0011](../../06-decisiones/0011-vista-del-coordinador-por-rol-solo-lectura-y-en-memoria.md)):
- Rol nuevo **`coordinador`**; no se reutiliza `cliente`.
- Entra **por rol**, no por `allowed_apps`.
- **Coordinador general, sin filtro por destino**; ve todo lo que genera Traslado.
- **Solo web**: Flutter no cambia.
- El **PDI no entra** en este MVP; sin mapa.
- Pestañas: Todos, En camino y Entregados (se quitaron «En planta» y «Anulados»).
- Colores **los del proyecto** (`src/index.css`), solo tema claro.
- Campos visibles: se deja la lista de la propuesta (sin conductor, velocidad ni fotos).

Mías, sujetas a revisión: etapa «anulado» dentro de «Todos»; emblema neutro de una letra en lugar de logos de marca.

## Problemas encontrados y solución
- **El prefijo `/v1/seguimiento` no llegaría al backend:** esta web solo reenvía `/api` y `/mobile`, y el backend monta los routers en la raíz. Se cambió a `/api/seguimiento/traslados` (discrepancia #12).
- **La primera E2E dejaba la página en blanco:** el patrón `/(api|mobile)/` interceptaba también módulos de código con carpeta `api/` (`src/features/*/api/`) y les respondía 500. Ahora intercepta solo rutas que **empiezan** por `/api/` o `/mobile/`.
- **Una mutación solo se detectaba fuera de UTC** (leer un texto sin zona como hora local). Se añadió una prueba que cambia `process.env.TZ`; ahora se detecta siempre.
- **El tsconfig de `e2e` no incluye los tipos del DOM:** `page.evaluate` con una función que usa `document` no compilaba; se pasa como texto.
- **La fila elegida no se veía azul** porque el estilo `hover` le ganaba: ahora es `elegido ? 'bg-primary-soft' : 'hover:bg-surface-2'`.
- **Hallazgos del backend (solo lectura, sin verificar contra producción):** el rol `cliente` existe pero es el auditor de inspecciones y no está en `ROLES_VALIDOS`; unos 65 endpoints solo exigen sesión (`require_auth`) y devuelven datos de cualquier vehículo a cualquier rol (confirmados cinco, p. ej. `GET /storage/signed-url/{key}`).

## Verificaciones realmente ejecutadas
Última corrida completa, **después del último cambio de código** (desde entonces solo se editaron `.md`):

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores. |
| `npm run lint` | Sin errores. |
| `npx vitest run --exclude "**/*.backend.test.ts"` | **1608 pruebas pasan** en 73 archivos (antes 1483 en 67). Se **excluyeron a propósito** las del backend real: `:8050` estaba encendido y esas pruebas toman y sueltan órdenes. |
| `npm run build` | Compila (código de salida 0). |
| E2E `e2e/seguimiento.spec.ts`, Chrome real | 3 de 3 pasan. **Sin backend**: responden `/api` y `/mobile` en la propia prueba. |
| E2E `e2e/seguimiento.spec.ts`, Edge real | 3 de 3 pasan. |
| Desborde horizontal a 360 px (dentro de la E2E) | Sin desborde, en lista y en detalle. |
| Revisión visual con capturas (Chrome, 1280 px y 360 px) | Hecha; llevó a dos retoques (superficie blanca y fila elegida). |
| Mutación | **35 roturas a propósito, 35 detectadas** a la primera tanda; el código se restauró (comprobado) y no quedan `.bak`. La mutación de zona horaria, ya con prueba nueva, se detecta aun con la máquina en UTC. |
| Enlaces de los `.md` (script temporal fuera del repositorio) | 55 documentos, 260 enlaces relativos, 0 rotos; los tres documentos nuevos están en el índice y no traen rutas personales ni IPs. |

**No se hizo:**
- Ninguna prueba contra el backend real: **el rol y el endpoint no existen**. El contrato solo se probó contra servidores falsos.
- No se probó en un teléfono real (iPhone ni Android), ni en un lector de pantalla; `axe` corrió en jsdom, no en el navegador.
- No se verificó que la copia local del backend (`feature/utilitarios-asistencia-qr`, con cambios sin commitear) coincida con producción.
- No se corrió `npm test` sin exclusión (con `:8050` encendido ejecutaría las pruebas del backend real).
- No se sabe a qué base apunta `:8050` (discrepancia #11).
- Un servidor de desarrollo levantado a mano para depurar se detuvo al terminar (5173 libre).

## Pendientes / siguiente paso
**Pendientes**
- **Enviar el pedido al backend** ([pedido-backend-seguimiento-coordinador.md](../../07-planificacion/pedido-backend-seguimiento-coordinador.md)): rol `coordinador` y `GET /api/seguimiento/traslados`. Está escrito y **sin enviar**.
- Probar con el backend cuando exista, con una cuenta de coordinador y datos de las cuatro etapas, **confirmando antes a qué base apunta `:8050`** (iniciar sesión escribe una sesión en la base).
- Probar la pantalla en iPhone y Android.
- Antes de dar cuentas reales: que el backend cierre los endpoints `require_auth` que devuelven datos de vehículos.
- Decidir: si `admin` entra a la vista; si se amplían los campos para personal interno; qué marcas y logos; legal, si la ubicación llegara a mostrarse a terceros.
- Fases posteriores: mapa, hito de PDI, filtro por destino y roles para externos.
- Sin commitear: toda la sesión, más los 8 `.md` de la sesión anterior que ya estaban modificados.

**Siguiente paso concreto:** decidir quién implementa el backend (el rol en `ROLES_VALIDOS` y el endpoint, con sus pruebas, en una **rama** de `sum-bck-modulos`, no en `main`): el equipo de backend a partir del pedido, o esta herramienta con autorización explícita. Con eso listo, probar la vista con una cuenta de coordinador.

## Aprendizajes a llevar a memoria
Pasados a `docs/ai/` o a los documentos de calidad, sin repetirlos aquí:
- Una ruta de la web que vaya al backend debe empezar por `/api` o `/mobile`: [convenciones.md](../convenciones.md).
- Una E2E sin backend (respuestas simuladas) se puede correr con `:8050` encendido y sin gastar logins, y las rutas se interceptan por el **inicio** de la ruta: [comandos.md](../comandos.md) y [pruebas-e2e.md](../../04-calidad/pruebas-e2e.md).
- Los respaldos de la mutación van fuera del repositorio; las pruebas de fechas fijan la zona horaria: [pruebas-unitarias.md](../../04-calidad/pruebas-unitarias.md).
- Las discrepancias entre este proyecto y los repositorios hermanos (rol `cliente`, `/v1`, criterio de acceso): [discrepancias.md](../discrepancias.md) #12 a #14.
