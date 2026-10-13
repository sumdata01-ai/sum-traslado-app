# TypeScript

Última actualización: 2026-10-13 | Fuente: tsconfig.json, tsconfig.app.json, tsconfig.node.json | Estado: vigente

Hay tres archivos con referencias de proyecto (`tsc -b`):

| Archivo | Cubre | Notas |
|---|---|---|
| `tsconfig.json` | Solo referencias | — |
| `tsconfig.app.json` | `src/` | `target` ES2022, `jsx: react-jsx`, `moduleResolution: bundler`, `types: vite/client, node`, alias `@/*` → `./src/*`. |
| `tsconfig.node.json` | `vite.config.ts`, `playwright.config.ts`, `e2e/**/*.ts` | `target` ES2023, tipos de Node. |

## Estricto desde el primer día

`strict: true`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` (los tipos se importan con `import type` o `type`). El portal tiene `strict` en `false`; aquí no.

`npm run build` ejecuta `tsc -b` antes de `vite build`, así que un error de tipos rompe el build (también en Vercel).
