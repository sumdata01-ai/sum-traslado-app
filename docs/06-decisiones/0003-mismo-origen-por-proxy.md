# 0003. Mismo origen para el backend: proxy de Vite y rewrites de Vercel

Última actualización: 2026-10-13 | Fuente: vite.config.ts, vercel.json, src/core/config/apiBase.ts | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-09 (registrada retroactivamente el 2026-10-13)

## Contexto

El login usa una cookie de refresh que rota. Entre orígenes distintos exige CORS con credenciales y `SameSite=None; Secure`; además un teléfono no alcanza el `localhost` de la PC. Esta es la decisión D1 = A del plan.

## Opciones consideradas

1. Llamar al backend por su URL con CORS y cookies de terceros.
2. Que el navegador hable solo con su propio servidor, que reenvía `/api` y `/mobile`.

## Decisión

Opción 2: el código usa **rutas relativas** (`src/core/config/apiBase.ts`). En desarrollo reenvía el proxy de Vite (`/api`, `/mobile` → `VITE_PROXY_TARGET`, por defecto `:8050`); desplegado, los `rewrites` de `vercel.json`.

## Consecuencias

- No hay CORS contra el backend y la cookie de refresh viaja como del mismo sitio (confirmado en iPhone desde Vercel).
- Las rutas de la app no pueden empezar por `/api` ni `/mobile`.
- En local contra el backend de desarrollo la cookie no se guarda en Chrome y Edge (`SameSite=None` sin `Secure` en ese backend): se pidió el cambio al backend.
- La única excepción es el PUT a GCS ([ADR 0006](0006-subida-directa-a-gcs.md)).
