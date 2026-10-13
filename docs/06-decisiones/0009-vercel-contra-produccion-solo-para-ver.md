# 0009. Vercel apunta a producción, solo para ver las pantallas

Última actualización: 2026-10-13 | Fuente: vercel.json, docs/05-despliegue/vercel.md | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-12 (registrada retroactivamente el 2026-10-13)

## Contexto

Se quiere probar la página en teléfonos con HTTPS válido y sin instalar certificados. Un sitio en Vercel no alcanza el `localhost:8050`, así que sus `rewrites` deben apuntar a un backend público: hoy solo existen los de producción.

## Opciones consideradas

1. No desplegar hasta tener un backend de desarrollo público.
2. Desplegar apuntando a producción y usarlo solo para ver pantallas.
3. Exponer el backend local por un túnel.

## Decisión

Opción 2. `vercel.json` reenvía `/api` y `/mobile` al Cloud Run de producción. Las pruebas del flujo se siguen haciendo en local. Para probar cámara y galería sin subir nada: `?herramientas` › «Probar la cámara».

## Consecuencias

- Cualquier acción real en el sitio desplegado (login, tomar, subir, confirmar) escribe en producción.
- Las vistas previas de Vercel también apuntan a producción.
- Para subir fotos desde Vercel hay que agregar su origen al CORS del bucket de producción: contradice [ADR 0008](0008-no-tocar-produccion.md) y se decide aparte.
