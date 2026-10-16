# Glosario

Última actualización: 2026-10-15 | Fuente: docs/01-vision-y-alcance/patron-traslado-web.md, código en src/features/traslado/domain/ y src/features/seguimiento/domain/ | Estado: vigente

| Término | Significado |
|---|---|
| **Traslado** | Llevar un vehículo de la planta a su destino. Una **orden** por vehículo. |
| **Orden** | Registro de un traslado: VIN, estado, placa, proveedor, destino, conductor asignado. |
| **VIN** | Número de chasis de 17 caracteres, sin I, O ni Q. |
| **Pool** | Órdenes de hoy sin conductor, que cualquier operario puede tomar. |
| **Mis traslados / Disponibles hoy** | Las dos secciones de la home: las propias y el pool. |
| **Tomar / Soltar** | «Comenzar despacho»: quedarse con una orden del pool. «Soltar»: devolverla (solo si está `pendiente` y es propia). |
| **Toma pendiente** | Toma hecha sin señal que se envía al actualizar; puede resultar **perdida** si otra persona se adelantó (409). |
| **Momento** | `salida` (6 fotos) o `entrega` (5 fotos). |
| **Zona** | Una de las posiciones a fotografiar: `FRONTAL`, `LATERAL_IZQUIERDO`, `LATERAL_DERECHO`, `POSTERIOR`, `PLACA_ESTADO`, `PLACA_INSTALADA` (solo salida), `VIN` (solo entrega). |
| **Placa rotativa** | Placa física temporal del pañol que se cuelga al vehículo en la salida. |
| **Llegada / punto** | La marcación de llegada (L-01): el conductor escanea el QR que muestra una tablet fija en un **punto** (por ahora el patio) y el servidor le da un **turno** del día. |
| **`step`** | Ventana de 30 s del QR de la tablet (`floor(hora / 30)`); la hora oficial de la llegada es `step × 30`, no la del teléfono. |
| **Fix** | Una lectura del GPS con su precisión y el instante en que se midió; solo sirve si tiene 20 s como máximo. |
| **Estados de la orden** | `pendiente` → `en_transito` (al confirmar la salida) → `realizado` (al confirmar la entrega); también `cancelada` y `cerrada`. |
| **Estados de una foto** | `writing`, `pending`, `uploaded`, `failed_local`, `failed_upload`. |
| **`storage_key`** | Ruta del objeto en el bucket, devuelta por `upload-url`. Es lo que viaja al confirmar. |
| **URL firmada** | Dirección temporal para subir directo a GCS. |
| **Confirmar** | Registrar el despacho en el servidor con las rutas de las fotos ya subidas. |
| **`descartada_por_supervisor`** | Resultado de confirmar cuando la orden fue cancelada o reasignada; no es un error. |
| **Ejecución** | Registro en el servidor de un intento de salida o entrega, con sus fotos. |
| **Dueño (de los datos locales)** | El usuario al que pertenecen las tomas, elecciones y caché guardadas en el navegador. |
| **Época (de sesión)** | Contador que descarta resultados de una renovación hecha con una sesión anterior (A-03). |
| **Coordinador** | Rol (`role: "coordinador"`) que ve el seguimiento de **todos** los traslados, solo lectura y solo en esta web. Entra **por rol**, no por `allowed_apps`. No es el rol `cliente` del portal (auditor de inspecciones). El rol aún no existe en el backend. |
| **Seguimiento** | La vista del coordinador (`SeguimientoPage`, `features/seguimiento`): etapa y hitos de cada traslado. **Sin nada de GPS** (ni ubicación ni si lleva dispositivo), sin mapa, sin PDI y sin órdenes anuladas. |
| **Consulta masiva de VIN** | La opción del coordinador para pegar una lista de VIN (hasta 200) y ver el estado de cada uno (`ConsultaMasiva`; `POST /api/seguimiento/consulta-vines`). Solo cuentan las órdenes en tránsito o entregadas, de cualquier fecha. |
| **Pendiente de información** | Cómo sale en la consulta masiva todo VIN sin orden en tránsito ni entregada: sin orden, con una que aún no sale o cancelada. Para quien consulta es lo mismo: «aún no está en el plan de despacho». |
| **Etapa** | En el lenguaje del coordinador: `en_planta`, `en_camino`, `entregado`, `anulado`. La traduce el servidor desde el estado de la orden. |
| **D1, D2, D3** | Decisiones externas del plan: D1 forma de login (cookie), D2 entorno público con HTTPS, D3 CORS del bucket. |
| **S-01, R2** | Spike de la cámara de iOS al volver de segundo plano; riesgo de que las fotos no sobrevivan a una recarga. Ambos superados en iPhone. |
