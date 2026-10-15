# 0008. Ninguna prueba toca recursos de producción

Última actualización: 2026-10-13 | Fuente: TODO.md (Regla de producción), e2e/subida.spec.ts | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-12 (registrada retroactivamente el 2026-10-13)

## Contexto

El backend local (`localhost:8050`) usa la base de desarrollo, pero **firma las URLs de subida del bucket `sum-fotos-prod`**, y los Cloud Run son de producción. Las pruebas de subida dejaron fotos en ese bucket.

## Opciones consideradas

1. Permitir pruebas puntuales contra producción con cuidado.
2. Prohibirlas: para pruebas se usa la base de desarrollo local, y cualquier escritura fuera de ella se pregunta.

## Decisión

Opción 2, decisión del usuario. Consecuencias inmediatas: `e2e/subida.spec.ts` apagada por defecto (y bloqueada si el bucket tiene «prod» en el nombre); la confirmación real (`confirmar-salida`/`entrega`) no se prueba de punta a punta; antes de cualquier prueba que escriba fuera de la base local se pregunta.

## Consecuencias

- Quedan 5 fotos de prueba en el bucket de producción (bajo `traslado/2026/10/`); el usuario decidió dejarlas.
- Para probar la subida y la confirmación de verdad hace falta un backend y un bucket de desarrollo, con CORS para los orígenes de prueba.
- La regla está también en `CLAUDE.md` y `AGENTS.md`.
- **No se puede dar por hecho que `localhost:8050` use la base de desarrollo:** el 2026-10-13 sus datos coincidieron con los de producción hasta el milisegundo ([discrepancias.md](../ai/discrepancias.md) #11). Por eso las pruebas que toman o sueltan órdenes no se corren contra ese puerto sin confirmar a qué base apunta.
