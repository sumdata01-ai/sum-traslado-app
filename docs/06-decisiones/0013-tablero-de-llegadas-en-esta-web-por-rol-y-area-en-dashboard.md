# 0013. El tablero de llegadas por QR vive en esta web, por rol y área, en `/dashboard`

Última actualización: 2026-10-16 | Fuente: src/features/tablero-llegadas/, src/app/TableroLlegadasPage.tsx, src/app/AppShell.tsx, src/core/navegacion/ruta.ts, src/core/auth/sesion.ts; backend `sum-bck-modulos` (`app/api/v1/llegada_qr.py`, `app/api/deps.py`) | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-16 (decisiones del usuario)

## Contexto

La marcación de llegada por QR (L-01, [ADR 0012](0012-marcacion-de-llegada-por-qr-solo-lado-conductor-y-solo-con-internet.md)) guarda quién llegó, cuándo, a qué distancia y con qué turno, y los códigos rechazados. Nadie podía **ver** esos datos (solo SQL directo). El spec del tablero (`sum-app/docs/specs/001-marcacion-qr/dashboard-llegadas-historias.md`) pedía una vista de solo lectura para supervisores y decía que se construiría «en otro proyecto»; el [alcance de esta web](../01-vision-y-alcance/vision-y-alcance.md) dejaba fuera el «panel del supervisor» porque vive en el portal.

## Decisión

1. **Se construye en esta web** (`sum-temp-traslado`), no en el portal. Es una vista más, como la del coordinador.
2. **Quién la ve: el par rol + área**, no solo el rol: **supervisor de Despacho, supervisor de Secado, asistente de Despacho y admin** (cualquier área). `secado_fisico` no entra. El guard del backend (`require_llegada_qr_lector`, `LLEGADA_QR_LECTOR_PARES`) es el que de verdad cierra el paso (403 a cualquier otro); la web usa el mismo criterio (`puedeVerTablero`, `PARES_DEL_TABLERO`) solo para decidir qué pantalla mostrar. No se reutilizó `require_area_lectura`: deja pasar a **todos** los asistentes.
3. **Una ruta nueva, `/dashboard`.** La web no tiene router; se agregó un lector mínimo de la dirección (`core/navegacion/ruta.ts`: `useRuta`, `navegar`) con `history.pushState`. **Quien cumple un par entra directo al tablero y no ve Traslado**, aunque su cuenta tenga `traslado` (pedido del usuario el 2026-10-16: no hay home, ni «Marcar llegada», ni botón para ir a Traslado ni para volver). Cualquier otra dirección (`/`, `/traslado`…) lo lleva a `/dashboard` con `replaceState`, sin dejar una entrada en el historial: «atrás» no llega a Traslado. Quien no cumple un par y abre `/dashboard` vuelve a `/` del mismo modo. El coordinador sigue con su seguimiento.
4. **Los endpoints son `/api/llegada-qr/dia`, `/intentos` y `/puntos`** (el prefijo `/api` es de los dos que esta web reenvía al backend, [ADR 0003](0003-mismo-origen-por-proxy.md)).
5. **Solo lectura y solo en memoria**, como la vista del coordinador ([ADR 0011](0011-vista-del-coordinador-por-rol-solo-lectura-y-en-memoria.md)): son nombres, usuarios y ubicaciones de conductores. Se pide al abrir, con «Actualizar» y al cambiar de día o de punto; **no hay renovación automática**. Un fallo no vacía lo mostrado; un 403 muestra «Sin permiso» sin cerrar la sesión; al cerrar sesión o entrar otra persona se vacía todo.
6. **Los cálculos son del servidor** (pasos, demora, porcentaje del radio, antigüedad del QR, señales y mediana): una sola fuente de verdad y cifras que no dependen de cuántas filas se descargaron. La web solo formatea (horas de Lima a mano, sin `Intl`).
7. **Los intentos de más de 90 días solo se ocultan** (la consulta no permite pasar de 90 días atrás); no se borra nada.

## Consecuencias

- **Esas personas pierden Traslado en esta web** (por decisión): un supervisor de Despacho o de Secado, un asistente de Despacho y un admin ya no pueden tomar órdenes ni fotografiar desde aquí, aunque su cuenta tenga `traslado`. Si alguien de esos pares necesitara Traslado, habría que cambiar la decisión (por ejemplo, con un botón como el que se probó y se quitó).
- Hay **un lugar más donde se decide el acceso por rol**: `AppShell` ya distinguía al coordinador; ahora también al par del tablero. Si el backend cambia la lista de pares, hay que cambiar `PARES_DEL_TABLERO` a la vez (una prueba fija la lista).
- La web publicada **no sirve a esos usuarios hasta que Cloud Run tenga el backend nuevo** (mezclado a `main` de `sum-bck-modulos` en `c2e83c5`, **sin desplegar**): sin él, el tablero muestra un error al pedir `/api/llegada-qr/*` y esas personas, que ya no ven Traslado, se quedan sin nada útil. El despliegue lo hace el usuario.
- `/dashboard` funciona porque `vercel.json` y Vite devuelven `index.html` para cualquier ruta que no sea `/api` ni `/mobile`. Una ruta nueva **no debe empezar por esos prefijos**.
- El esquema de «dónde escaneó» es un dibujo, no un mapa: el centro del punto viene de la ficha de puntos (`/puntos`) y la dirección es el rumbo entre el centro y el teléfono. Si la ficha no llega, se dibuja a la derecha y el detalle lo dice.
- El rol `tester` (legacy) se trata como `supervisor` en el backend pero **no** en la web: un `tester` de Despacho no verá la ruta aunque el servidor lo deje pasar. Es una diferencia conocida, no probada con una cuenta real.
