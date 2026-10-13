# Comandos verificados

Última actualización: 2026-10-13 | Fuente: package.json, playwright.config.ts, sesiones de trabajo | Estado: vigente

Todos salen de `package.json` o se usaron en las sesiones de trabajo. Se ejecutan en la raíz del proyecto.

| Para | Comando |
|---|---|
| Desarrollo (PC) | `npm run dev` |
| Desarrollo con HTTPS para teléfono | `npm run dev:https` |
| Build de producción (tipos + Vite) | `npm run build` |
| Previsualizar el build | `npm run preview` · `npm run preview:https` |
| Lint | `npm run lint` |
| Tipos | `npm run typecheck` |
| Pruebas (una pasada) | `npm test` |
| Pruebas en observación | `npm run test:watch` |
| Una prueba o carpeta | `npx vitest run src/features/traslado/domain/vin` |
| E2E (todas) | `npm run test:e2e` (puede pasar el límite de logins) |
| Un archivo E2E en Chrome | `npx playwright test e2e/home.spec.ts --project=chrome` |
| Dependencias instaladas | `npm install` |

## Antes de entregar un cambio
```
npm run typecheck
npm run lint
npm test
npm run build
```

## Git (solo si se pide)
```
git status --short
git add -A
git commit
git push origin main
```
Remoto: `origin` = `https://github.com/sumdata01-ai/sum-traslado-app.git`, rama `main`. Vercel despliega cada push a `main`.

## Comprobaciones útiles
| Para | Comando |
|---|---|
| Que no queden restos de mutación | `find src -name "*.bak"` |
| Citas a documentos movidos | `grep -rnE "arquitectura-front\|patron-traslado-web\|plan-sprints" src eslint.config.js` |
| Que las pruebas con el backend real no dejaron órdenes tomadas | Consultar `GET /mobile/traslado/mis-ordenes` con el usuario de prueba y contar las `pendiente` con `conductor_asignado` (debe dar 0). Solo contra el backend **local**. |
| Puertos ocupados (5173) | `npm run dev` falla a propósito si está ocupado (`strictPort`) |
