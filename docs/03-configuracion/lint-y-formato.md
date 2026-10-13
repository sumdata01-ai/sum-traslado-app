# Lint y formato

Última actualización: 2026-10-13 | Fuente: eslint.config.js, package.json | Estado: vigente

## ESLint (`eslint.config.js`, formato plano)

- Reglas base: `@eslint/js` recomendadas, `typescript-eslint` recomendadas y `eslint-plugin-react-hooks` (incluye reglas de React 19 como `set-state-in-effect`).
- Ignora `dist`, `coverage`, `playwright-report`, `test-results` y `.certs`.
- Globales de navegador para `**/*.{ts,tsx}` y de Node para `vite.config.ts`, `eslint.config.js`, `playwright.config.ts` y `e2e/`.

## El dominio es puro

En `src/features/**/domain/**` el lint **falla** si se importa React, el router, Dexie, TanStack, `@/app`, `@/core` o las capas `data`, `api`, `camera`, `components` de la funcionalidad, o si se usa `window`, `document`, `navigator`, `localStorage`, `sessionStorage` o `indexedDB`. La prueba [`src/test/lint-boundaries.test.ts`](../../src/test/lint-boundaries.test.ts) comprueba que la regla realmente se activa.

## Formato

No hay formateador configurado (ni Prettier en `package.json` ni reglas de estilo en ESLint). TODO(verificar): decidir si se añade uno.
