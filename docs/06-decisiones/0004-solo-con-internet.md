# 0004. La web es solo con internet; cada foto se sube al tomarla

Última actualización: 2026-10-13 | Fuente: docs/07-planificacion/backlog.md (E4-01, E4-02), TODO.md | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-10 (registrada retroactivamente el 2026-10-13)

## Contexto

La app móvil guarda todo y sincroniza después (cola, drenador, bloqueos). Una web no se puede abrir sin internet, así que diseñar un modo sin señal es trabajo para un caso que no ocurre.

## Opciones consideradas

1. Calcar el modelo de la app: cola de envío en segundo plano, drenador entre pestañas, reintentos automáticos.
2. Con internet: subir cada foto al tomarla; si falla, mostrar el error con «Reintentar».

## Decisión

Opción 2. Cada foto se sube en cuanto se guarda, con un solo intento y «Reintentar» por foto. El botón final **no «manda todo»**: «Confirmar salida» / «Confirmar entrega» solo registra el despacho con las rutas de las fotos ya subidas. Las historias E4-03 y E4-04 (cola y sesión vencida con fotos pendientes) se **descartan**.

## Consecuencias

- Mucho menos código y menos estados raros.
- Sin internet no se hace nada; si se corta a mitad, las fotos guardadas esperan el «Reintentar».
- Quedó construido «tomar sin señal» (toma pendiente que se envía al actualizar); se decidió dejarlo.
