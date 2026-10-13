# HTTPS local para probar con un teléfono

Última actualización: 2026-10-13 | Fuente: vite.config.ts, README.md | Estado: vigente

Una IP de red por HTTP **no es contexto seguro** y el navegador bloquea `getUserMedia`. Para probar la cámara en un teléfono se usa `npm run dev:https`, que escucha en `0.0.0.0` y sirve por HTTPS.

> En la PC no hace falta nada de esto: usa `npm run dev`. Y para ver la versión desplegada en el teléfono no hace falta ningún certificado (ver [vercel.md](../05-despliegue/vercel.md)).

## Camino recomendado: certificado de mkcert

1. Instalar mkcert (en Windows, `winget install FiloSottile.mkcert`) y **abrir una terminal nueva**. Luego `mkcert -install`. Si falla solo el paso de Java (`keytool`, acceso denegado), se puede ignorar: no afecta a este proyecto.
2. En la raíz del proyecto, con la IP de la PC (`ipconfig`):
   ```
   mkdir .certs
   mkcert -cert-file .certs/dev.pem -key-file .certs/dev-key.pem localhost 127.0.0.1 ::1 192.168.X.X
   ```
3. Arrancar `npm run dev:https`. Vite usa `.certs/dev.pem` y `.certs/dev-key.pem` automáticamente. `.certs/` no se versiona.
4. **iPhone:** llevar solo `rootCA.pem` (la ruta sale de `mkcert -CAROOT`) al teléfono. Si no se reconoce como perfil, copiarlo a `rootCA.crt`. Instalarlo en *Ajustes › General › VPN y gestión de dispositivos* y **activarlo** en *Ajustes › General › Información › Ajustes de confianza de certificados*.
5. **Android:** instalar `rootCA.pem` como certificado de CA.
6. Abrir `https://192.168.X.X:5173` en el teléfono. Al pie de la home, en las herramientas de prueba (ver más abajo), debe decir «Contexto seguro (HTTPS): sí».

**Nunca** enviar `rootCA-key.pem` ni servir la carpeta de mkcert: contiene la clave de la autoridad.

## Camino de respaldo: certificado autofirmado

Sin `.certs/`, Vite genera uno autofirmado (`@vitejs/plugin-basic-ssl`). Sirve para ver la página, pero el teléfono mostrará una advertencia y **no se garantiza que la cámara funcione**; en pruebas, mientras el certificado no era de confianza, el guardado de fotos en el iPhone falló y funcionó al instalarlo (observado; la causa exacta no se aisló). No se usa como prueba válida.

## Si el teléfono no llega a la PC

- Ambos en la misma red Wi-Fi, y la red de la PC marcada como **privada**.
- Permitir el puerto 5173 en el Firewall de Windows.
- Si cambia la IP de la PC, hay que regenerar el certificado con la nueva.
- `dev:https` abre el proxy al backend local a quien esté en la misma red: usarlo solo en redes de confianza.

## Herramientas de prueba (ocultas)

La home no las muestra. Se ven añadiendo `?herramientas` a la dirección. Traen la comprobación de HTTPS y cámara y «Probar la cámara», que **solo guarda en el teléfono y no sube nada**.
