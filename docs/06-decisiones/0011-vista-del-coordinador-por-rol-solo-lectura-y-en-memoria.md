# 0011. La vista del coordinador entra por rol, es de solo lectura y vive en memoria

Última actualización: 2026-10-15 | Fuente: src/app/AppShell.tsx, src/core/auth/sesion.ts, src/features/seguimiento/, docs/07-planificacion/mapeo-rol-coordinador.md | Estado: vigente (web y backend construidos; falta la cuenta en producción)

- **Estado:** aceptada
- **Fecha:** 2026-10-15

## Contexto

SUM quiere que una persona de coordinación vea el seguimiento de los traslados (etapa, si llevan GPS y los hitos) desde esta web. Es una segunda audiencia, distinta del operario. El backend no tiene hoy ni el rol ni el endpoint. El rol `cliente` ya existe, pero es el auditor de inspecciones y puede verificar cualquier inspección del sistema.

## Opciones consideradas

1. Reutilizar el rol `cliente`.
2. Un rol nuevo, `coordinador`, y decidir la pantalla por `allowed_apps` (como Traslado).
3. Un rol nuevo, `coordinador`, y decidir la pantalla **por el rol**.
4. Guardar la lista en Dexie para verla sin red, como las órdenes del operario.
5. Filtrar desde la primera versión por destino.

## Decisión

- **Rol nuevo `coordinador`** (opción 3): `esCoordinador(sesion)` compara el rol de forma exacta, como `require_role` del backend. Entra a la vista **aunque `allowed_apps` esté vacío o incluya `traslado`**. No toca el catálogo de apps ni el valor por defecto del rol en el backend.
- **Solo lectura y solo en memoria** (`ListaSeguimiento`, sin Dexie): son datos de operación de otras personas y no se guardan en el navegador; se vacían al cerrar sesión o al entrar otra persona.
- **Sin filtro por destino en la primera versión**: un coordinador general ve todo. Por eso el rol solo debe darse a personal de SUM.
- **Solo web**: la app móvil (Flutter) no cambia; un rol que no conoce queda «sin sesión».
- **Endpoint bajo `/api/seguimiento/`**, no `/v1/`: esta web solo reenvía `/api` y `/mobile` al backend ([ADR 0003](0003-mismo-origen-por-proxy.md)).

## Actualización 2026-10-15 (después de ver la vista)

Decisiones del usuario que cambian lo que la vista muestra y hace, sin cambiar lo decidido arriba:

- **Sin nada de GPS:** ni ubicación ni si el traslado lleva dispositivo. El backend lo sigue enviando; la web no lo lee.
- **Sin órdenes anuladas.**
- **Sin renovación automática:** la lista se pide al abrir y con «Actualizar».
- **Consulta masiva de VIN** (`POST /api/seguimiento/consulta-vines`), solo lectura; todo lo que no está en tránsito ni entregado es «pendiente de información».
- El rol, el endpoint y la consulta masiva ya existen en el backend (merge `65afcac`). Detalle de producto en el [backlog (E7)](../07-planificacion/backlog.md).

## Consecuencias

- El acceso lo decide el rol en la web (comodidad) y **el backend lo decide en cada petición** (seguridad): sin el guard del backend, esta decisión no protege nada.
- Un coordinador puede llamar cualquier endpoint que solo exija sesión (`require_auth`): hay que cerrarlos antes de dar cuentas reales ([mapeo §8](../07-planificacion/mapeo-rol-coordinador.md)).
- Sin red no hay «lo último guardado»: la primera carga espera al servidor.
- `coordinador` ya está en `ROLES_VALIDOS` del backend ([pedido](../07-planificacion/pedido-backend-seguimiento-coordinador.md)); sin el despliegue en producción, el alta de la cuenta responde 422.
- La web decide por `allowed_apps` para Traslado y por rol para el coordinador: dos criterios, documentados en [navegacion-y-sesion.md](../02-arquitectura/navegacion-y-sesion.md).
