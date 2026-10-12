# Traslado web

Front web del flujo de Traslado (salida y entrega de vehículos con fotos), sobre el backend existente.
Diseño en [ARQUITECTURA-FRONT.md](ARQUITECTURA-FRONT.md), historias en [BACKLOG.md](BACKLOG.md), sprints en [PLAN-SPRINTS.md](PLAN-SPRINTS.md).

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

**En la PC no hace falta nada de esto**: usa `npm run dev`. Lo siguiente es solo para teléfonos, que entran por la IP de la red, y una IP por HTTP no es contexto seguro (`getUserMedia` queda bloqueado). Para eso se usa `npm run dev:https`, con dos caminos para el certificado.

### Camino recomendado: certificado de mkcert

1. Instalar mkcert en Windows (por ejemplo `winget install FiloSottile.mkcert`) y ejecutar `mkcert -install`.
2. En la raíz del proyecto, con la IP de tu PC (`ipconfig`):
   ```
   mkdir .certs
   mkcert -cert-file .certs/dev.pem -key-file .certs/dev-key.pem localhost 127.0.0.1 ::1 192.168.X.X
   ```
3. Arrancar con `npm run dev:https`. Vite usa esos archivos automáticamente. La carpeta `.certs/` no se versiona.
4. **iPhone:** pasar el archivo `rootCA.pem` (ubicación con `mkcert -CAROOT`) al teléfono, instalarlo en *Ajustes › General › VPN y gestión de dispositivos* y activarlo en *Ajustes › General › Información › Ajustes de confianza de certificados*.
5. **Android:** instalar `rootCA.pem` como certificado de CA. Chrome puede seguir mostrando avisos según la versión.
6. Abrir `https://192.168.X.X:5173` en el teléfono. La pantalla debe decir «Contexto seguro (HTTPS): sí».

### Camino de respaldo: certificado autofirmado

Sin `.certs/`, Vite genera uno autofirmado (`@vitejs/plugin-basic-ssl`). Sirve para ver la página, pero el teléfono mostrará una advertencia y **no se garantiza** que la cámara funcione. No lo uso como prueba válida de la cámara.

### Si el teléfono no llega a la PC

- Ambos deben estar en la misma red Wi-Fi.
- Permitir el puerto 5173 en el Firewall de Windows.
- Ojo: `dev:https` escucha en `0.0.0.0` y el proxy da acceso al backend local a quien esté en la misma red. Úsalo solo en redes de confianza. `npm run dev` escucha solo en `localhost`.

## Despliegue en Vercel (solo para ver las pantallas)

`vercel.json` ya trae la configuración: build de Vite, las rutas `/api/*` y `/mobile/*` reenviadas al backend (mismo origen para el navegador, como el proxy de Vite en desarrollo) y `index.html` para el resto de rutas, más `noindex`.

**Ojo: apunta al Cloud Run de PRODUCCIÓN** (`sum-backend-secado-gnsgzjfoqa-uc.a.run.app`). Todo lo que se haga ahí (iniciar sesión, tomar una orden, subir una foto, confirmar) es real. Se decidió usarlo **solo para ver las pantallas**; las pruebas del flujo se hacen en local.

1. En Vercel: *Add New › Project*, importar el repositorio. Framework «Vite»; no hacen falta variables de entorno.
2. Despliegue actual: **https://sum-traslado-app.vercel.app/**. Cada despliegue tiene una URL `https://<proyecto>.vercel.app` con HTTPS válido: sirve para abrirlo en el teléfono sin instalar certificados.
3. Para que el navegador pueda **subir fotos** al bucket, esa URL tendría que agregarse al CORS del bucket (pendiente D3, de quien administra GCP). Hoy no está.

## Herramientas de prueba (ocultas)

La home no muestra «Herramientas de prueba». Para verlas, abre la página con `?herramientas` al final de la dirección (por ejemplo `https://sum-traslado-app.vercel.app/?herramientas`, o `https://192.168.1.54:5173/?herramientas` en local). Traen la comprobación de HTTPS y cámara y «Probar la cámara», que solo guarda en el teléfono y **no sube nada**: es la forma segura de probar la cámara y la galería contra la versión desplegada, que apunta a producción.

## Estructura

```
src/
  app/                 arranque y pantalla raíz
  core/config/         URL base del API (relativa)
  core/http/           cliente HTTP: 401 → renovar y reintentar una vez, 403, tiempo límite
  core/ui/             tokens (en src/index.css) y componentes base: Button, Banner, Card, SectionHeader, ProgressCounter
  features/traslado/   (se crea con F-03 en adelante)
    domain/            reglas puras: sin React, sin navegador, sin capas superiores
  test/                configuración de pruebas
```

La carpeta `domain/` está protegida por ESLint: si importa React, Dexie, TanStack, el router, una capa superior o un global del navegador (`window`, `navigator`, `indexedDB`…), `npm run lint` falla. La prueba está en [src/test/lint-boundaries.test.ts](src/test/lint-boundaries.test.ts).

## Pruebas contra el backend real

Toda prueba que usa el backend va a la **base de desarrollo**, a través del backend en `http://localhost:8050`. Las credenciales de un usuario `operario` con `traslado` en `allowed_apps` van en `.env.local` (copia [.env.example](.env.example)); ese archivo **no se versiona**.

| Comando | Qué hace |
|---|---|
| `npm test` | Vitest. Incluye las pruebas de `*.backend.test.ts`, que se **omiten solas** si faltan las credenciales o si no hay backend. |
| `npm run test:e2e` | Playwright con el **Chrome y el Edge instalados** (no descarga navegadores), contra el servidor de Vite y el backend real. |

- El login admite **10 por minuto** y el refresh 20: no corras las pruebas contra el backend varias veces seguidas. Una corrida completa de `npm run test:e2e` hace unos 16 logins y **puede pasar el límite**: el backend responde «Demasiados intentos» y fallan las últimas pruebas (se ve en el aviso del login). Si pasa, corre los archivos por separado con un minuto entre corridas (`npx playwright test e2e/home.spec.ts`, etc.).
- Cada prueba que toma o confirma una orden la consume. Las de Traslado necesitan datos que el backend pueda regenerar. `e2e/vin.spec.ts` hace **10 logins en unos 40 segundos** (uno por prueba y navegador): está en el límite, así que no la corras junto a otro archivo de E2E. Las E2E que **toman órdenes** (`tomar`, `catalogo`) las devuelven al pool en un `afterAll` (`e2e/soltarPropias.ts`), también si fallan; si una corrida se corta de golpe, el usuario de prueba puede quedar con órdenes tomadas: se devuelven con «Soltar» o corriendo cualquiera de esas dos pruebas.
- La prueba `e2e/login.spec.ts` está marcada como **fallo esperado** mientras el backend de desarrollo emita la cookie de refresh con `SameSite=None` y sin `Secure` (el navegador la rechaza). Ver `PLAN-SPRINTS.md` §2.2.
