# Logos de marca

Última actualización: 2026-10-15 | Fuente: `src/features/seguimiento/components/piezas.tsx`, `src/features/seguimiento/domain/presentacion.ts` (`claveMarca`), marcas con órdenes en la base de pruebas local | Estado: vigente

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

**Sin logo todavía** (se ve la inicial): `KYC` y el resto del catálogo (`KAIYI`, `KARRY`, `FAW`, `DONGFENG`, `KIA`, `MAZDA`…). `KYC` es la 3.ª marca con más órdenes en la base de pruebas y el repositorio de origen no la trae: > TODO(verificar) qué marca es (¿Kaiyi?) y de dónde sacar su logo.

## Origen y condiciones

Los siete salen del repositorio público [car-logos-dataset](https://github.com/filippofilip95/car-logos-dataset) (carpeta `logos/optimized`), publicado con licencia MIT. **Esa licencia cubre el código del repositorio, no las marcas**: los logos son propiedad de sus fabricantes. Se descargaron el 2026-10-15, se recortó el espacio vacío y se redujeron de tamaño (el de SEAT original pesaba 600 KB).

> TODO(verificar): que SUM pueda mostrar estas marcas en una pantalla para terceros. Para uso interno de SUM, que importa y distribuye estas marcas, lo normal es poder hacerlo, pero la decisión y las guías de cada marca (proporciones, sin filtros ni deformaciones) son de SUM, no de este repositorio. Si se prefiere, se sustituyen por los logos de la biblioteca de marca de SUM con el mismo nombre de archivo.

## Cómo agregar o cambiar uno
1. Guardar el archivo como `.svg` (mejor) o `.png`, con fondo transparente, que se lea sobre fondo blanco y de hasta ~240 px de ancho.
2. Nombrarlo con la marca **en minúsculas, sin tildes ni espacios**: `kaiyi.png`, `kia.svg`.
3. Listo: la vista lo toma sola, sin tocar código. Se compara con la marca que manda el servidor ignorando mayúsculas, tildes y signos.
4. Si el catálogo escribe la marca de varias formas (como `VW PASAJEROS` y `VWPASAJEROS`), agregar los alias en `ALIAS_MARCA` de `presentacion.ts` y una prueba.

## Por qué no se instaló una biblioteca
Se evaluó `@cardog-icons/react` (MIT, 9 MB sin comprimir, pensada para React): cubre muchas marcas, pero **no trae Jetour**, que es la marca con más órdenes, y agregaría una dependencia grande para mostrar unos pocos emblemas. Con archivos locales se controla exactamente cuáles aparecen y no hay dependencia nueva.
