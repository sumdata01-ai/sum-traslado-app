# Glosario

Última actualización: 2026-10-13 | Fuente: docs/01-vision-y-alcance/patron-traslado-web.md, código en src/features/traslado/domain/ | Estado: vigente

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
| **Estados de la orden** | `pendiente` → `en_transito` (al confirmar la salida) → `realizado` (al confirmar la entrega); también `cancelada` y `cerrada`. |
| **Estados de una foto** | `writing`, `pending`, `uploaded`, `failed_local`, `failed_upload`. |
| **`storage_key`** | Ruta del objeto en el bucket, devuelta por `upload-url`. Es lo que viaja al confirmar. |
| **URL firmada** | Dirección temporal para subir directo a GCS. |
| **Confirmar** | Registrar el despacho en el servidor con las rutas de las fotos ya subidas. |
| **`descartada_por_supervisor`** | Resultado de confirmar cuando la orden fue cancelada o reasignada; no es un error. |
| **Ejecución** | Registro en el servidor de un intento de salida o entrega, con sus fotos. |
| **Dueño (de los datos locales)** | El usuario al que pertenecen las tomas, elecciones y caché guardadas en el navegador. |
| **Época (de sesión)** | Contador que descarta resultados de una renovación hecha con una sesión anterior (A-03). |
| **D1, D2, D3** | Decisiones externas del plan: D1 forma de login (cookie), D2 entorno público con HTTPS, D3 CORS del bucket. |
| **S-01, R2** | Spike de la cámara de iOS al volver de segundo plano; riesgo de que las fotos no sobrevivan a una recarga. Ambos superados en iPhone. |
