# Pruebas de extremo a extremo (Playwright)

Última actualización: 2026-10-13 | Fuente: playwright.config.ts, e2e/ | Estado: vigente

## Configuración

- Usa los navegadores **instalados** (Chrome y Edge, `channel: 'chrome'` y `'msedge'`); no descarga navegadores.
- `workers: 1`, `fullyParallel: false`, `retries: 0`. Comparten la cuenta de prueba.
- Levanta `npm run dev` (reusa el servidor si ya corre en `http://localhost:5173`).
- Van contra el **backend de desarrollo local**. Las credenciales salen de `.env.local`; sin ellas las pruebas se omiten.

## Archivos

| Archivo | Qué cubre | Notas |
|---|---|---|
| `login.spec.ts` | Login y recarga | Marcada como **fallo esperado** (`test.fail`) mientras el backend de desarrollo emita la cookie de refresh con `SameSite=None` sin `Secure`. |
| `home.spec.ts` | Home con órdenes reales | Se omite si no hay órdenes disponibles hoy. |
| `pestanas.spec.ts` | Una sola sesión entre dos pestañas (A-03) | — |
| `tomar.spec.ts` | Tomar y soltar una orden | Toma una orden **real** del pool de desarrollo y la devuelve. |
| `catalogo.spec.ts` | Elegir placa y proveedor | Ídem. |
| `vin.spec.ts` | Búsqueda por VIN | Hace unos 10 logins en 40 s. |
| `subida.spec.ts` | Subir una foto al bucket | **Apagada por defecto**: el backend local firma URLs del bucket de **producción**. Solo corre con `TRASLADO_BUCKET_DE_PRUEBA=si` y aun así aborta cualquier PUT a un bucket con «prod» en el nombre. |
| `soltarPropias.ts` | Utilidad de limpieza | Devuelve al pool las órdenes `pendiente` del usuario de prueba, en un `afterAll`. |

## Límites del backend

El login admite **10 por minuto** y el refresh 20. Una corrida completa de `npm run test:e2e` puede pasar el límite (el aviso del login dice «Demasiados intentos»). Se corre **un archivo a la vez**, con un minuto entre corridas:

```
npx playwright test e2e/home.spec.ts --project=chrome
```

## Reglas

- Una E2E que toma órdenes las devuelve siempre (`afterAll`), también si falla.
- **Ninguna prueba toca producción** ([ADR 0008](../06-decisiones/0008-no-tocar-produccion.md)). La confirmación real (`confirmar-salida`/`confirmar-entrega`) no tiene E2E por esa razón.
- Una E2E que toca una cámara usa la cámara simulada de Chromium (`--use-fake-device-for-media-stream`).
