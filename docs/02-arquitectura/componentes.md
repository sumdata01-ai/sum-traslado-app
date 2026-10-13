# Catálogo de componentes

Última actualización: 2026-10-13 | Fuente: src/core/ui/, src/features/traslado/components/, src/features/traslado/camera/, src/app/ | Estado: vigente

## Base (`core/ui`)

| Componente | Uso |
|---|---|
| `Button` | Variantes `primario`, `secundario`, `peligro`; tamaños `normal` (44 px mínimo) y `compacto`. `type="button"` por defecto. |
| `TextField` | Campo con etiqueta visible y asociada; texto de 16 px para que Safari no amplíe la página. |
| `Banner` | Aviso con tono (`success`, `warning`, `danger`, `info`); se anuncia como estado o alerta según el tono. |
| `Card`, `SectionHeader`, `ProgressCounter` | Contenedores y encabezados de la home. |
| `cx` | Unión de clases. |

## De la funcionalidad (`features/traslado/components`)

| Componente | Qué muestra |
|---|---|
| `TarjetaOrden` | Una orden: VIN, etiqueta con color y texto, datos, selectores de placa/proveedor y sus acciones («Comenzar despacho», «Soltar», «Fotografiar…»). |
| `SelectorCatalogo` | Combobox filtrable; al elegir pasa a solo lectura con un lápiz para corregir. |
| `BuscarEnElSistema` | Búsqueda por VIN parcial o exacto cuando el filtro local no encuentra nada. |
| `FormularioCaptura` | Cámara con guía, contador, una `FichaZona` por zona y el pie de confirmación. |
| `FichaZona` | Miniatura o hueco, estado de subida y «Reintentar» como botón hermano. |
| `ConfirmarDespacho` | «Confirmar salida» / «Confirmar entrega», habilitado con todas las fotos subidas. |
| `EscanerVin` | Diálogo a pantalla completa para leer QR y códigos de barras. |
| `CameraWidget` (en `camera/`) | Video, «Tomar foto», «Elegir de la galería», revisión «Usar / Repetir o Descartar». |

## Convenciones

- Todo componente que lee un controlador lo hace con un hook `use*` sobre `useSyncExternalStore`.
- Los componentes reciben sus dependencias por props (puertos, sesiones, decodificadores) para sustituirlas en las pruebas; las props «solo para pruebas» están documentadas así en el código.
- El estado que se comunica por color **siempre** lleva también texto.
- Botones táctiles de al menos 44 px; campos de 16 px; sin desbordar a 360 px de ancho.
- Cada componente nuevo lleva una prueba con `vitest-axe`.
