# 0005. Las fotos pasan por IndexedDB (Dexie) antes de subirse

Última actualización: 2026-10-13 | Fuente: src/features/traslado/data/fotoStoreDexie.ts, trasladoDb.ts | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-09 (registrada retroactivamente el 2026-10-13)

## Contexto

Un iPhone cierra y recarga pestañas con facilidad y una foto solo en memoria se perdería. «Reintentar» y la subida necesitan el archivo.

## Opciones consideradas

1. Subir directo desde memoria y guardar solo texto (zona, ruta, hora).
2. Guardar el Blob en IndexedDB, verificarlo leyéndolo de vuelta y subir desde ahí.

## Decisión

Opción 2: `FotoStoreDexie` inserta una fila `writing`, escribe el Blob, lo lee de vuelta, y solo entonces lo promueve a `fotos` (estado `pending`). La subida **lee el archivo del almacén** en cada intento.

## Consecuencias

- Las fotos sobreviven a cerrar sesión, cerrar la app y recargar (confirmado en iPhone con iOS 26.5).
- En el iPhone el guardado falló mientras el certificado de desarrollo no era de confianza y funcionó al instalarlo (observado; la causa exacta no se aisló): conviene HTTPS válido ([ADR 0007](0007-https-local-con-mkcert.md)).
- Si en algún dispositivo IndexedDB fallara con archivos, la alternativa es la opción 1 (subir desde memoria y guardar solo metadatos).
