# Sesión 2026-10-12 — Envío de fotos, galería, escáner y despliegue

Herramienta: Claude Code
Registrada retroactivamente el 2026-10-13 a partir de [TODO.md](../../../TODO.md) y del historial de la sesión.

## Objetivo
Completar el envío (E4-01 y E4-02), añadir la foto de la galería (T12) y el escáner de VIN (O-05), y publicar la página para probar en teléfonos.

## Cambios realizados (archivos)
- E4-01: `api/storageApi.ts`, `api/subidaGcs.ts`, `data/subidaFotos.ts`, estados de subida en `data/fotoStore*.ts` y `data/formularioCaptura.ts`; `FichaZona`, `FormularioCaptura`, `CapturaPage`.
- E4-02: `api/trasladoApi.ts` (confirmaciones), `data/confirmacionTraslado.ts`, `ConfirmarDespacho`, `ListaOrdenes.alConfirmar`, `ConteoFotosPort.borrarDeMomento`.
- T12: `camera/fotoDeArchivo.ts`, `CameraWidget` (galería), `captureFrame.codificarJpeg`.
- O-05: `camera/escaneo.ts`, `components/EscanerVin.tsx`, `domain/vin.extraerVin`, botón «Escanear» en la home.
- Herramientas de prueba ocultas salvo con `?herramientas`.
- `vercel.json`, README y TODO; repositorio publicado en GitHub (`sumdata01-ai/sum-traslado-app`) y desplegado en Vercel.

## Decisiones tomadas
- [ADR 0004](../../06-decisiones/0004-solo-con-internet.md): solo con internet.
- [ADR 0008](../../06-decisiones/0008-no-tocar-produccion.md): ninguna prueba toca producción.
- [ADR 0009](../../06-decisiones/0009-vercel-contra-produccion-solo-para-ver.md): Vercel apunta a producción, solo para ver pantallas.
- [ADR 0010](../../06-decisiones/0010-galeria-y-escaner-con-jpeg-verificado.md): galería y escáner.

## Problemas encontrados y solución
- **El backend local firma URLs del bucket de producción.** Las E2E de subida dejaron 5 fotos de prueba en `sum-fotos-prod`. Se apagó `e2e/subida.spec.ts` y se documentó la regla.
- **La subida falla desde otros orígenes por el CORS del bucket** (IP del teléfono, dominio de Vercel). Se añade el origen en la consola de GCP como una configuración nueva, sin tocar las existentes.
- **El guardado de fotos falló en el iPhone** mientras el certificado de desarrollo no era de confianza; funcionó tras instalarlo.
- **La protección de toque accidental (500 ms)** hacía que un «Usar» automático de Playwright se ignorara: la E2E espera antes de pulsar.

## Pendientes / siguiente paso
Pruebas en teléfono (JPEG, 360 px, permisos, galería HEIC, escáner con etiqueta real, Android); CORS del origen de Vercel si se quiere subir desde ahí; bucket y backend de desarrollo.

## Aprendizajes a llevar a memoria
Ver [convenciones.md](../convenciones.md) (trampas del shell, mutación, regla de producción) y [pruebas-unitarias.md](../../04-calidad/pruebas-unitarias.md).
