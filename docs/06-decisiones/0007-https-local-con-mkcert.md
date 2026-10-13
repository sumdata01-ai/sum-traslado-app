# 0007. HTTPS local con certificados de mkcert

Última actualización: 2026-10-13 | Fuente: vite.config.ts, README.md | Estado: vigente

- **Estado:** aceptada
- **Fecha:** 2026-10-09 (registrada retroactivamente el 2026-10-13)

## Contexto

`getUserMedia` exige contexto seguro; una IP de red por HTTP no lo es. Hay que probar la cámara en teléfonos reales.

## Opciones consideradas

1. Certificado autofirmado de `@vitejs/plugin-basic-ssl`: el teléfono lo rechaza o desconfía.
2. Certificado de una autoridad local (mkcert) instalada en el teléfono.
3. Probar siempre contra el despliegue de Vercel (HTTPS válido).

## Decisión

Camino recomendado: mkcert (`.certs/dev.pem` y `.certs/dev-key.pem`, fuera de git); el autofirmado queda de respaldo, sin garantía de que la cámara funcione. Para ver la versión desplegada en el teléfono no hace falta ningún certificado.

## Consecuencias

- Cada cambio de IP exige regenerar el certificado.
- Instalar la autoridad en el teléfono es un proceso manual (ver [https-local.md](../03-configuracion/https-local.md)).
- Nunca se comparte `rootCA-key.pem`.
