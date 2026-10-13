---
name: documentar-proyecto
description: Documenta el frontend de sum-temp-traslado (Vite + React 19 + TypeScript + Dexie, Vitest, Playwright, Vercel) en su estado actual, mantiene ordenada la documentación en docs/ y conserva la memoria del proyecto para sesiones con LLM (Claude Code / Codex). Úsalo cuando se pida documentar, actualizar docs, registrar una decisión técnica, iniciar o cerrar una sesión de trabajo, o cuando cambie la arquitectura, las dependencias, las rutas, las variables de entorno o el flujo de despliegue.
---

# Skill: Documentación y memoria del proyecto sum-temp-traslado

## Objetivo
1. Documentar la implementación REAL del frontend (lo que dice el código, no lo que se planeó).
2. Mantener una estructura de documentación estándar que soporte cambios futuros.
3. Mantener una memoria persistente para sesiones con LLM, de modo que no haya que repetir el contexto en cada sesión.

## Reglas generales
- La fuente de verdad es el código. Si un `.md` contradice al código, manda el código; anota la diferencia en `docs/ai/discrepancias.md`.
- No inventar. Si algo no se puede deducir, márcalo como `> TODO(verificar): ...`.
- Idioma: español. Nombres de archivos y carpetas en `kebab-case`.
- Ningún secreto en la documentación: de `.env.local` y `.certs/` solo se documenta el NOMBRE de las variables o archivos, nunca su valor. Tampoco rutas personales (la de OneDrive) ni IPs concretas.
- No leer `node_modules/`, `dist/` ni `test-results/` (solo mencionar para qué sirven).
- **Mover o editar archivos `.md` está permitido** (usar `git mv` para conservar el historial). **Cualquier otro archivo se pregunta antes**, salvo lo que el usuario autorice expresamente (por ejemplo, actualizar los comentarios del código que citan un `.md` movido).
- **Al mover o renombrar un `.md`, buscar sus citas** en el código y la configuración (`grep -rn "nombre-viejo" src e2e eslint.config.js`), porque hay comentarios que lo nombran con su sección. Cambiarlas requiere autorización (no son `.md`).
- **Ninguna prueba ni comando toca producción.** Si una tarea de documentación pide verificar algo contra el backend, el bucket o Vercel, preguntar antes.
- Cada documento empieza con un encabezado de metadatos:
  `Última actualización: YYYY-MM-DD | Fuente: <archivos revisados> | Estado: vigente/borrador`.
- Usar diagramas Mermaid (contexto/contenedores, flujos, secuencias, estados) en lugar de imágenes.
- No dejar archivos temporales en el repositorio: los scripts de apoyo van en el directorio temporal de la sesión.

## Estructura objetivo (la que existe hoy)
```
/
├── README.md                      entrada: qué es, cómo levantarlo, enlaces a docs/
├── CLAUDE.md                      memoria para Claude Code (corto, importa docs/ai/*)
├── AGENTS.md                      memoria para Codex (mismo contenido, enlaces normales)
├── CHANGELOG.md                   Keep a Changelog
├── TODO.md                        lista viva y registro de avances (se queda en la raíz)
└── docs/
    ├── 00-indice.md
    ├── 01-vision-y-alcance/       vision-y-alcance.md, patron-traslado-web.md
    ├── 02-arquitectura/           vision-general, estructura-src, navegacion-y-sesion,
    │                              estado-y-datos, camara-y-fotos, subida-y-confirmacion,
    │                              componentes, estilos-y-ui, arquitectura-front (diseño original)
    ├── 03-configuracion/          entorno-local, https-local, variables-entorno, build-vite,
    │                              typescript, lint-y-formato
    ├── 04-calidad/                pruebas-unitarias, pruebas-e2e, convenciones-codigo
    ├── 05-despliegue/             vercel.md
    ├── 06-decisiones/             ADR (MADR): 0000-plantilla.md, 0001-…
    ├── 07-planificacion/          estado-actual.md, backlog.md, plan-sprints.md
    └── ai/                        contexto-proyecto, convenciones, comandos, glosario,
                                   discrepancias, sesiones/ (bitácoras)
```
Diferencias con el esquema genérico del skill: no hay router (`navegacion-y-sesion.md` reemplaza a `enrutamiento.md`); hay dos documentos de visión (carpeta en vez de archivo); se añaden `camara-y-fotos.md`, `subida-y-confirmacion.md`, `https-local.md` y `pruebas-unitarias.md`.

## Modos de operación

### Modo `inicial`
Ya se ejecutó el 2026-10-13. Solo se repite si se rehace la documentación desde cero.
1. Inventario: `package.json`, `vite.config.ts` (incluye Vitest), `tsconfig*.json`, `eslint.config.js`, `playwright.config.ts`, `vercel.json`, `index.html`, `.env.example`, `.gitignore`, el árbol de `src/` y `e2e/`.
2. Leer los `.md` existentes.
3. **Presentar un PLAN antes de escribir** y esperar confirmación.
4. Generar `docs/` reutilizando (no duplicando) el contenido existente.
5. ADRs retroactivos de las decisiones evidentes.
6. `CLAUDE.md`, `AGENTS.md` y `docs/ai/*`.
7. Actualizar `README.md` como puerta de entrada.
8. Verificar: enlaces relativos y comandos contra `package.json`.
9. Registrar la sesión en `docs/ai/sesiones/`.

### Modo `actualizar` (después de cambios)
1. Ver qué cambió: `git diff --name-only` contra la última sesión registrada (o el commit indicado) y `git status --short`.
2. Ubicar los documentos afectados con este mapa:
   - `package.json` → `docs/ai/comandos.md`, `docs/03-configuracion/entorno-local.md`, ADR si es una dependencia relevante
   - `vite.config.ts` → `docs/03-configuracion/build-vite.md`
   - `tsconfig*` → `typescript.md` · `eslint.config.js` → `lint-y-formato.md`
   - `src/core/auth`, `src/app` → `navegacion-y-sesion.md`
   - `src/features/traslado/data`, `src/features/traslado/api`, `src/core/http` → `estado-y-datos.md`, `subida-y-confirmacion.md`
   - `src/features/traslado/camera`, `components` → `camara-y-fotos.md`, `componentes.md`
   - `src/features/traslado/domain` → `estructura-src.md`, `docs/ai/glosario.md`
   - `src/index.css`, `src/core/ui` → `estilos-y-ui.md`
   - Pruebas (`*.test.ts(x)`, `src/test`) → `pruebas-unitarias.md`; `e2e/`, `playwright.config.ts` → `pruebas-e2e.md`
   - `vercel.json` → `docs/05-despliegue/vercel.md`
   - `.env.example` o variables nuevas en el código → `variables-entorno.md`
   - Una decisión nueva → modo `decision`
3. Actualizar solo esas secciones y su fecha de metadatos, `CHANGELOG.md` (sección Unreleased) y, si cambia algo estructural, `docs/ai/contexto-proyecto.md` y `docs/07-planificacion/estado-actual.md`.

### Modo `decision` (nueva ADR)
Crear `docs/06-decisiones/NNNN-titulo.md` en formato MADR (Contexto, Opciones consideradas, Decisión, Consecuencias, Estado). Enlazarla desde `docs/00-indice.md`.

### Modo `inicio-sesion`
1. Leer `CLAUDE.md` (o `AGENTS.md`), `docs/ai/contexto-proyecto.md`, `docs/ai/convenciones.md` y la última bitácora en `docs/ai/sesiones/` (la de fecha más reciente).
2. Leer `TODO.md` y `docs/07-planificacion/estado-actual.md`.
3. **Contrastar con el código y con Git** (`git status --short`, `git log --oneline -5`): la documentación orienta, el código manda. Una contradicción va a `docs/ai/discrepancias.md`.
4. Responder con un resumen de 5 a 10 líneas: estado, pendientes de la última sesión y sugerencia de siguiente paso.
5. **No modificar archivos** hasta que el usuario confirme la tarea.
6. **No leer toda la documentación ni todas las bitácoras**: para la tarea concreta, abrir `docs/00-indice.md` y solo los documentos relacionados (ver `docs/ai/uso-con-llm.md`).

### Modo `cierre-sesion`
1. Crear `docs/ai/sesiones/YYYY-MM-DD-<tema>.md` con la plantilla (`docs/ai/sesiones/_plantilla.md`). Registrar los cambios, **las verificaciones realmente ejecutadas con su resultado (y las que no se hicieron)**, los pendientes y un **siguiente paso concreto**.
2. Si se aprendió algo duradero (convención, comando, error frecuente y su solución), pasarlo a `docs/ai/convenciones.md` o `comandos.md`. La bitácora es temporal; la memoria duradera vive en `docs/ai/`.
3. Actualizar `TODO.md` (checklist y «Registro de avances») y `estado-actual.md` si corresponde.
4. No hacer commit ni push salvo que el usuario lo pida.

## Verificación antes de dar por hecha una documentación
- [ ] Cada afirmación técnica se puede rastrear hasta un archivo real.
- [ ] Sin secretos, sin rutas personales y sin IPs concretas.
- [ ] Cada comando documentado existe en `package.json` (o se usó en una sesión).
- [ ] Enlaces relativos válidos (se comprueban con un script temporal, no se añade al repositorio salvo autorización) y `docs/00-indice.md` actualizado.
- [ ] `CLAUDE.md` corto (unas 80 líneas): el detalle va en `docs/ai/`.
- [ ] Las citas a documentos desde el código y la configuración apuntan a la ruta actual.

## Notas
- `.gitignore` ignora solo `.claude/settings.local.json`: el skill y `docs/ai/` se versionan para compartir la memoria con el equipo.
- `CLAUDE.md` usa la sintaxis `@ruta` para importar; `AGENTS.md` usa enlaces Markdown normales (Codex no entiende `@`).
- La memoria personal de la herramienta (fuera del repositorio) no sustituye a `docs/ai/`: lo que es del proyecto se escribe aquí.
- El repositorio está en OneDrive: conviene excluir `node_modules` de la sincronización (ajuste de cada persona).
