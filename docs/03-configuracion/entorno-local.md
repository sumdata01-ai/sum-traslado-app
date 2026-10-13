# Entorno local

Última actualización: 2026-10-13 | Fuente: package.json, vite.config.ts, README.md | Estado: vigente

## Requisitos

- **Node 24 y npm 11** (probado con `v24.19.0` y `11.17.0`). El proyecto no declara `engines` en `package.json`.
- El **backend de desarrollo en `http://localhost:8050`** (base de datos de desarrollo, local).
- Para las pruebas contra el backend real: credenciales de un usuario `operario` con `traslado` en `allowed_apps`, en `.env.local` (ver [variables-entorno.md](variables-entorno.md)).

## Primer arranque

```
npm install
npm run dev
```

Abre `http://localhost:5173`. En `localhost` la cámara funciona sin HTTPS porque el navegador lo trata como contexto seguro.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de Vite en `http://localhost:5173`, solo para esta PC. Es el puerto del portal: no correr ambos a la vez. |
| `npm run dev:https` | Igual, pero por **HTTPS** y accesible desde la red (para probar con un teléfono). Ver [https-local.md](https-local.md). |
| `npm run build` | `tsc -b` (typecheck estricto) y build de producción en `dist/`. |
| `npm run preview` / `npm run preview:https` | Sirve `dist/` en el puerto 4174, por HTTP o HTTPS. |
| `npm run lint` | ESLint, incluida la regla de capas del dominio. |
| `npm run typecheck` | `tsc -b`. |
| `npm test` | Vitest (una pasada). |
| `npm run test:watch` | Vitest en modo observación. |
| `npm run test:e2e` | Playwright con el Chrome y el Edge instalados. |

## Cómo se conecta con el backend

El navegador solo habla con el servidor de Vite, que reenvía `/api/*` y `/mobile/*` a `http://localhost:8050`. Para otro backend: `VITE_PROXY_TARGET=http://otro-host:8050 npm run dev`. Las rutas de la aplicación no deben empezar por `/api` ni `/mobile`.

## Archivos locales que no se versionan

`.env.local` (credenciales de prueba), `.certs/` (certificados de mkcert), `node_modules/`, `dist/`, `test-results/`. **Nunca** se documentan sus valores.

## Carpeta en OneDrive

El repositorio vive dentro de OneDrive. Conviene excluir `node_modules` de la sincronización; de lo contrario puede bloquear archivos mientras corren el build o las pruebas. Ese ajuste es de cada persona, no del repositorio.
