# 0002. Capas con dominio puro y regla de ESLint

Última actualización: 2026-10-13 | Fuente: eslint.config.js, src/test/lint-boundaries.test.ts, docs/02-arquitectura/arquitectura-front.md | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-09 (registrada retroactivamente el 2026-10-13)

## Contexto

Las reglas de negocio (estados de foto, zonas, validación de confirmación, VIN) deben poder probarse sin navegador y no deben acoplarse a React ni a IndexedDB.

## Opciones consideradas

1. Organizar por tipo (`components`, `hooks`, `services`) como el portal.
2. Organizar por funcionalidad con capas explícitas y un dominio puro.

## Decisión

Opción 2: `domain/` (puro) → `api/` y `data/` → `camera/` y `components/` → `app/`. Una regla de ESLint hace **fallar el lint** si `domain/` importa React, Dexie, el router, capas superiores o globales del navegador, y una prueba comprueba la regla.

## Consecuencias

- El dominio se prueba en entorno `node`, rápido y sin dobles.
- Añadir una dependencia del navegador al dominio exige tocar la regla a propósito.
- Más carpetas y puertos (interfaces) que en un diseño plano.
