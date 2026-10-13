# Pedido al backend: decir qué pasó con un VIN cuya orden ya no está pendiente

Última actualización: 2026-10-13 | Fuente: `sum-bck-modulos` (`app/api/mobile/traslado.py`, `app/services/traslado_service.py`, `app/repositories/traslado_repository.py`), pruebas contra el backend local | Estado: pedido abierto (la página ya está preparada)

## El problema

Cuando alguien escanea o busca el VIN de un vehículo cuya orden **ya salió** (`en_transito`) o **ya se entregó** (`realizado`, `cerrada`) —por ejemplo porque otra persona hizo la salida—, el servidor responde:

```
GET /mobile/traslado/vin/LVTDD24B6VDC81445
200  {"vin": "LVTDD24B6VDC81445", "ordenes": []}
```

y la página (igual que la app móvil) dice «**Sin orden pendiente.** El vehículo existe, pero no tiene una orden pendiente. Espera a que el supervisor de despacho la cree.» Es engañoso: la orden existe, salió hoy a las 10:57 y la tiene Frank Xavier Cavero Ruiz.

**Por qué:** `ordenes_pendientes_por_vin` filtra `o.estado = 'pendiente'`, y `buscar` también. Un operario no tiene otro endpoint que le diga el estado: el listado `GET /v1/traslado/ordenes` es del portal y exige rol `supervisor/despacho`.

## Lo que se pide

Un cambio **compatible hacia atrás** en `GET /mobile/traslado/vin/{vin}`: dejar `ordenes` **exactamente como está** (solo pendientes; la app móvil depende de eso) y **añadir un campo nuevo** con las órdenes de ese VIN que ya no están pendientes.

```json
{
  "vin": "LVTDD24B6VDC81445",
  "ordenes": [],
  "otras_ordenes": [
    {
      "id_orden": 9001,
      "estado": "en_transito",
      "conductor_asignado": { "id": 303, "username": "frank", "nombre_completo": "Frank Xavier Cavero Ruiz" },
      "fecha_salida": "2026-10-13T15:57:00Z",
      "fecha_entrega": null
    }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `id_orden` | entero | — |
| `estado` | texto | `en_transito`, `realizado`, `cerrada` o `cancelada`. **Nunca `pendiente`** (esas van en `ordenes`). |
| `conductor_asignado` | objeto o `null` | Mismo formato que en `ordenes`. |
| `fecha_salida` | fecha-hora ISO o `null` | La salida real medida (`fecha_salida` de la orden). |
| `fecha_entrega` | fecha-hora ISO o `null` | Solo si ya se entregó. |

**Reglas sugeridas**
- Las más recientes primero y **a lo sumo 3**: un mismo VIN reaparece en fechas distintas y no hace falta el historial completo.
- Sin filtrar por conductor, igual que `ordenes`: es justo para que quien escanea sepa de quién es.
- Si no hay ninguna, `otras_ordenes: []`.

## Por qué un campo nuevo y no incluirlas en `ordenes`

La app móvil (`sum-app`) trata `ordenes` como «las órdenes que se pueden trabajar». Mezclar `en_transito` ahí cambiaría su comportamiento sin actualizar el APK. Un campo nuevo que la app ignora no rompe nada.

## Esbozo (Pydantic)

```python
class TrasladoOtraOrdenOut(BaseModel):
    id_orden: int
    estado: Literal["en_transito", "realizado", "cerrada", "cancelada"]
    conductor_asignado: TrasladoConductorOut | None = None
    fecha_salida: datetime | None = None
    fecha_entrega: datetime | None = None

class TrasladoVinOut(BaseModel):
    vin: str
    ordenes: list[TrasladoOrdenOut]
    otras_ordenes: list[TrasladoOtraOrdenOut] = []   # nuevo; por defecto vacío
```

El repositorio necesitaría una consulta tipo `ordenes_no_pendientes_por_vin(vin, limite=3)`: `WHERE o.vin = :vin AND o.estado <> 'pendiente' ORDER BY COALESCE(o.fecha_salida, o.fecha_creacion) DESC LIMIT 3`.

## Pruebas que debería traer el cambio
- VIN con una orden `en_transito`: `ordenes: []` y `otras_ordenes` con esa orden y su conductor.
- VIN con una `pendiente` y otra `realizado`: ambas aparecen, cada una en su lista.
- VIN con más de 3 anteriores: solo 3, las más recientes.
- VIN sin ninguna: `otras_ordenes: []`.
- La respuesta anterior sigue cumpliendo el contrato de `sum-app` (`ordenes` sin cambios).

## Lo que ya está hecho en la página

`api/schemas.ts` lee `otras_ordenes` **si llega** (una mal formada se salta; la ausencia del campo equivale a vacío), `IdentificadorVin` produce el resultado `yaTomada` y `BuscarEnElSistema` muestra:

| Estado | Mensaje |
|---|---|
| `en_transito`, de otra persona (con o sin conductor) | **Orden ya tomada el {fecha, hora}**, y nada más: sin nombre, sin VIN y sin «no es tuya» (decisión del usuario, 2026-10-13). Sin fecha de salida, solo «Orden ya tomada». |
| `en_transito`, tuya | **Ya es tuya y está en tránsito.** + «Ver en mis traslados». |
| `realizado` / `cerrada` | **Orden ya entregada.** {VIN} se entregó el {fecha} (asignada a {nombre}). |
| `cancelada` | **Orden cancelada.** … avisa a tu supervisor. |

Mientras el servidor no mande el campo, la página sigue mostrando «Sin orden pendiente» como hoy.

## Pendiente de decidir
- **Búsqueda parcial (`buscar?q=`):** también filtra por `pendiente`. Para que un VIN parcial de una orden ya salida no diga «Ningún vehículo coincide» haría falta un cambio equivalente en `buscar`. El VIN completo (lo que da el escáner) queda cubierto con el cambio de `/vin`.
- **Texto de reserva:** mientras el campo no exista, el mensaje «Espera a que el supervisor… la cree» sigue siendo engañoso para una orden en tránsito. Se puede suavizar en la página sin esperar al backend.
