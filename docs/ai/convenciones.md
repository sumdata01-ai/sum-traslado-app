# Convenciones para trabajar con un LLM en este proyecto

Última actualización: 2026-10-13 | Fuente: docs/04-calidad/convenciones-codigo.md, decisiones del usuario | Estado: vigente

## Cómo trabajar
- **Hacer solo lo pedido.** No editar archivos que no se pidieron. El usuario lo corrigió en la sesión inicial («yo no pedí editar algo»).
- **Mover o editar `.md` está permitido; cualquier otro archivo se pregunta antes.** Excepción: lo que el usuario autoriza expresamente (por ejemplo, actualizar el texto de comentarios que citan documentos movidos).
- **Preguntar antes de actuar fuera de lo local**: producción, GitHub, Vercel, Google Cloud. Commit y push **solo cuando se piden**; el mensaje termina con la línea `Co-Authored-By` que indique la sesión.
- **No inventar.** Si algo no se puede deducir del código, escribir `> TODO(verificar): …`.
- **Hablar claro con el usuario:** en español, concreto, sin jerga cuando se puede, y diciendo qué se verificó y qué no.

## Cómo leer la documentación
- **Lo mínimo por defecto:** `contexto-proyecto.md` y `convenciones.md`. Lo demás, solo si la tarea lo necesita: abrir `docs/00-indice.md` y los documentos relacionados ([uso-con-llm.md](uso-con-llm.md)).
- **Verificar en el código** cualquier afirmación sobre la implementación; si la documentación la contradice, anotarlo en [discrepancias.md](discrepancias.md).
- Al empezar una sesión **no se modifican archivos** hasta resumir el contexto y confirmar la tarea.

## Cómo escribir código aquí
- Español en interfaz, comentarios y nombres de dominio. Comentarios que explican el porqué, con fecha si es una decisión.
- `domain/` puro. Lógica con estado en un controlador de `data/` (store externo). Dependencias por puerto u opción.
- Fallos de captura, subida y confirmación como **resultados** con mensaje para el operario, no excepciones.
- Todo texto de error dice qué hacer. El color nunca es el único portador del estado.
- Tokens de color solo desde `src/index.css`; no usar colores fuera de la paleta.

## Cómo probar
- Pruebas junto al código. Cada comportamiento nuevo se **verifica rompiéndolo** (mutación) y no quedan archivos `.bak`.
- Antes de dar algo por hecho: `npm run typecheck`, `npm run lint`, `npm test` y, si cambia el empaquetado, `npm run build`.
- Pruebas contra el backend real: una a la vez, y solo en la base de desarrollo local.

## Trampas conocidas
- **Comillas y barras en el shell:** los scripts con comillas anidadas o barras invertidas fallan. Escribir el script con la herramienta de archivos y ejecutarlo.
- **Un `cat > archivo` sin entrada bloquea la terminal.**
- **No editar `src/` mientras corre un script de mutación.**
- El login admite 10 por minuto: no encadenar E2E.
- **Un VIN «que la app sí encuentra» y la página no:** `/vin` y `buscar` solo ven órdenes `pendiente`. Si la orden está en tránsito, entregada o cancelada, el servidor responde `ordenes: []` y la página dice «Sin orden pendiente». Antes de tocar código, pedir el estado real (portal del supervisor) y el entorno de cada lado; la página ya sabe leer `otras_ordenes` cuando el servidor lo mande.
- **Un resultado del backend de desarrollo caduca:** las órdenes cambian mientras se trabaja (un conteo pasó de 46 a 42 en minutos). Repetir la consulta antes de concluir.
- **`localhost:8050` por defecto lee producción:** el usuario lo apunta a la base local con variables de entorno al arrancarlo. La API no dice a qué base apunta, así que antes de correr pruebas que toman o sueltan órdenes (`*.backend.test.ts`, E2E) hay que estar seguro de cómo se levantó; ante la duda, solo consultas de lectura.
- **`npm test` cambia con el backend:** con el backend local activo corren las pruebas `*.backend.test.ts` (antes omitidas) y toman y sueltan una orden de la base de desarrollo. Comprobar después que no quedó nada tomado.
- Vite sirve `/api` y `/mobile` al backend: ninguna ruta de la app puede empezar así.
- Al mover un `.md`, actualizar los comentarios del código que lo citan (hay citas con número de sección).
