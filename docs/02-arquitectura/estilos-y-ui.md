# Estilos y UI

Última actualización: 2026-10-13 | Fuente: src/index.css, src/core/ui/, docs/01-vision-y-alcance/patron-traslado-web.md §5 | Estado: vigente

## Tailwind 4 y tokens

- Los estilos son **clases de Tailwind 4** (`@tailwindcss/vite`). No hay CSS por componente.
- `src/index.css` define los tokens en un bloque `@theme` y **desactiva la paleta por defecto** (`--color-*: initial`): solo existen los colores de la app, así que un color fuera de ella no compila en silencio.
- Es la **única fuente de verdad**: `src/core/ui/tokens.test.ts` la compara con la tabla de la app móvil.

| Grupo | Tokens |
|---|---|
| Marca | `primary`, `primary-deep`, `primary-soft` |
| Superficies | `page`, `surface`, `surface-2` |
| Bordes | `line`, `line-strong` |
| Texto | `ink-1`, `ink-2`, `ink-3`, `ink-muted` |
| Estados | `success`, `warning`, `danger` (cada uno con `-soft` e `-ink`), `info` |
| Radios | `ficha` 12 px, `control` 14 px, `card` 18 px, `chip` 30 px |

Pares a evitar como texto por contraste insuficiente: `ink-3` sobre `page` y `ink-muted` sobre cualquier fondo.

## Reglas de interfaz

- Solo tema claro, sin modo oscuro.
- Objetivos táctiles de 44 px mínimo; campos de texto de 16 px (Safari amplía por debajo de eso).
- El color acompaña al texto, nunca lo reemplaza.
- Accesibilidad comprobada con `vitest-axe` y patrón combobox en los selectores.
- Diseño pensado para 360 px de ancho (`max-w-md` centrado).
- **Esqueletos de carga** (`EsqueletoTraslados`, vista del coordinador, 2026-10-16): barras `bg-line` con la **misma silueta** de lo que va a aparecer y el lugar reservado de lo que aparece después (pestañas, selector de destino), para que al llegar los datos nada se mueva. Son solo dibujo: `aria-hidden`, nada enfocable, y un único aviso de estado (`role="status"`, texto solo para lector de pantalla). Laten con `animate-pulse` y **no se animan con `motion-reduce`**. Un esqueleto se usa solo cuando **no hay nada que mostrar**: si ya hay datos (por ejemplo, «Actualizar»), se conservan a la vista.
