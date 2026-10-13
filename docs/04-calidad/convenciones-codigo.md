# Convenciones de código

Última actualización: 2026-10-13 | Fuente: eslint.config.js, tsconfig.app.json, código en src/ | Estado: vigente

## Idioma y nombres

- **Español** en la interfaz, los comentarios, los mensajes de error y los nombres de dominio (`ListaOrdenes`, `reintentarSubida`, `puedeCapturar`). Los tipos y APIs de librerías conservan su inglés.
- Archivos de componentes en `PascalCase.tsx`; el resto en `camelCase.ts`. Documentos y carpetas de `docs/` en `kebab-case`.
- Imports con el alias `@/…` entre carpetas; relativos dentro de la misma.

## Capas

- `domain/` puro (ver [lint-y-formato.md](../03-configuracion/lint-y-formato.md)).
- La lógica con estado va en un **controlador** de `data/` con `getSnapshot`/`suscribir`; el componente solo dibuja.
- Las dependencias externas (almacenamiento, cámara, red, reloj) entran **por puerto o por opción** para poder sustituirlas en las pruebas.

## TypeScript

- Modo estricto con `noUncheckedIndexedAccess`; `import type` para los tipos.
- Nada de excepciones para el flujo normal en captura y subida: los fallos vuelven como **resultados** con un mensaje para el operario.

## Comentarios

- Explican el **porqué** (una decisión, un incidente, una trampa del navegador), no el qué. Las decisiones llevan su fecha.
- Si citan un documento, usan la ruta actual en `docs/` y la sección.

## Pruebas

- Junto al código (`archivo.test.ts`). Cada comportamiento nuevo se verifica rompiéndolo (ver [pruebas-unitarias.md](pruebas-unitarias.md)).
- Cada componente nuevo, una prueba de accesibilidad con `vitest-axe`.

## Interfaz

- El color nunca es el único portador del estado; objetivos táctiles de 44 px; campos de 16 px.
- Todo texto de error le dice al operario **qué hacer**.
