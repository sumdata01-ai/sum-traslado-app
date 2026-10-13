# Vite y Vitest (`vite.config.ts`)

Última actualización: 2026-10-13 | Fuente: vite.config.ts | Estado: vigente

## Dos modos de desarrollo

| Modo | Comando | Host | HTTPS |
|---|---|---|---|
| Normal | `npm run dev` | `localhost` | No |
| `https` | `npm run dev:https` (`--mode https`) | `0.0.0.0` | Sí: mkcert si existen `.certs/dev.pem` y `.certs/dev-key.pem`; si no, `@vitejs/plugin-basic-ssl` |

El plugin autofirmado se importa solo en el modo `https` y sin mkcert.

## Servidor

- Puerto **5173** con `strictPort: true`: si está ocupado falla en vez de saltar a otro (la URL del teléfono no debe cambiar). `preview` usa el **4174**.
- **Proxy:** `/api` y `/mobile` van a `VITE_PROXY_TARGET` (por defecto `http://localhost:8050`) con `changeOrigin`. Es el equivalente en desarrollo de los `rewrites` de Vercel.
- Alias `@` → `./src`.
- `build.target`: `es2022`.
- Plugins: `@vitejs/plugin-react` y `@tailwindcss/vite`.

## Vitest (en el mismo archivo)

| Opción | Valor |
|---|---|
| `environment` | `jsdom` (cada archivo puede pedir `node` con `// @vitest-environment node`) |
| `setupFiles` | `./src/test/setup.ts` |
| `include` | `src/**/*.{test,spec}.{ts,tsx}` |
| `css` | `false` |
| `testTimeout` / `hookTimeout` | 15 000 ms |
| `env` | las variables `TRASLADO_*` de `.env.local` |

Las E2E (`e2e/`) no las corre Vitest: las corre Playwright.
