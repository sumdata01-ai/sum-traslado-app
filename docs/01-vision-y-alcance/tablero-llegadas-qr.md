# Tablero de llegadas por QR (vista del supervisor)

Última actualización: 2026-10-16 | Fuente: src/features/tablero-llegadas/, src/app/TableroLlegadasPage.tsx, e2e/tablero.spec.ts; contrato contrastado con `sum-bck-modulos` (`app/schemas/llegada_qr_lectura.py`) y el spec de `sum-app` (`dashboard-llegadas-historias.md`) | Estado: vigente (**sin probar con el backend real ni en un teléfono**)

> Decisión y motivos: [ADR 0013](../06-decisiones/0013-tablero-de-llegadas-en-esta-web-por-rol-y-area-en-dashboard.md). Plan y estado por historia: [plan-dashboard-llegadas.md](../07-planificacion/plan-dashboard-llegadas.md). La marcación que genera estos datos: [marcacion-llegada-qr.md](marcacion-llegada-qr.md).

## Qué es

Un tablero de **solo lectura** para ver **el orden de llegada y a qué distancia llegó cada conductor** a un punto (hoy, el patio), más los códigos que se rechazaron y con qué reglas mide cada punto. Sin acciones, sin administración (no se crea, edita ni desactiva nada) y sin análisis adicional: cuentas y restas de lo guardado.

Lo ven el supervisor de Despacho, el supervisor de Secado, el asistente de Despacho y el admin, en **`/dashboard`**. **Esas personas entran directo al tablero y no ven Traslado** (aunque su cuenta tenga `traslado`): no hay home, ni «Marcar llegada», ni botón a Traslado.

## Qué muestra

| Parte | Qué hay | Historia |
|---|---|---|
| Filtros | Un **día de Lima** (por defecto hoy; hasta 90 días atrás; botón «Hoy») y un **punto** o todos. Afectan al resumen, a las señales y a las dos listas. | — |
| Resumen | Cuatro tarjetas del mismo estilo (borde fino, sin franjas de color a los lados): **Llegadas** (con el desglose por punto), **Con flag**, **Códigos rechazados** y **Demora mediana**. «Con flag» y «Códigos rechazados» abren su lista. Los números salen del servidor, no de las filas que se ven. | HU-1 |
| Señales | Solo **dos**: llegadas con flag y **QR vencido repetido** (conductores con 2 o más intentos de QR vencido ese día, nombrados). No acusan a nadie. | HU-3 |
| Llegadas | Una fila por llegada, por hora de recepción (con botón para invertir): turno, conductor, punto, hora del QR, recibida, demora, **distancia con barra contra el radio**, precisión y estado («Normal» u «OUT_OF_WINDOW · N pasos», siempre con texto). Chips «Todas / Con flag» y búsqueda por conductor. Debajo de 768 px son tarjetas. | HU-2 |
| Detalle | Un panel (pantalla completa en el teléfono): resumen en lenguaje llano, tiempos de Lima y un **esquema** (no un mapa) de dónde escaneó. **Las coordenadas solo se ven aquí.** | HU-4 |
| Códigos rechazados | Del más reciente al más antiguo: motivo con su etiqueta y explicación, **×N** si el conductor repitió QR vencido, antigüedad del QR («hace 18 h 2 min») y los primeros 20 caracteres de lo que leyó la cámara. **Nunca el código completo.** Al conductor siempre le aparece «El código no es válido»: el motivo solo se ve aquí. | HU-5, HU-6 |
| Puntos | Una ficha por punto: centro, radio, precisión máxima, **peor caso aceptado** (radio + precisión), llegadas del día, último escaneo y «Secreto: guardado · no se muestra nunca». | HU-7 |

## Cómo se pide

`GET /api/llegada-qr/dia` (resumen, señales y llegadas), `/intentos` y `/puntos`, con `dia` e `id_punto` opcionales (`/puntos` solo con `dia`). Las tres a la vez al abrir, con «Actualizar» y al cambiar el día o el punto. Contrato completo: [plan-dashboard-llegadas.md](../07-planificacion/plan-dashboard-llegadas.md) §4. Un fallo no vacía lo que se ve; sin conexión se avisa; un 403 muestra «Sin permiso para ver las llegadas» sin cerrar la sesión; si lo que se ve es de otro día u otro punto que el elegido, se dice.

## Dónde está en el código

| Pieza | Archivo |
|---|---|
| Tipos, formatos de Lima, motivos, filtros y la geometría del esquema (puro) | `src/features/tablero-llegadas/domain/` |
| Llamadas y esquemas (`zod`, que descarta lo que la pantalla no usa) | `src/features/tablero-llegadas/api/` |
| Store en memoria (`TableroLlegadas`) y dobles de prueba con los datos del apéndice | `src/features/tablero-llegadas/data/` |
| Resumen, lista, detalle, rechazados y puntos | `src/features/tablero-llegadas/components/` |
| Página | `src/app/TableroLlegadasPage.tsx` |
| Ruta y acceso | `src/core/navegacion/ruta.ts`, `src/core/auth/sesion.ts` (`puedeVerTablero`), `src/app/AppShell.tsx` |

## Lo que no se verificó

- **Contra el backend real** (ni local ni de producción): todo se probó con servidores falsos. El backend de este tablero está en la rama `feat/dashboard-llegada-qr` de `sum-bck-modulos` y **debe desplegarse en Cloud Run** antes de usarlo con usuarios reales.
- **En un teléfono** (iPhone y Android) y con un lector de pantalla (solo `axe` en jsdom).
- Con una cuenta real de cada par (supervisor de Despacho y de Secado, asistente de Despacho, admin).
- Con volumen real (el servidor recorta a 500 filas y la lista lo avisa; no se probó cerca del tope).
