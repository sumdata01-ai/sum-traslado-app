# Sesión 2026-10-16 (parte 4) — Tablero de llegadas por QR: backend y web

Herramienta: Claude Code

El nombre lleva `-zz-` para que sea la última por orden alfabético. Continúa de [la parte 3](2026-10-15-zz-marcacion-llegada-qr.md).

## Objetivo
Construir el tablero de solo lectura de llegadas por QR para supervisores, **primero el backend y luego la web**, según el spec `sum-app/docs/specs/001-marcacion-qr/dashboard-llegadas-historias.md` y el plan [plan-dashboard-llegadas.md](../../07-planificacion/plan-dashboard-llegadas.md). Decisiones del usuario: se construye en esta web; backend en una rama nueva de `sum-bck-modulos` con su autorización; acceso por el par rol + área (supervisor de Despacho y de Secado, asistente de Despacho, admin; `secado_fisico` no); ruta `/dashboard`; los intentos de más de 90 días solo se ocultan; endpoints `/api/llegada-qr/*`; el usuario despliega el backend. Después pidió dos cambios: **esas personas entran directo al tablero y no ven Traslado**, y **las tarjetas del resumen sin franjas de color laterales**.

## Cambios realizados (archivos)
**Backend (`sum-bck-modulos`, rama `feat/dashboard-llegada-qr`, mezclada a su `main` local en `c2e83c5`; sin subir):** `app/api/v1/llegada_qr.py`, `app/schemas/llegada_qr_lectura.py`, `app/services/llegada_qr_lectura_service.py`, `app/repositories/llegada_qr_lectura_repository.py`, el guard `require_llegada_qr_lector` en `app/api/deps.py`, `app/api/router.py`, `ENDPOINTS.md`, `scripts/sembrar_llegadas_demo.py` y las pruebas `test_llegada_qr_lectura.py` y `test_sembrar_llegadas_demo.py` (142).

**Web (esta rama `feature/dashboard-llegadas`):**
- `src/features/tablero-llegadas/` (dominio, API con zod, store `TableroLlegadas`, componentes, dobles con los datos del apéndice) y `src/app/TableroLlegadasPage.tsx`.
- `src/core/navegacion/ruta.ts` (la ruta del navegador), `puedeVerTablero` en `src/core/auth/sesion.ts`, `AppShell`, `App`, `composicion.ts` y `main.tsx`.
- Un cambio menor en la vista del coordinador: `PanelDetalle` acepta un nombre para el lector de pantalla.
- Pruebas: dominio, API, store, ruta, acceso, página y `App`; `e2e/tablero.spec.ts`.
- **Documentación:** [tablero-llegadas-qr.md](../../01-vision-y-alcance/tablero-llegadas-qr.md), [ADR 0013](../../06-decisiones/0013-tablero-de-llegadas-en-esta-web-por-rol-y-area-en-dashboard.md), el plan, y los documentos de arquitectura y calidad.

**No se tocó:** `vercel.json`, `package.json`, `.env.local`, `.certs/`, ni la app Flutter.

## Decisiones tomadas
Las del usuario, arriba. Mías, sujetas a revisión:
- El guard del backend trata a un `tester` legacy como `supervisor` (como los demás guards de pares); la web no: un `tester` de Despacho entraría por el servidor pero la web no le mostraría la ruta.
- `dia` es opcional (por defecto hoy de Lima), un día futuro da 422, y `/puntos` también acepta `dia`.
- El centro del punto para dibujar el esquema sale de la ficha de puntos (`/puntos`); sin ella, se dibuja al este y el detalle lo dice.
- La fila con flag conserva su raya ámbar a la izquierda (lo pide el spec); solo se quitaron las franjas de las **tarjetas del resumen**.

## Problemas encontrados y solución
- **Un script de mutación detenido a medias dejó `App.tsx` roto**; se vio al cotejar contra la lista de roturas. Desde entonces los barridos largos se corren sobre una copia en la carpeta temporal.
- **Las pruebas del backend en una copia de trabajo difieren de la carpeta principal** (esta tiene un `.env`): 43 fallos en la carpeta y 48-49 en copias limpias; los fallos que difieren entre rama y base dependen del reloj.
- Una prueba nueva mostró un defecto real: `puntos` mandaba el punto si se lo pasaban (corregido).
- La E2E del tablero dependía del día en que corre; el servidor falso ahora responde para el día que le pidan.
- Editar con Python sin `newline=""` dejó archivos en CRLF y los textos de las roturas dejaron de coincidir (ya anotado en `convenciones.md`).

## Verificaciones realmente ejecutadas
| Comprobación | Resultado |
|---|---|
| Web: `npm run typecheck`, `npm run lint`, `npm run build` | Sin errores. |
| Web: `npx vitest run --exclude "**/*.backend.test.ts"` | **2158 pruebas pasan** en 91 archivos (eran 1874 en 84). |
| Web: E2E de tablero, llegada y seguimiento en Chrome y Edge reales | **17 de 17 en cada uno**, sin backend. |
| Web: mutación | **111 roturas: 98 a la primera, 10 reforzadas y ahora detectadas, 3 equivalentes.** Hubo antes otra tanda parcial con otros huecos, también cerrados. |
| Backend: 142 pruebas nuevas contra la réplica local | Pasan; 205 con las de llegadas y seguimiento ya existentes, tras el merge. |
| Backend: mutación | 63 roturas del tablero (58 a la primera, 4 reforzadas, 1 equivalente) y 17 del script de siembra (15 y 2). |
| Backend: suite completa, rama frente a copia limpia de `main` | 49 y 48 fallos; los que difieren dependen del reloj y dan lo mismo a la misma hora. |

**No se hizo:**
- **Nada contra el backend real**: la web solo se probó con servidores falsos y el backend solo con pruebas contra la réplica local; no se probaron juntos.
- **No se desplegó el backend** (lo hace el usuario) ni se subió a GitHub antes de esta sesión de cierre.
- No se probó en un teléfono ni con un lector de pantalla, ni con una cuenta real de cada par.
- No se probó con volumen real (el servidor recorta a 500 filas).

## Pendientes / siguiente paso
- **Desplegar el backend en Cloud Run** (lo hace el usuario). Sin él, el tablero muestra un error y esas personas **no tienen Traslado**.
- Probar con el backend local y los datos sembrados (`scripts/sembrar_llegadas_demo.py`), en un teléfono y con una cuenta real de cada par.
- Decidir si la fila con flag conserva su raya ámbar.
- `ENDPOINTS.md` del backend sigue sin listar `POST /mobile/llegadas` ni los endpoints del coordinador.

**Siguiente paso concreto:** desplegar el backend y entrar a `/dashboard` con `s.despacho` (o `matias`) para comprobar que ve las cifras reales; si algo falla, lo primero que mirar es el 404 de `/api/llegada-qr/dia` (backend sin desplegar).

## Aprendizajes a llevar a memoria
Pasados a `docs/ai/`: correr los barridos largos sobre una copia, y la E2E que no fija el día ([convenciones.md](../convenciones.md)); el comando de la E2E del tablero ([comandos.md](../comandos.md)).
