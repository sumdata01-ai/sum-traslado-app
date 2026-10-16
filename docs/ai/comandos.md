# Comandos verificados

Última actualización: 2026-10-15 | Fuente: package.json, playwright.config.ts, sesiones de trabajo, `sum-bck-modulos` (`conftest.py`) | Estado: vigente

Todos salen de `package.json` o se usaron en las sesiones de trabajo. Se ejecutan en la raíz del proyecto.

| Para | Comando |
|---|---|
| Desarrollo (PC) | `npm run dev` |
| Desarrollo con HTTPS para teléfono | `npm run dev:https` |
| Build de producción (tipos + Vite) | `npm run build` |
| Previsualizar el build | `npm run preview` · `npm run preview:https` |
| Lint | `npm run lint` |
| Tipos | `npm run typecheck` |
| Pruebas (una pasada) | `npm test` (**con el backend `:8050` encendido ejecuta también las pruebas contra el backend real**; ver la fila siguiente) |
| Pruebas **sin** las del backend real | `npx vitest run --exclude "**/*.backend.test.ts"` (lo seguro con `:8050` encendido) |
| Pruebas en observación | `npm run test:watch` |
| Una prueba o carpeta | `npx vitest run src/features/traslado/domain/vin` |
| E2E (todas) | `npm run test:e2e` (puede pasar el límite de logins) |
| Un archivo E2E en Chrome | `npx playwright test e2e/home.spec.ts --project=chrome` |
| E2E **sin backend** (vista del coordinador; segura con `:8050` encendido, no gasta logins) | `npx playwright test e2e/seguimiento.spec.ts --project=chrome` (o `edge`); añade `--headed` para verla en pantalla |
| E2E de «Marcar llegada» (sin backend, con lector de QR real y ubicación simulada; segura con `:8050` encendido) | `npx playwright test e2e/llegada.spec.ts --project=chrome` (o `edge`) |
| E2E del tablero de llegadas (sin backend; segura con `:8050` encendido) | `npx playwright test e2e/tablero.spec.ts --project=chrome` (o `edge`) |
| Capturas de esa E2E | Con la variable `SEGUIMIENTO_CAPTURAS=<carpeta fuera del repositorio>` antes del comando |
| Dependencias instaladas | `npm install` |

## Backend (`sum-bck-modulos`, repositorio hermano)
El usuario confirmó (2026-10-15) que **siempre** lo arranca así, con la base de la réplica local de pruebas (PowerShell, desde la carpeta del backend):
```
$env:DB_HOST="localhost"; $env:DB_PORT="5434"; $env:DB_NAME="sum_test"
$env:DB_USER=<usuario de la réplica>; $env:DB_PASSWORD=<clave de la réplica>; $env:DB_SSLMODE="disable"
venv\Scripts\python -m uvicorn main:app --port 8050 --reload
```
| Para | Comando |
|---|---|
| Pruebas del backend contra la réplica local | `$env:TEST_DB_PORT=5434; python -m pytest tests -q` (sin la variable usa el puerto 5433) |
| Una rama aparte sin tocar la carpeta principal | `git worktree add ..\sum-bck-modulos-<tema> -b <rama> refs/remotes/origin/main`; el `venv` de la carpeta principal sirve (`<principal>\venv\Scripts\python.exe -m pytest …`) |
| Comparar una suite antes de un merge | Dos copias temporales con `git worktree add --detach <ruta corta> <rama>` (base y mezcla), la suite en cada una con `-rf`, y comparar las líneas `FAILED` |
| Nombre de la rama remota | Usar la ruta completa `refs/remotes/origin/main`: `origin/main` a secas falló en `git rev-parse` |

## Git: dos tropiezos en Windows
- `git merge` **no lee el mensaje por la entrada estándar** (`-F -` falla con «could not read file '-'»): escribirlo en un archivo temporal y usar `-F archivo`. `git commit -F -` sí lo admite.
- `git worktree add` falla con «Could not reset index file» si la ruta es muy larga (la del directorio temporal de la sesión lo es): usar una corta, como `%TEMP%\copia`.

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
