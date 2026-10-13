# Variables de entorno

Última actualización: 2026-10-13 | Fuente: .env.example, vite.config.ts, src/core/config/apiBase.ts, e2e/ | Estado: vigente

Ninguna variable es necesaria para ejecutar `npm run dev` o `npm run build`. Las `TRASLADO_*` solo se usan en pruebas y no entran al código publicado (no llevan prefijo `VITE_`). Los valores van en `.env.local`, que no se versiona.

| Variable | Dónde se lee | Uso | ¿Requerida? | Ejemplo |
|---|---|---|---|---|
| `TRASLADO_USUARIO` | Vitest y Playwright | Usuario de **prueba** (rol `operario`, `traslado` en `allowed_apps`) de la base de desarrollo. | Solo para las pruebas contra el backend (se omiten solas sin ella). | `usuario.prueba` |
| `TRASLADO_CLAVE` | Vitest y Playwright | Clave de ese usuario. | Ídem. | *(secreto)* |
| `VITE_PROXY_TARGET` | `vite.config.ts` | A qué backend reenvía el proxy de desarrollo. | No (por defecto `http://localhost:8050`). | `http://localhost:8050` |
| `VITE_API_URL` | `src/core/config/apiBase.ts` | URL base del API en lugar de la ruta relativa. «Escape explícito»: normalmente vacía. | No. | *(vacía)* |
| `TRASLADO_BACKEND_URL` | `e2e/soltarPropias.ts` | Backend para la limpieza de las E2E que toman órdenes. | No (por defecto `http://localhost:8050`). | `http://localhost:8050` |
| `TRASLADO_BUCKET_DE_PRUEBA` | `e2e/subida.spec.ts` | `si` activa la E2E de subida. **Apagada por defecto** porque el backend local firma URLs del bucket de producción. | No. | `si` |

> `.env.example` solo trae `TRASLADO_USUARIO`, `TRASLADO_CLAVE` y `VITE_PROXY_TARGET` (comentada). Las otras tres salen del código. TODO(verificar): decidir si se añaden al ejemplo.

**Vercel** no necesita variables de entorno.

Nunca uses credenciales de producción en `.env.local`.
