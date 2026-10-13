# 0006. Subida directa a GCS con URL firmada

Última actualización: 2026-10-13 | Fuente: src/features/traslado/api/storageApi.ts, subidaGcs.ts, docs/02-arquitectura/subida-y-confirmacion.md | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-10 (registrada retroactivamente el 2026-10-13)

## Contexto

El backend entrega una URL firmada (`upload-url`) y la app móvil sube con un PUT. Una app instalada no está sujeta a CORS; un navegador sí.

## Opciones consideradas

1. Subir pasando los bytes por el backend (nuevo endpoint y más carga).
2. Calcar el flujo de la app: pedir URL firmada y hacer el PUT directo.

## Decisión

Opción 2, con las mismas reglas: `Content-Type: image/jpeg` igual al pedido, **sin `Authorization`**, tiempo máximo de 60 s, y ante un 403 pedir una URL nueva hasta 2 veces.

## Consecuencias

- No se añade ningún endpoint al backend.
- **Cada origen de la web necesita una entrada en el CORS del bucket** (`PUT` y `Content-Type`). Hasta que está, la subida falla con «revisa tu conexión o los permisos de almacenamiento». Pasó con la IP de un teléfono y con el dominio de Vercel.
- El backend local firma URLs del bucket de producción ([ADR 0008](0008-no-tocar-produccion.md)).
