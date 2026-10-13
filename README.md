# Traslado web

Front web del flujo de Traslado (salida y entrega de vehículos con fotos), sobre el backend existente.
**Documentación:** empieza por el [índice](docs/00-indice.md). Estado y pendientes en [TODO.md](TODO.md); historias en [backlog.md](docs/07-planificacion/backlog.md); decisiones en [docs/06-decisiones/](docs/06-decisiones/). Si usas un asistente (Claude Code, Codex), lee antes [CLAUDE.md](CLAUDE.md) o [AGENTS.md](AGENTS.md).

## Requisitos

- Node 24 y npm 11 (probado con `v24.19.0` y `11.17.0`).
- El backend corriendo en `http://localhost:8050`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `http://localhost:5173`, solo para esta PC. **Sin certificado**: en `localhost` la cámara funciona por HTTP. Es el puerto del portal: no correr ambos a la vez. |
| `npm run dev:https` | Igual, pero por **HTTPS** y accesible desde la red. Es el que se usa para probar con un teléfono. |
| `npm run build` | Typecheck estricto y build de producción en `dist/`. |
| `npm run preview` / `npm run preview:https` | Sirve `dist/` en el puerto 4174, por HTTP o por HTTPS. |
| `npm run lint` | ESLint, incluida la regla de capas del dominio. |
| `npm run typecheck` | `tsc -b` con `strict: true`. |
| `npm test` | Vitest. |

## Cómo se conecta con el backend

El navegador solo habla con el servidor de Vite. Vite reenvía `/api/*` y `/mobile/*` a `http://localhost:8050`.

- No hay CORS en desarrollo, porque para el navegador todo es un solo origen.
- La cookie de refresh del login (opción A, `/api/login`) viaja como cookie del mismo sitio.
- Las rutas de la aplicación no deben empezar por `/api` ni por `/mobile`.
- Para apuntar a otro backend: `VITE_PROXY_TARGET=http://otro-host:8050 npm run dev`.

En producción el equivalente será un proxy nginx delante del API (historia D2). Por eso el código usa **rutas relativas** y no una URL fija ([src/core/config/apiBase.ts](src/core/config/apiBase.ts)).

## Probar desde un celular (HTTPS)

Una IP de red por HTTP no es contexto seguro y el navegador bloquea la cámara. En la PC usa `npm run dev`. Para un teléfono en la red local se usa `npm run dev:https` con un certificado de mkcert: los pasos (PC, iPhone y Android, firewall, qué hacer si cambia la IP) están en [docs/03-configuracion/https-local.md](docs/03-configuracion/https-local.md). Para ver la versión desplegada en el teléfono no hace falta ningún certificado.

## Despliegue en Vercel (solo para ver las pantallas)

`vercel.json` ya trae la configuración: build de Vite, las rutas `/api/*` y `/mobile/*` reenviadas al backend (mismo origen para el navegador, como el proxy de Vite en desarrollo) y `index.html` para el resto de rutas, más `noindex`.

**Ojo: apunta al Cloud Run de PRODUCCIÓN** (`sum-backend-secado-gnsgzjfoqa-uc.a.run.app`). Todo lo que se haga ahí (iniciar sesión, tomar una orden, subir una foto, confirmar) es real. Se decidió usarlo **solo para ver las pantallas**; las pruebas del flujo se hacen en local.

1. En Vercel: *Add New › Project*, importar el repositorio. Framework «Vite»; no hacen falta variables de entorno.
2. Despliegue actual: **https://sum-traslado-app.vercel.app/**. Cada despliegue tiene una URL `https://<proyecto>.vercel.app` con HTTPS válido: sirve para abrirlo en el teléfono sin instalar certificados.
3. Para que el navegador pueda **subir fotos** al bucket, esa URL tendría que agregarse al CORS del bucket (pendiente D3, de quien administra GCP). Hoy no está.

## Herramientas de prueba (ocultas)

La home no muestra «Herramientas de prueba». Para verlas, abre la página con `?herramientas` al final de la dirección (por ejemplo `https://sum-traslado-app.vercel.app/?herramientas`, o `https://192.168.X.X:5173/?herramientas` en local). Traen la comprobación de HTTPS y cámara y «Probar la cámara», que solo guarda en el teléfono y **no sube nada**: es la forma segura de probar la cámara y la galería contra la versión desplegada, que apunta a producción.

## Estructura

```
src/
  app/                 pantallas raíz y composición (App, AppShell, HomePage, CapturaPage…)
  core/                auth, config, http, storage y ui (componentes base y tokens)
  features/traslado/
    domain/            reglas puras: sin React, sin navegador, sin capas superiores
    api/               clientes del backend y de GCS, con esquemas zod
    data/              controladores, puertos y Dexie
    camera/            sesión de cámara, captura, galería y escáner
    components/        componentes de la funcionalidad
  test/                configuración de pruebas
e2e/                   pruebas de extremo a extremo (Playwright)
docs/                  documentación; ver docs/00-indice.md
```

El detalle de cada carpeta está en [docs/02-arquitectura/estructura-src.md](docs/02-arquitectura/estructura-src.md). La carpeta `domain/` está protegida por ESLint: si importa React, Dexie, TanStack, el router, una capa superior o un global del navegador (`window`, `navigator`, `indexedDB`…), `npm run lint` falla. La prueba está en [src/test/lint-boundaries.test.ts](src/test/lint-boundaries.test.ts).

## Pruebas contra el backend real

> **Ninguna prueba toca producción.** El backend local firma las URLs de subida del bucket de **producción**, así que subir fotos y confirmar de verdad no se prueba (ver [ADR 0008](docs/06-decisiones/0008-no-tocar-produccion.md)).

Toda prueba que usa el backend va a la **base de desarrollo**, a través del backend en `http://localhost:8050`. Las credenciales de un usuario `operario` con `traslado` en `allowed_apps` van en `.env.local` (copia [.env.example](.env.example)); ese archivo **no se versiona**.

| Comando | Qué hace |
|---|---|
| `npm test` | Vitest. Incluye las pruebas de `*.backend.test.ts`, que se **omiten solas** si faltan las credenciales o si no hay backend. |
| `npm run test:e2e` | Playwright con el **Chrome y el Edge instalados** (no descarga navegadores), contra el servidor de Vite y el backend real. |

- El login admite **10 por minuto** y el refresh 20: no corras las pruebas contra el backend varias veces seguidas. Una corrida completa de `npm run test:e2e` hace unos 16 logins y **puede pasar el límite**: el backend responde «Demasiados intentos» y fallan las últimas pruebas (se ve en el aviso del login). Si pasa, corre los archivos por separado con un minuto entre corridas (`npx playwright test e2e/home.spec.ts`, etc.).
- Cada prueba que toma o confirma una orden la consume. Las de Traslado necesitan datos que el backend pueda regenerar. `e2e/vin.spec.ts` hace **10 logins en unos 40 segundos** (uno por prueba y navegador): está en el límite, así que no la corras junto a otro archivo de E2E. Las E2E que **toman órdenes** (`tomar`, `catalogo`) las devuelven al pool en un `afterAll` (`e2e/soltarPropias.ts`), también si fallan; si una corrida se corta de golpe, el usuario de prueba puede quedar con órdenes tomadas: se devuelven con «Soltar» o corriendo cualquiera de esas dos pruebas.
- La prueba `e2e/login.spec.ts` está marcada como **fallo esperado** mientras el backend de desarrollo emita la cookie de refresh con `SameSite=None` y sin `Secure` (el navegador la rechaza). Ver `plan-sprints.md` §2.2.
