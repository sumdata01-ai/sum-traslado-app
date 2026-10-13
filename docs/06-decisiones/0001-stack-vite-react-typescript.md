# 0001. Vite, React 19 y TypeScript estricto

Última actualización: 2026-10-13 | Fuente: package.json, tsconfig.app.json, vite.config.ts | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-09 (registrada retroactivamente el 2026-10-13)

## Contexto

Se necesita un front web nuevo que corra bien en Safari de iPhone y en Chrome de Android, con la cámara dentro de la página y mucha lógica de estado local. El portal de SUM (`sum-portal-front`) usa React, pero con `strict: false`.

## Opciones consideradas

1. Reutilizar la configuración del portal tal cual (`strict: false`).
2. Un framework con servidor (Next.js): innecesario, la app es una SPA que habla con un backend existente.
3. Vite + React + TypeScript estricto, con el mismo alias `@/*` del portal.

## Decisión

Opción 3: Vite 8, React 19, TypeScript estricto (`strict`, `noUncheckedIndexedAccess`), Tailwind 4 y Vitest/Playwright para las pruebas.

## Consecuencias

- Los errores de tipos rompen el build (también en Vercel).
- Se mantiene la familiaridad con el portal (alias, herramientas) sin heredar su laxitud.
- Sin servidor propio: todo lo dinámico va por el backend existente.
