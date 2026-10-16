# Pruebas de extremo a extremo (Playwright)

Última actualización: 2026-10-15 | Fuente: playwright.config.ts, e2e/ | Estado: vigente

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
| `seguimiento.spec.ts` | Vista del coordinador: entrar por rol, tabla y detalle en escritorio, lista y detalle a 360 px sin desborde, recargar con la sesión viva | **No usa el backend**: `/api/*` y `/mobile/*` se responden en la propia prueba (el endpoint no existe todavía), así que no toca la base ni el bucket y no gasta logins. Falla ante cualquier error de JavaScript de la página. Solo intercepta rutas que **empiezan** por `/api/` o `/mobile/`: los módulos de código también tienen carpetas `api/`. Con `SEGUIMIENTO_CAPTURAS=<carpeta>` guarda capturas. |
| `llegada.spec.ts` | «Marcar llegada»: el QR se lee de verdad (zxing) de una «cámara» que dibuja un QR, la ubicación la simula Playwright, el servidor es falso | **No usa el backend** ni registra llegadas. Comprueba el cuerpo exacto (cuatro campos, texto del QR tal cual, `Authorization`), el rechazo, el 403 sin cerrar la sesión y 360 px sin desborde. Lo único simulado de la cámara es `getUserMedia`. |
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
