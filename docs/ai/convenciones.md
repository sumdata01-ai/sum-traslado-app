# Convenciones para trabajar con un LLM en este proyecto

Última actualización: 2026-10-15 | Fuente: docs/04-calidad/convenciones-codigo.md, decisiones del usuario | Estado: vigente

## Cómo trabajar
- **Hacer solo lo pedido.** No editar archivos que no se pidieron. El usuario lo corrigió en la sesión inicial («yo no pedí editar algo») y otra vez el 2026-10-15 con una pantalla que se renovaba sola («yo no pedí algún fetch»): **no agregar renovaciones automáticas, datos ni elementos que no se pidieron**, aunque parezcan buenas prácticas.
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
- **`localhost:8050` puede leer producción:** el usuario dice que por defecto lo hace y que lo apunta a local con variables de entorno, pero sus datos coincidieron con los de producción hasta el milisegundo. La API no dice a qué base apunta. **No correr `npm test` con ese backend encendido** (ejecuta las pruebas `*.backend.test.ts`, que toman y sueltan una orden): usar el comando que las excluye ([comandos.md](comandos.md)). Ante la duda, solo consultas de lectura.
- **`npm test` cambia con el backend:** con el backend local activo corren las pruebas `*.backend.test.ts` (antes omitidas), que toman y sueltan una orden. Por lo anterior, se evita con el backend encendido; si se corrió, comprobar después que no quedó nada tomado.
- Vite sirve `/api` y `/mobile` al backend: ninguna ruta de la app puede empezar así. **Al revés también:** una llamada nueva al backend debe empezar por `/api` o `/mobile`; el resto (por ejemplo `/v1/...`, que es como el backend monta sus routers) no se reenvía y llegaría a `index.html` ([discrepancias.md](discrepancias.md) #12).
- Al mover un `.md`, actualizar los comentarios del código que lo citan (hay citas con número de sección).
- **Playwright corre sin barras de desplazamiento visibles:** una E2E no detecta un salto del diseño causado por la barra (pasó con el panel de detalle). Eso se cubre con una prueba unitaria que simule la barra (`clientWidth` frente a `innerWidth`).
- **Una variable de entorno vacía no apaga nada en PowerShell:** `$env:X=""` **borra** la variable y el backend (`load_dotenv`) la vuelve a leer de su `.env`. Para apagar una bandera, un valor explícito como `false`.
- **Un backend local conectado a la base de producción arranca también sus tareas en segundo plano**, y duplicarían las de producción: avisos push de demora (`TRASLADO_DEMORA_ENTREGA_ENABLED`, activo por defecto), escritura a hojas de Google (`TRASLADO_EXPORT_SHEET_ID`, vacío = apagado; write-back de AppSheet con `APPSHEET_SHEET_ID`), ingesta de eSUM, revisión externa y migración de AppSheet (`ESUM_DEFECTOS_ENABLED`, `REVISION_EXTERNA_ENABLED`, `MIGRACION_APPSHEET_ENABLED`) y el barrido de GPS, que gasta la cuota del proveedor compartida con producción (se enciende solo con `TELEMETRIA_EMAIL` y `TELEMETRIA_PASSWORD`). Antes de apuntar `:8050` a producción hay que apagarlas, y hasta que el usuario lo decida, no se hace. > TODO(verificar): cómo apagar el barrido de GPS y el aviso de push sin borrar su variable. Fuente: `app/config.py` y `app/core/*_job.py` del backend.
- **Un script de mutación interrumpido deja el archivo roto.** Pasó el 2026-10-15 (se canceló la herramienta a medias y `LlegadaPage.tsx` quedó con una rotura); lo delató una prueba base que fallaba. Tras interrumpir uno, **correr la suite base antes de seguir** y mirar que `git diff` no tenga nada raro.
- **Editar archivos con Python en Windows:** `open(ruta, 'w')` sin `newline=""` convierte un archivo LF a CRLF, y los textos de varias líneas de un script de mutación dejan de coincidir (aparece «0 veces»). Leer y escribir con `newline=""`, o que el script adapte los saltos de línea.
- **Una guarda doble parece «mutante que sobrevive».** Si romper una sola guarda no la detecta ninguna prueba porque otra la repite (por ejemplo, cancelar un temporizador en dos sitios), romper **las dos a la vez** debe detectarse; así se comprueba que no es una prueba débil.
- **Una E2E no debe depender del día en que corre:** una hora relativa a «hoy» muestra «Hoy 14:35» o la fecha. Y el navegador anota en la consola cada 4xx («Failed to load resource»), también los provocados a propósito: no contarlos como errores de la página.
- **Un barrido de mutación largo se corre sobre una copia** (carpeta temporal con un `node_modules` enlazado), no sobre la carpeta de trabajo: así quien prueba en la carpeta real (`npm run dev`) no ve código roto a propósito, y se puede seguir editando. Si hay que detenerlo, mira qué roturas quedaron aplicadas contra la lista antes de seguir (pasó dos veces).
- **Una E2E con un servidor falso no debe fijar el día:** la web pide «hoy» según el reloj real; el servidor falso responde para el día que le pidan.
- **Antes de mezclar una rama del backend**, correr la suite completa en la rama mezclada y en la base y comparar la lista de `FAILED`: la suite de `sum-bck-modulos` contra la réplica local tiene **45 fallos previos** (por ejemplo `test_proceso_guion`), así que «hay fallos» no es regresión; sí lo es uno que no estaba en la base ([comandos.md](comandos.md)).
