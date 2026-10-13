# 0010. La galería y el escáner reutilizan el JPEG verificado; zxing se carga bajo demanda

Última actualización: 2026-10-13 | Fuente: src/features/traslado/camera/fotoDeArchivo.ts, escaneo.ts, docs/02-arquitectura/camara-y-fotos.md | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-12 (registrada retroactivamente el 2026-10-13)

## Contexto

El usuario pidió poder usar fotos de la galería (T12) y escanear el VIN con QR o código de barras (O-05). La app móvil ya hacía ambas cosas.

## Opciones consideradas

1. Subir el archivo de la galería tal cual (formatos y orientación variables, con ubicación en los metadatos).
2. Decodificar y recodificar como JPEG verificado, igual que una foto de cámara.
3. Para leer códigos: `BarcodeDetector` nativo (no existe en Safari) o una librería.

## Decisión

Galería: decodificar respetando la orientación, reducir a 1920 px y recodificar como JPEG (`codificarJpeg`, compartido con la cámara), con la fecha de modificación del archivo. Escáner: `@zxing/browser` (la misma del portal) cargada solo al abrir el escáner; lee QR, Code 128, Code 39 y Data Matrix; el texto pasa por `extraerVin`.

## Consecuencias

- Las fotos de galería salen sin metadatos y con el mismo formato que las de cámara.
- Hoy el servidor no distingue una foto de galería de una de cámara; marcarla (campo `comentario` al confirmar) queda como decisión abierta.
- `@zxing` pesa unos 480 kB, en un fragmento aparte que solo se descarga al escanear.
