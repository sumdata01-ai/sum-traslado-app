# Cómo trabajar una sesión con un LLM (Claude Code o Codex)

Última actualización: 2026-10-13 | Fuente: CLAUDE.md, AGENTS.md, .claude/skills/documentar-proyecto/SKILL.md | Estado: vigente

La idea: el archivo de entrada (`CLAUDE.md` para Claude Code, `AGENTS.md` para Codex) dice **dónde está la memoria y qué consultar según la tarea**. No hace falta pedirle al asistente que lea toda la documentación en cada sesión: se carga lo mínimo (contexto, convenciones) y el resto **solo si la tarea lo necesita**.

## 1. Al empezar

**Versión corta** (con el skill instalado, como en este repositorio):

```
Usa el skill documentar-proyecto en modo inicio-sesion.
Luego trabajaremos en: [tu tarea].
```

**Versión larga** (sirve en cualquier herramienta, con o sin skill):

```
Antes de trabajar, lee las instrucciones del repositorio:
CLAUDE.md si estás en Claude Code, o AGENTS.md si estás en Codex.

Después consulta:
- docs/ai/contexto-proyecto.md
- docs/ai/convenciones.md
- docs/ai/comandos.md
- La última bitácora de docs/ai/sesiones/

Contrasta esa información con el estado actual del código y de Git.
Resume brevemente el contexto y los pendientes relevantes para esta tarea.
No modifiques archivos todavía.

La tarea de esta sesión es: [describe lo que quieres hacer].
```

## 2. Pedir una tarea concreta

Combina la tarea con su referencia; el asistente localiza lo relacionado y **verifica en `src/`** antes de proponer cambios:

```
Necesito modificar el flujo de subida de fotos.

Consulta el índice y la documentación de arquitectura relacionada con
ese flujo, además de las decisiones técnicas aplicables.
Localiza su implementación actual en src/ antes de proponer cambios.
```

## 3. Qué consultar según la tarea

| Tarea | Documentos |
|---|---|
| Qué hace la página y qué endpoints usa | [vision-y-alcance.md](../01-vision-y-alcance/vision-y-alcance.md) |
| Contrato del backend y desenlaces de confirmar | [patron-traslado-web.md](../01-vision-y-alcance/patron-traslado-web.md) |
| Pantallas, sesión, pestañas | [navegacion-y-sesion.md](../02-arquitectura/navegacion-y-sesion.md) |
| Stores, Dexie, cliente HTTP, API | [estado-y-datos.md](../02-arquitectura/estado-y-datos.md) |
| Cámara, galería, escáner, estados de foto | [camara-y-fotos.md](../02-arquitectura/camara-y-fotos.md) |
| Subida a GCS y confirmaciones | [subida-y-confirmacion.md](../02-arquitectura/subida-y-confirmacion.md) |
| Dónde está cada archivo de `src/` | [estructura-src.md](../02-arquitectura/estructura-src.md) |
| Componentes, colores, interfaz | [componentes.md](../02-arquitectura/componentes.md), [estilos-y-ui.md](../02-arquitectura/estilos-y-ui.md) |
| Entorno, variables, Vite, TypeScript, ESLint | [docs/03-configuracion/](../03-configuracion/) |
| Probar en un teléfono con HTTPS | [https-local.md](../03-configuracion/https-local.md) |
| Pruebas y calidad | [docs/04-calidad/](../04-calidad/) |
| Desplegar (Vercel, CORS del bucket) | [vercel.md](../05-despliegue/vercel.md) |
| Por qué se decidió algo | [docs/06-decisiones/](../06-decisiones/) |
| Qué falta y qué está bloqueado | [estado-actual.md](../07-planificacion/estado-actual.md) y [TODO.md](../../TODO.md) |
| Un pedido a un tercero (backend, GCP) | «Pedidos a terceros» de [TODO.md](../../TODO.md) |

El índice completo está en [00-indice.md](../00-indice.md).

## 4. Reglas de lectura

- **No leer toda la documentación ni todas las bitácoras por defecto.** Solo el contexto de la tarea.
- **La documentación orienta; el código manda.** Cualquier afirmación sobre la implementación se comprueba en el código actual. Si hay una contradicción, se registra en [discrepancias.md](discrepancias.md).
- **Al empezar, no modificar archivos** hasta haber resumido el contexto y los pendientes.

## 5. Antes de terminar

Leer la memoria no basta: hay que actualizarla, para que la siguiente sesión continúe sin depender de esta conversación.

```
Usa el skill documentar-proyecto en modo cierre-sesion.

Registra los cambios, las verificaciones realmente ejecutadas,
los pendientes y el siguiente paso concreto.
Actualiza la documentación afectada y traslada los aprendizajes
duraderos a docs/ai/, sin duplicar información.
```

Qué debe quedar en la bitácora (`docs/ai/sesiones/AAAA-MM-DD-tema.md`, plantilla en [_plantilla.md](sesiones/_plantilla.md)):

- Los cambios por archivo o por área.
- Las verificaciones **que de verdad se ejecutaron**, con su resultado (por ejemplo «1482 pruebas pasan»), y las que **no** se hicieron.
- Los pendientes y **un siguiente paso concreto**.
- Lo aprendido que valga para siempre, que va a [convenciones.md](convenciones.md) o [comandos.md](comandos.md) y no se queda solo en la bitácora.

Commit y push solo si se piden.
