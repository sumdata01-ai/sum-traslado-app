# Pruebas unitarias y de componentes (Vitest)

Última actualización: 2026-10-15 | Fuente: vite.config.ts, src/test/setup.ts, archivos *.test.ts(x) | Estado: vigente

A 2026-10-15: **1608 pruebas en 73 archivos** (`npx vitest run --exclude "**/*.backend.test.ts"`, sin las del backend real). La vista de seguimiento aporta 125 pruebas en 6 archivos (`features/seguimiento/**`, `app/SeguimientoPage.test.tsx`, `app/App.seguimiento.test.tsx`). Las de dominio de fechas fijan la zona horaria (`process.env.TZ`) para no depender de la máquina.

## Qué hay

| Tipo | Dónde | Cómo |
|---|---|---|
| Dominio | `features/traslado/domain/*.test.ts` | Entorno `node`, sin dobles. |
| API y esquemas | `features/traslado/api/*.test.ts` | `fetch` simulado; se comprueba el cuerpo exacto de cada petición. |
| Controladores y almacenes | `features/traslado/data/*.test.ts` | Dobles en memoria; Dexie real sobre `fake-indexeddb`. |
| Cámara | `features/traslado/camera/*.test.ts(x)` | `CameraSession` con `FakeStream`, `FakeVideo`, `FakeDocument`. |
| Componentes y pantallas | `components/*.test.tsx`, `app/*.test.tsx` | Testing Library + `user-event`. |
| Accesibilidad | dentro de las anteriores | `vitest-axe` (`toHaveNoViolations`). |
| Reglas de capas | `src/test/lint-boundaries.test.ts` | Comprueba la regla de ESLint del dominio. |
| Tokens | `src/core/ui/tokens.test.ts` | Compara `index.css` con la tabla de la app móvil. |
| Contra el backend real | `*.backend.test.ts` | Base de **desarrollo** local; se **omiten solas** sin credenciales o sin backend. |

## Preparación común (`src/test/setup.ts`)

`fake-indexeddb/auto`, matchers de `jest-dom` y de `axe`, `cleanup` tras cada prueba, y sustitutos de lo que jsdom no tiene: `canvas.getContext` devuelve `null`, `URL.createObjectURL`, y `play`/`pause` del video.

## Dobles de prueba

Viven en carpetas `testing/` junto al código (`core/auth/testing`, `camera/testing`, `data/testing`). Los más usados: `crearListaConServidor` (un «servidor» de órdenes en memoria con `tomar`, `soltar` y confirmaciones), `crearCatalogoDePrueba`, `crearIdentificadorDePrueba`, `AlmacenEnMemoria`.

## Práctica de verificación por mutación

Para comprobar que las pruebas detectan fallos reales, se **rompe a propósito** el comportamiento nuevo y se confirma que alguna prueba falla:

1. Un script copia el archivo (mejor a una carpeta temporal **fuera del repositorio**; así no queda ningún `.bak`), aplica la rotura, corre las pruebas relacionadas y restaura el original, comprobando que quedó igual. Antes de romper nada, la línea base debe estar verde.
2. Un comportamiento cuya rotura **no** hace fallar ninguna prueba es un hueco: se escribe la prueba y se repite.
3. **No editar `src/` mientras el script corre** y comprobar al final que no quedan archivos `.bak` (`find src -name "*.bak"`).

Los resultados de cada tanda están en los registros de avance de [TODO.md](../../TODO.md).

## Trampas conocidas

- `user-event` filtra por el atributo `accept` de un `<input type="file">`: para probar la validación propia se usa `userEvent.setup({ applyAccept: false })`.
- jsdom no dibuja en canvas: los lectores reciben un lienzo falso.
- Con temporizadores falsos, usar `vi.advanceTimersByTimeAsync`.
- El `Blob` de jsdom no sobrevive al clonado de `fake-indexeddb`: en esas pruebas se usa el de `node:buffer`.
- Dexie no garantiza el orden de las escrituras: las pruebas de la caché de órdenes lo cubren.
