# sum-temp-traslado — memoria del proyecto

Front web de **Traslados** de SUM Vehículos (salida y entrega de vehículos con fotos). Stack: Vite + React 19 + TypeScript estricto + Tailwind 4 + Dexie, pruebas con Vitest y Playwright, despliegue en Vercel. Solo con internet; iPhone y Android.

## Lectura de documentación

Antes de trabajar:
1. Lee @docs/ai/contexto-proyecto.md.
2. Lee @docs/ai/convenciones.md.
3. Consulta `docs/ai/comandos.md` antes de ejecutar comandos.
4. Revisa la última bitácora de `docs/ai/sesiones/` (la de fecha más reciente) y `TODO.md`.

Para localizar documentación específica, consulta `docs/00-indice.md`. Según la tarea:
- Alcance funcional y endpoints: `docs/01-vision-y-alcance/`
- Arquitectura, pantallas y sesión, estado y datos, cámara, subida, componentes: `docs/02-arquitectura/`
- Entorno local, HTTPS, variables, Vite, TypeScript o ESLint: `docs/03-configuracion/`
- Pruebas y calidad: `docs/04-calidad/`
- Despliegue (Vercel, CORS del bucket): `docs/05-despliegue/`
- Motivos de las decisiones técnicas: `docs/06-decisiones/`
- Pendientes y planificación: `docs/07-planificacion/estado-actual.md` y lo que enlaza

No leas toda la documentación ni todas las bitácoras por defecto: carga solo el contexto de la tarea.

La documentación orienta, pero lo que afirme sobre la implementación **se verifica en el código actual**. Si hay una contradicción, regístrala en `docs/ai/discrepancias.md`. Los mensajes para iniciar y cerrar una sesión están en `docs/ai/uso-con-llm.md`.

## Reglas
- **Ninguna prueba toca producción.** El backend local firma URLs del bucket `sum-fotos-prod` y `vercel.json` apunta al Cloud Run de producción. Subir fotos o confirmar de verdad, o cualquier cosa fuera de la base local, **se pregunta antes**.
- **Mover o editar `.md` está permitido; cualquier otro archivo se pregunta antes** (salvo lo que el usuario autorice expresamente).
- Hacer solo lo pedido; no editar archivos que no se pidieron.
- Commit y push solo cuando se pidan.
- No tocar `.env.local` ni `.certs/` ni mostrar sus valores.
- `domain/` es puro: no importa React, Dexie, el navegador ni capas superiores (ESLint lo exige).
- Antes de terminar: `npm run typecheck`, `npm run lint`, `npm test` y, si corresponde, `npm run build`.
- Cada comportamiento nuevo se verifica rompiéndolo a propósito (mutación); no dejar archivos `.bak`.
- Si cambia arquitectura, configuración, dependencias o despliegue: usar el skill `documentar-proyecto` en modo `actualizar`.
- Al cerrar la sesión: skill `documentar-proyecto` en modo `cierre-sesion` (cambios, verificaciones realmente ejecutadas, pendientes y siguiente paso).
