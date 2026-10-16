# 0012. Marcación de llegada por QR: solo el lado del conductor, solo con internet, sin guardar nada

Última actualización: 2026-10-15 | Fuente: src/features/llegada/, src/app/LlegadaPage.tsx, sum-app `documentos/modulos/marcacion-qr-llegada.md` (repositorio hermano) | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-15 (pedida por el usuario)

## Contexto

La app móvil (`sum-app`) ya tiene la **marcación de llegada por QR**: una tablet fija en el punto muestra un QR que cambia cada 30 s (modo punto, cuenta con rol `utilidad`) y el conductor lo escanea desde su teléfono; el servidor (`POST /mobile/llegadas`) valida el código, la geozona y le da un turno del día. El backend y el modo punto de la tablet **ya están hechos y en producción**. El usuario pidió traer a esta web **solo lo que hace el conductor**: registrar su llegada.

El documento del módulo advierte que llevar el escaneo a «una web del portal» contradice el invariante «el operario nunca entra al portal». Esta web **no es el portal**: es el front de Traslado que sí usa el operario, así que el invariante no se aplica aquí.

## Opciones consideradas

1. Portar también el QR de la tablet (modo punto) y la vista del supervisor. **Descartada:** el usuario dijo que lo demás ya está implementado, y el secreto del punto no tiene dónde guardarse de forma segura en un navegador.
2. Dibujar la pantalla del conductor igual que la app, pero guardando el escaneo para enviarlo después si no hay señal. **Descartada:** el MVP de la app es solo online y esta web también lo es ([ADR 0004](0004-solo-con-internet.md)).
3. Solo el lado del conductor, mismo contrato y mismas reglas que la app, solo con internet y sin persistencia. **Elegida.**

## Decisión

- **Alcance:** un botón «Marcar llegada» en la home de Traslado abre una pantalla con el recorrido permisos → escaneo → ubicación → envío → resultado. Nada de la tablet, nada del supervisor y **sin la franja «Llegada registrada»** del inicio (no se pidió).
- **Contrato idéntico al de la app:** `POST /mobile/llegadas` con **exactamente cuatro campos** (`payload`, `latitud`, `longitud`, `precision_m`), ninguna fecha, el texto del QR **tal cual** (sin `trim()` ni mayúsculas: el código distingue mayúsculas), y los mismos textos para cada resultado. Los rechazos de negocio llegan como **resultado**, no como excepción, y un **403 no cierra la sesión** (un conductor que escanea con un rol sin permiso no debe quedar deslogueado).
- **Ubicación:** solo un fix de **20 s como máximo** (se mide en valor absoluto), nunca «la última posición conocida» (`maximumAge: 0`, alta precisión); espera de **30 s** como tope; con «precisión insuficiente» espera un fix mejor y reenvía sola. Estas constantes son las de la app (`llegada_ubicacion.dart`) y siguen sin medirse en el lugar.
- **Sin persistencia:** el estado vive solo en un store externo (`ControladorLlegada`) mientras dura la pantalla. No hay Dexie ni `localStorage`. Al salir se sueltan el GPS, la cámara y los temporizadores, y una respuesta que llegue tarde se descarta.
- **Un envío por escaneo:** solo cuenta el primer QR leído y nunca hay dos peticiones a la vez. Reenviar el mismo QR es seguro (el servidor responde 200 con el mismo evento).
- **Visor propio, no el del VIN:** `EscanerQr` reutiliza la cámara y el lector (`@zxing`) pero **no normaliza** el texto. No se modificó `EscanerVin`, que sí normaliza.

## Consecuencias

- El permiso de **ubicación** lo pide el navegador al tocar «Permitir cámara y ubicación»; si se niega hay una pantalla propia que explica cómo permitirla en los ajustes del navegador. No existe en la app (Android pregunta aparte).
- `watchPosition` en iPhone puede **no volver a emitir** si el teléfono está quieto: si hace falta esperar una mejor precisión, el tope de 30 s acaba en «No se pudo fijar tu ubicación con precisión» y el conductor reintenta. **No se probó en un iPhone.**
- La web necesita HTTPS para la cámara y la ubicación (Vercel y `npm run dev:https` lo cumplen); `vercel.json` no pone `Permissions-Policy`, así que no las bloquea.
- Cada llegada de prueba contra un backend **real** escribe una llegada y un turno; por eso las pruebas usan servidores falsos ([ADR 0008](0008-no-tocar-produccion.md)).
- El controlador es **reutilizable tras `dispose()`** porque React (`StrictMode`) monta, desmonta y vuelve a montar cada componente en desarrollo.
