# Pedido al backend: el rol `coordinador` y el endpoint de seguimiento

Última actualización: 2026-10-15 | Fuente: `sum-bck-modulos` (`app/schemas/auth.py`, `app/api/deps.py`, `app/api/v1/telemetria.py`, `app/services/telemetria_service.py`, `app/api/v1/traslado.py`, `migrations/020_traslado.sql`), `src/features/seguimiento/api/` de este repositorio | Estado: **implementado** en `sum-bck-modulos` (rama `feat/seguimiento-coordinador`, commit `625d741`, merge `65afcac`, ya en su `origin/main` según se comprobó el 2026-10-15); **sin comprobar que esté desplegado en Cloud Run**. La web está construida contra este contrato.

> **Convención:** este documento nació como propuesta y **ya está implementado** (ver el estado arriba); lo que difiere se anota donde ocurre. Lo que se afirma del backend salió de la copia local, **sin verificar contra producción**. Contexto: [mapeo-rol-coordinador.md](mapeo-rol-coordinador.md) y [propuesta-vista-cliente.md](../01-vision-y-alcance/propuesta-vista-cliente.md).

## El problema

SUM quiere que una persona de coordinación vea, desde la web de Traslado, **todos los traslados** con su etapa, si llevan GPS y sus hitos. Hoy eso solo lo ve un supervisor en el portal (`/v1/telemetria/viajes-en-curso`, `/v1/traslado/ordenes`), y esos endpoints exigen rol de supervisor (`TRASLADO_LECTOR_PARES`) y devuelven mucho más de lo que esta vista debe mostrar (conductor, velocidad, incidencias, fotos).

## Qué se pide

### 1. El rol `coordinador`

- `"coordinador"` en `ROLES_VALIDOS` (`app/schemas/auth.py`). Sin esto el alta devuelve 422, que es por lo que el rol `cliente` quedó inalcanzable. Lo comparten `POST /api/users` y el padrón de usuarios.
- **Sin valor por defecto de apps** (`_ROLE_AREA_DEFAULTS`) y **sin tabla usuario → destino**: la web entra por el rol, y esta primera versión no filtra por destino.
- La app móvil no cambia: un rol desconocido queda «sin sesión» (`_roleFromApi`), que es lo que se quiere.
- No se reutiliza `cliente`: ese rol puede **verificar cualquier inspección** del sistema.

### 2. Un endpoint de lectura

`GET /api/seguimiento/traslados`, guard `require_role("coordinador")`. Cualquier otro rol recibe **403**.

**Por qué `/api` y no `/v1`:** el backend monta los routers en la raíz (`/v1/...`), y esta web solo reenvía `/api` y `/mobile` al backend (ADR 0003). Con `/v1` habría que cambiar el proxy de Vite y los `rewrites` de Vercel. `/api` ya existe como prefijo (`/api/login`, `/api/users`).

```json
{
  "actualizado_hace_segundos": 42,
  "traslados": [
    {
      "id_orden": 9001,
      "vin": "LVTDD24B6VDX00231",
      "marca": "Toyota",
      "modelo": "Corolla",
      "color": "Blanco",
      "destino": "Sede Norte",
      "etapa": "en_camino",
      "salida_registrada_en": "2026-10-15T12:40:00Z",
      "entregado_en": null,
      "entrega_estimada": false,
      "seguimiento": "sin_seguimiento"
    }
  ]
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `id_orden` | entero | — |
| `vin` | texto | — |
| `marca`, `modelo`, `color` | texto o `null` | De `vista_detalles_auto` (ya lo cruza `rastreo_web.py`). |
| `destino` | texto o `null` | `destino_traslado.nombre`. |
| `etapa` | `en_planta` · `en_camino` · `entregado` · `anulado` | `pendiente` → `en_planta`; `en_transito` → `en_camino`; `realizado` y `cerrada` → `entregado`; `cancelada` → `anulado`. |
| `salida_registrada_en` | fecha-hora ISO **con zona**, o `null` | `fecha_salida`: cuándo el despacho **registró** la salida, no cuándo cruzó la puerta. |
| `entregado_en` | fecha-hora ISO con zona, o `null` | `fecha_entrega`. |
| `entrega_estimada` | booleano | `true` si la hora de entrega no se midió (hay entregas cerradas a mano con «salida + 2 h»). Si el backend aún no puede distinguirlo, **omitir el campo**: la web lo toma como medida. |
| `seguimiento` | `en_vivo` · `ultima_ubicacion` · `sin_seguimiento` o `null` | Ver abajo. |

**`seguimiento`, traducido en el servidor.** La web nunca debe recibir `sin_placa`, `sin_gps` ni `demorado`:

| Estado interno (`telemetria_service`) | `seguimiento` |
|---|---|
| `en_ruta`, `demorado` | `en_vivo` |
| `sin_senal` | `ultima_ubicacion` |
| `sin_gps`, `sin_placa` | `sin_seguimiento` |
| La orden no ha salido (`en_planta`) o está anulada | `null` |

Antes de salir **no se sabe** si llevará GPS: la placa rotativa, que es la que lleva el dispositivo, la elige el operario al registrar la salida. Por eso `null` y no `sin_seguimiento`.

**Una etapa o un valor que la web no conoce** hace que ese traslado se descarte y se cuente en un aviso («Avisa a soporte»), sin vaciar la lista. Conviene avisar a la web antes de agregar valores.

### 3. Qué traslados entran (TODO(decidir))

El volumen esperado es de 100 a 500 órdenes diarias (comentario del propio `traslado.py`). Propuesta, a confirmar con quien conoce la operación:
- `pendiente`: las de hoy (`fecha_despacho`).
- `en_transito`: todas.
- `realizado` y `cerrada`: los últimos **N** días (se propone 7).
- `cancelada`: los mismos N días.

La web no pagina: pide la lista entera al abrir y cada vez que el coordinador pulsa «Actualizar» (no hay renovación automática). Si el volumen lo exige, habrá que acordar paginación o ventana.

**Ampliación del 2026-10-16 (filtro por fecha, [ADR 0014](../06-decisiones/0014-filtro-por-fecha-del-coordinador-rango-al-servidor-y-abre-en-hoy.md)):** el mismo endpoint acepta `desde` y `hasta` **opcionales** (días de Lima, `AAAA-MM-DD`, los dos a la vez, ambos incluidos). Con ellos devuelve solo lo que **pasó** esos días: órdenes `en_transito`, `realizado` o `cerrada` cuya **salida o entrega** se registró en alguno de ellos. No entran las pendientes ni las canceladas. Responde **422** si falta uno de los dos, si van al revés, si `hasta` es futuro o si el rango pasa de 90 días. Sin parámetros todo sigue como arriba. El contrato de cada traslado no cambia. La web abre pidiendo «hoy».

### 4. Qué NO debe devolver

Conductor (nombre, usuario o DNI), placa rotativa, dispositivo GPS, velocidad, rumbo, incidencias, fotos, ubicación. La web ya descarta cualquier campo no listado, pero **el servidor no debe mandarlos**: una lista cerrada, no el modelo del supervisor, para que un campo interno nuevo no se filtre por accidente. La ubicación en el mapa es una fase posterior y llevará su propio contrato.

### 5. Costo y seguridad

- **Debe leer la caché del barrido de GPS**, igual que `viajes-en-curso`, y **no llamar al proveedor**: el proveedor limita a 360 llamadas por hora, y esta lista se pide cada vez que un coordinador abre la vista o pulsa «Actualizar».
- **Reutilizar**, no duplicar, la lógica de estados de `TelemetriaService`.
- Sin filtro por destino en esta versión: **el rol solo debe darse a personal de SUM**.

### 2b. Consulta masiva de VIN *(añadida el 2026-10-15)*

`POST /api/seguimiento/consulta-vines`, mismo guard (`require_role("coordinador")`). **Solo lectura**; es un POST porque la lista no cabe en la URL.

```json
// pedido
{ "vines": ["LVTDD24B6VDX00231", "KMHJB81B1PU123456"] }

// respuesta: uno por VIN, en el orden pedido y sin repetidos
{
  "resultados": [
    { "vin": "LVTDD24B6VDX00231", "informacion": "disponible", "traslado": { /* los mismos campos de la lista */ } },
    { "vin": "KMHJB81B1PU123456", "informacion": "pendiente", "traslado": null }
  ]
}
```

- Entrada: 1 a **200** VIN (más es 422); se pasan a mayúsculas, se quitan espacios y repetidos conservando el orden; un VIN vacío o de más de 64 caracteres es 422. El servidor no valida la forma del VIN (la web ya aparta lo que no lo parece).
- **Qué cuenta:** solo las órdenes `en_transito`, `realizado` y `cerrada`, **de cualquier fecha** (sin la ventana de 7 días de la lista). Con varias órdenes del mismo VIN manda la de salida más reciente.
- **`pendiente`** es todo lo demás —sin orden, orden que aún no sale (`pendiente`), orden `cancelada`—: «aún no pasa a estar en el plan de despacho». **No se distingue** entre esos casos (por ejemplo, no se cuenta que una orden se canceló). Decisión del usuario, 2026-10-15.
- `traslado` usa el contrato del punto 2 (etapa, seguimiento traducido…) y tiene las mismas reglas de «Qué NO debe devolver». Sin llamar al proveedor de GPS.

## Pruebas que debería traer el cambio

Siguiendo `tests/test_rol_gerencia.py`:
- `coordinador` está en `ROLES_VALIDOS` y el alta lo acepta por `POST /api/users` y por el padrón, sin área ni taller. Un rol inexistente se sigue rechazando.
- El endpoint responde 403 a `operario`, `supervisor` y `cliente`, y 200 a `coordinador`.
- Un coordinador recibe 403 en `/mobile/traslado/*`, `/v1/telemetria/*` y `/proceso/guion/*`.
- Cada estado interno da el `seguimiento` de la tabla; una orden sin salir da `null`.
- La respuesta **no contiene** ninguna de las claves del punto 4.
- No llama al proveedor de GPS (doble que falle si se le llama).
- Consulta masiva: normaliza y quita repetidos conservando el orden; tope de 200; solo cuentan `en_transito`, `realizado` y `cerrada` de cualquier fecha; pendientes, canceladas y VIN sin orden son `pendiente`; con varias órdenes manda la más reciente; la respuesta sigue el orden pedido; 403 a otros roles.

## Lo que ya hace la web

`src/features/seguimiento/api/schemas.ts` valida cada traslado con zod: uno inválido se salta y se cuenta; una respuesta que no trae `traslados` es un error 502. Un 403 muestra «Sin permiso» sin cerrar la sesión. Se pide al abrir y con «Actualizar» (sin renovación automática). Ningún dato se guarda en el navegador.

## Puntos abiertos

1. La ventana de días (punto 3) y si hace falta paginar. **Implementado:** pendientes de hoy, todas las en tránsito y entregadas, cerradas o canceladas de los últimos 7 días (`VENTANA_DIAS`); sin paginar. **Ampliado el 2026-10-16:** con `desde` y `hasta` se pide un rango de hasta 90 días (ver arriba).
2. ~~Cómo distinguir una entrega con hora estimada (`entrega_estimada`).~~ **No se envía** (2026-10-15): la base no marca las entregas cerradas a mano; la web toma toda hora como medida.
3. **El hueco de `require_auth`:** un coordinador podrá llamar cualquier endpoint que solo exija sesión (por ejemplo `GET /storage/signed-url/{key}` o `/vehiculo/ubicacion/{vin}`). Es el mismo hueco que ya anota `sum-portal-front/documents/migraciones/diagnostico-arquitectura-erp.md` §1.2. Antes de dar cuentas reales conviene cerrar al menos los que devuelven datos de vehículos. No forma parte de este pedido, pero lo condiciona.
4. Datos personales: validar con el área legal si la ubicación llegara a mostrarse a terceros.
5. ~~Rama y cuenta de pruebas~~ Rama `feat/seguimiento-coordinador` (en su propia carpeta de trabajo); cuenta local `coordinador.prueba` en la réplica de pruebas. **Falta la cuenta en producción** (la crea un `admin` por `POST /api/users`; el formulario del portal no ofrece el rol).
