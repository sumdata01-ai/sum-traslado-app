# 0014. El filtro por fecha del coordinador pide el rango al servidor y abre en «Hoy»

Última actualización: 2026-10-16 | Fuente: src/features/seguimiento/ (domain/fechas.ts, api/seguimientoApi.ts, data/listaSeguimiento.ts, components/FiltroFecha.tsx), src/app/SeguimientoPage.tsx; backend `sum-bck-modulos` (`app/api/v1/seguimiento.py`, `app/services/seguimiento_service.py`, `app/repositories/seguimiento_repository.py`) | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-16 (decisiones del usuario)

## Contexto

La vista del coordinador ([ADR 0011](0011-vista-del-coordinador-por-rol-solo-lectura-y-en-memoria.md)) mostraba **todos** los traslados que el servidor mandaba: las órdenes pendientes de hoy, todas las que están en tránsito (de cualquier antigüedad) y las entregadas, cerradas o anuladas de los últimos 7 días. No había forma de ver un día concreto, y al abrir se veía una mezcla sin fecha. El usuario pidió (2026-10-16, con una imagen de referencia): un **filtro por fecha** con «Hoy», «Ayer», «Últimos 7 días», «Últimos 30 días» y «Rango personalizado» (Desde / Hasta, con «Cancelar» y «Aplicar»); que la **vista inicial sea la del día actual, en camino y entregado**; y que el filtro **actúe cuando se aplica**.

El servidor no recibía ninguna fecha y solo entregaba 7 días de lo ya entregado: filtrar solo en la web no habría podido traer 30 días ni un rango antiguo.

## Opciones consideradas

1. **Filtrar solo en la web**, sobre lo que ya llega (sin tocar el backend). Descartada por el usuario: limita todo a 7 días y «Últimos 30 días» saldría incompleto sin avisar.
2. **Pedir el rango al servidor al pulsar «Aplicar»** (elegida): `GET /api/seguimiento/traslados?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`.

## Decisión

1. **El rango se pide al servidor** con `desde` y `hasta` (días de Lima, ambos incluidos, los dos a la vez). Sin parámetros el endpoint se comporta como siempre (así una versión vieja de la web sigue funcionando). El servidor responde **422** si falta uno, si van al revés, si `hasta` es futuro o si el rango pasa de **90 días**; la web comprueba lo mismo antes (`errorDeRango`) para decirlo sin esperar.
2. **Qué trae un rango: lo que pasó esos días.** Un traslado pertenece a un día si en ese día se **registró su salida** o se **registró su entrega**, y solo si está **en camino o entregado**. Una orden que salió el 14 y se entregó el 15 está en los dos días. No entran las pendientes («en planta»: no tienen ninguna fecha) ni las anuladas. El día es **el de Lima**, no el de UTC (a las 22:00 de Lima ya es el día siguiente en UTC).
3. **Al abrir se pide «Hoy»** (el día de Lima). Cada vez que se abre la pantalla vuelve a «Hoy», y también al cerrar sesión o entrar otra persona. «Hoy» sigue al reloj: pasada la medianoche de Lima, lo que se miraba pasa a rotularse «Ayer».
4. **El filtro solo actúa al pulsar «Aplicar»:** elegir una opción no pide nada, y «Cancelar», Escape o tocar fuera lo descartan. Es coherente con la decisión de no renovar solo ([ADR 0011](0011-vista-del-coordinador-por-rol-solo-lectura-y-en-memoria.md)). «Actualizar» pide de nuevo **el mismo rango**.
5. **Al cambiar de rango se vacía lo mostrado** y se descarta lo que conteste tarde del rango anterior: mostrar los traslados de un día bajo el rótulo de otro sería peor que esperar. Si el rango nuevo falla, queda vacío con su aviso (los datos del rango anterior no se conservan). Esto difiere de «Actualizar», donde un fallo sí conserva lo ya mostrado.
6. **La web también descarta lo que no pertenece al rango** (`trasladoEnRango`, en la capa de API). Un servidor que todavía no conoce `desde` y `hasta` los **ignora** y devuelve la lista de siempre; sin esta regla, bajo el rótulo «Hoy» saldrían traslados de otros días. Con el servidor nuevo no cambia nada (ya llega filtrado).
7. **No hay «Todas las fechas»** (estaba en la imagen de referencia): el servidor acota lo que devuelve (a lo más 90 días), así que esa opción prometería más de lo que se puede traer. El rótulo del botón es «Fecha: …» y el del panel «Fecha de registro» (no «Salida registrada»), porque el filtro mira la salida **o** la entrega.
8. **La consulta masiva de VIN no cambia:** sigue siendo de cualquier fecha y no usa este filtro.

## Consecuencias

- **El backend nuevo tiene que estar desplegado para que «Últimos 30 días» y los rangos de más de 7 días traigan todo.** Mientras Cloud Run tenga el backend viejo, la web sigue siendo correcta para «Hoy», «Ayer» y «Últimos 7 días» (el servidor viejo entrega los entregados de 7 días y todo lo que está en tránsito, y la web filtra), pero un rango más largo mostrará entregados **incompletos** sin que la pantalla pueda saberlo. El backend está en una rama aparte de `sum-bck-modulos` (`feat/seguimiento-filtro-fecha`), **sin mezclar, sin subir y sin desplegar**.
- **Las órdenes en planta ya no se ven en la vista del coordinador** (antes aparecían en «Todos»). Es consecuencia de «en camino y entregado» pedido por el usuario. Si se quisiera verlas, habría que decidir con qué fecha.
- **Un traslado en camino desde hace días no aparece en «Hoy»**: solo se ve en el día en que salió (o con un rango que lo incluya). Con «Últimos 30 días» sí aparece.
- Una respuesta de un rango de hasta 90 días puede traer cientos de filas; la web no pagina (igual que antes).
- La regla de pertenencia al rango está **repetida en dos sitios** (SQL del backend y `trasladoEnRango` de la web). Si cambia una, hay que cambiar la otra (hay pruebas en los dos lados que fijan los casos de borde: medianoche de Lima y entregas que cruzan de día).
- El rango por defecto de un `GET` sin parámetros no cambió, así que una web vieja contra el backend nuevo sigue como antes.
