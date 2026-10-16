# Logos de marca

Última actualización: 2026-10-16 | Fuente: `src/features/seguimiento/components/piezas.tsx`, `src/features/seguimiento/domain/presentacion.ts` (`claveMarca`), marcas con órdenes en la base de pruebas local, kyc.com.ar | Estado: vigente

Logos de las marcas que se muestran en la vista de seguimiento del coordinador. Sin archivo para una marca, la vista muestra un círculo con su inicial.

## Qué hay

| Archivo | Marcas del catálogo de SUM que lo usan |
|---|---|
| `volkswagen.png` | `VOLKSWAGEN`, `VW PASAJEROS`, `VWPASAJEROS`, `VW COMERCIALES`, `VW CAMIONES` |
| `jetour.png` | `JETOUR` |
| `audi.png` | `AUDI` |
| `cupra.png` | `CUPRA` |
| `porsche.png` | `PORSCHE` |
| `seat.png` | `SEAT` |
| `soueast.png` | `SOUEAST` |
| `kyc.svg` | `KYC` |

**Sin logo todavía** (se ve la inicial): el resto del catálogo (`KAIYI`, `KARRY`, `FAW`, `DONGFENG`, `KIA`, `MAZDA`…). `KYC` era la 3.ª marca con más órdenes en la base de pruebas.

> TODO(verificar): si `KYC` y `KAIYI` son marcas distintas en el catálogo de SUM. Fuentes externas indican que KYC (utilitarios Mamut, V7 y F3) no es Kaiyi (grupo Chery), pero no se comprobó contra el backend de SUM. Si el servidor manda las dos escrituras para una misma marca, agregar el alias en `ALIAS_MARCA` de `presentacion.ts`.

## Origen y condiciones

**`kyc.svg`** (2026-10-16): descargado del encabezado del sitio de la marca en Argentina, `kyc.com.ar/wp-content/uploads/2025/05/Capa_1.svg`, sin cambios (SVG de 18 KB, emblema rojo y letras «KYC», sin la marca de ningún distribuidor, sin scripts ni enlaces externos; se revisó antes de copiarlo). Es la versión en color para fondo claro; la del pie del sitio es blanca (para fondo oscuro) y no se usa. Es un logo de una marca registrada de un tercero: aplica la misma condición de uso que los demás (ver abajo).

Los siete de arriba, en `.png`, salen del repositorio público [car-logos-dataset](https://github.com/filippofilip95/car-logos-dataset) (carpeta `logos/optimized`), publicado con licencia MIT. **Esa licencia cubre el código del repositorio, no las marcas**: los logos son propiedad de sus fabricantes. Se descargaron el 2026-10-15, se recortó el espacio vacío y se redujeron de tamaño (el de SEAT original pesaba 600 KB).

> TODO(verificar): que SUM pueda mostrar estas marcas en una pantalla para terceros. Para uso interno de SUM, que importa y distribuye estas marcas, lo normal es poder hacerlo, pero la decisión y las guías de cada marca (proporciones, sin filtros ni deformaciones) son de SUM, no de este repositorio. Si se prefiere, se sustituyen por los logos de la biblioteca de marca de SUM con el mismo nombre de archivo.

## Cómo agregar o cambiar uno
1. Guardar el archivo como `.svg` (mejor) o `.png`, con fondo transparente, que se lea sobre fondo blanco y de hasta ~240 px de ancho.
2. Nombrarlo con la marca **en minúsculas, sin tildes ni espacios**: `kaiyi.png`, `kia.svg`.
3. Listo: la vista lo toma sola, sin tocar código. Se compara con la marca que manda el servidor ignorando mayúsculas, tildes y signos.
4. Si el catálogo escribe la marca de varias formas (como `VW PASAJEROS` y `VWPASAJEROS`), agregar los alias en `ALIAS_MARCA` de `presentacion.ts` y una prueba.

## Por qué no se instaló una biblioteca
Se evaluó `@cardog-icons/react` (MIT, 9 MB sin comprimir, pensada para React): cubre muchas marcas, pero **no trae Jetour**, que es la marca con más órdenes, y agregaría una dependencia grande para mostrar unos pocos emblemas. Con archivos locales se controla exactamente cuáles aparecen y no hay dependencia nueva.
