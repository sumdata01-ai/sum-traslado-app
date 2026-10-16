# Sesión 2026-10-15 (parte 3) — Marcación de llegada por QR, lado del conductor

Herramienta: Claude Code

El nombre lleva `-zz-` para que sea la última por orden alfabético (las bitácoras anteriores del día empiezan por `vista-`). Continúa de [la parte 2](2026-10-15-vista-seguimiento-coordinador-parte-2.md).

## Objetivo
Traer a esta web (online, sin offline) la funcionalidad **ya implementada en la app** de marcación de llegada por QR, descrita en `sum-app/documentos/modulos/marcacion-qr-llegada.md`. El usuario precisó: **solo el lado del conductor** (registrar su llegada); la app en modo punto y el backend con los endpoints ya están hechos.

## Cambios realizados (archivos)
**Código nuevo** (autorizado por el pedido):
- `src/features/llegada/domain/llegada.ts` (+ `index.ts`): cuerpo del POST (cuatro campos), `interpretarRespuestaLlegada`, `esFixUtil` (20 s, en valor absoluto), `textoDeLlegada` (hora de Lima).
- `src/features/llegada/api/llegadaApi.ts`: `POST /mobile/llegadas` con `cliente.request` (para leer `code`, `motivo` y `precision_max_m` del 400) y `OPCIONES_LLEGADA` (403 no cierra la sesión).
- `src/features/llegada/data/controladorLlegada.ts`: máquina de estados como store externo; `ubicacion.ts` (`watchPosition`, `maximumAge: 0`); `testing/fakes.ts`.
- `src/features/llegada/components/EscanerQr.tsx` (visor que entrega el texto crudo) y `useLlegada.ts`.
- `src/app/LlegadaPage.tsx`; botón y estado en `HomePage.tsx`; `llegada` en `App.tsx`, `composicion.ts` y `main.tsx`.
- Pruebas: `llegada.test.ts`, `llegadaApi.test.ts`, `controladorLlegada.test.ts`, `ubicacion.test.ts`, `EscanerQr.test.tsx`, `LlegadaPage.test.tsx`, `HomePage.llegada.test.tsx`, `App.llegada.test.tsx` y `e2e/llegada.spec.ts`.
- **No se modificó** `EscanerVin` (normaliza el texto), `vercel.json`, `package.json` ni `.env.local`.

**Documentación:** [marcacion-llegada-qr.md](../../01-vision-y-alcance/marcacion-llegada-qr.md) (nuevo), [ADR 0012](../../06-decisiones/0012-marcacion-de-llegada-por-qr-solo-lado-conductor-y-solo-con-internet.md) (nuevo), `backlog.md` (E8, L-01), `vision-y-alcance`, `estructura-src`, `navegacion-y-sesion`, `estado-y-datos`, `camara-y-fotos`, `pruebas-unitarias`, `pruebas-e2e`, `glosario`, `discrepancias` (#15), `convenciones`, `comandos`, `contexto-proyecto`, `estado-actual`, `00-indice`, `TODO.md` y `CHANGELOG.md`.

## Decisiones tomadas
Ver el [ADR 0012](../../06-decisiones/0012-marcacion-de-llegada-por-qr-solo-lado-conductor-y-solo-con-internet.md). Mías, sujetas a revisión:
- **Pantalla de explicación** antes de pedir permisos y **pantalla propia para la ubicación negada** (en la web el permiso lo pide el navegador; la app tiene una pantalla de permisos distinta).
- **Botón «Marcar llegada» a todo el ancho**, debajo del título de la home (a 360 px no cabe junto a «Actualizar»).
- **Sin la franja «Llegada registrada»** del inicio (no se pidió).
- `watchPosition` solo, sin una lectura inicial aparte (`getCurrentPosition`): más simple; riesgo anotado para iPhone.
- `ControladorLlegada.dispose()` es **reutilizable** porque la app corre en `StrictMode`.

## Problemas encontrados y solución
- **Mi script de mutación dejó `LlegadaPage.tsx` roto** al interrumpirse la herramienta; se vio porque una prueba base fallaba («Hoy 14:34» frente a «15/10 14:34»). Restaurado y repetida la verificación.
- **Roturas de varias líneas «aparecían 0 veces»:** el controlador había quedado en CRLF por una edición con Python sin `newline=""`. El script ahora adapta los saltos de línea.
- **Una rotura colgó las pruebas** (límite de 300 s); se puso límite de 120 s y se cuenta como detectada.
- **Mi E2E dependía del día** («Hoy» o la fecha) y contaba los 4xx provocados como errores de consola; corregidas.
- `e2e/llegada.spec.ts` no compilaba (sin la biblioteca DOM ni el 5.º argumento de `QRCodeWriter.encode`); corregido.

## Verificaciones realmente ejecutadas
| Comprobación | Resultado |
|---|---|
| `npm run typecheck`, `npm run lint` | Sin errores (última corrida, tras el último cambio). |
| `npx vitest run --exclude "**/*.backend.test.ts"` | **1874 pruebas pasan** en 84 archivos (eran 1684 en 76). Se excluyeron a propósito las del backend real. |
| `npm run build` | Compila (aviso de tamaño del fragmento principal, ya existente). |
| `e2e/llegada.spec.ts` en Chrome y Edge reales | 4 de 4 en cada uno, **con el lector de QR real**, ubicación simulada por Playwright y servidor falso. |
| Mutación | **108 roturas a propósito: 94 se detectaron a la primera; 9 eran pruebas débiles** (el mes en «Hoy», el reenvío del mismo fix, no relanzar el GPS en «Escanear de nuevo», `empezar` y «Reintentar» fuera de su pantalla, un fix viejo al esperar precisión, leer antes de que la cámara tenga imagen, no dejar de revisar al desmontar, el botón «Recalcular posición») **y se reforzaron; ahora se detectan. 5 son equivalentes** (`c16`, `c19`, `c23`: cancelar la espera está en tres sitios y cada uno cubre a los otros; **rotos de a pares sí se detectan**; `c21` y `c27`: el candado de «una petición a la vez» repite el control por etapa). Código restaurado y sin `.bak`. |

**No se hizo:**
- **Nada en un teléfono real** (iPhone ni Android): cámara, permiso de ubicación, precisión del GPS, 360 px real. En iPhone `watchPosition` puede no volver a emitir con el teléfono quieto.
- **Nada contra el backend real** ni producción: cada llegada escribe un turno. No se verificó que el token de esta web sea aceptado por `POST /mobile/llegadas`, ni que el backend siga como describe el documento del módulo.
- El navegador de los conductores con la ubicación bloqueada por política del equipo.
- Con lector de pantalla (solo `axe` en jsdom).
- No se probó el modo oscuro (el proyecto es solo claro).

## Pendientes / siguiente paso
- Probar en iPhone y Android (HTTPS con `npm run dev:https` o desde Vercel); mirar a 360 px.
- Con permiso del usuario, probar contra un backend real **en una base local**, con una cuenta de operario y un QR de `scripts/mostrar_qr_esperado.py` o `tool/mostrar_qr_consola.dart`; confirmar el token y el CORS.
- Medir en el lugar las constantes.
- Decidir: la franja «Llegada registrada» del inicio; si se quiere la vista del supervisor (vive en el portal).

**Siguiente paso concreto:** abrir la web desplegada o `npm run dev:https` en un teléfono, entrar con un operario y probar «Marcar llegada» con el QR de una tablet en modo punto **de un entorno de prueba** (no el del patio real, para no dejar llegadas de prueba en producción).

## Aprendizajes a llevar a memoria
Pasados a `docs/ai/`: la trampa de un script de mutación interrumpido, la edición con Python y CRLF, las guardas dobles como «mutantes que sobreviven» y las E2E que dependen del día ([convenciones.md](../convenciones.md)); el comando de la E2E nueva ([comandos.md](../comandos.md)); la aclaración sobre el invariante del portal ([discrepancias.md](../discrepancias.md) #15).
