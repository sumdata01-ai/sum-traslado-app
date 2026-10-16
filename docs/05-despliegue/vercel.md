# Despliegue en Vercel

Última actualización: 2026-10-15 | Fuente: vercel.json, README.md, docs/07-planificacion/plan-sprints.md, git | Estado: vigente

## Estado

- Repositorio: `sumdata01-ai/sum-traslado-app` (rama `main`). Vercel despliega cada push a `main`.
- **Rutas de la web:** el rewrite `/(.*)` → `index.html` es lo que hace que `/dashboard` (el tablero de llegadas, [ADR 0013](../06-decisiones/0013-tablero-de-llegadas-en-esta-web-por-rol-y-area-en-dashboard.md)) abra al recargar o al entrar directo. Una ruta nueva no debe empezar por `/api` ni `/mobile`. Esa vista pide `/api/llegada-qr/*`, que reenvía al Cloud Run de producción: **necesita el backend nuevo desplegado**.
- Despliegue actual: **https://sum-traslado-app.vercel.app/**.
- Framework «Vite». **No hay variables de entorno** en Vercel.

## `vercel.json`

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*",    "destination": "<backend>/api/:path*" },
    { "source": "/mobile/:path*", "destination": "<backend>/mobile/:path*" },
    { "source": "/(.*)",          "destination": "/index.html" }
  ],
  "headers": [{ "source": "/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] }]
}
```

- Las dos primeras reglas reenvían al backend (el mismo papel que el proxy de Vite en desarrollo), así el navegador ve **un solo origen** y la cookie de refresh viaja bien.
- La tercera devuelve `index.html` para cualquier otra ruta.
- `noindex` evita que se indexe el sitio de prueba.
- `<backend>` es el Cloud Run de **producción** (`sum-backend-secado-gnsgzjfoqa-uc.a.run.app`); la URL real está en `vercel.json`.

## Importante: apunta a producción

Todo lo que se haga en el sitio desplegado (iniciar sesión, tomar una orden, subir una foto, confirmar) es **real**. Se decidió usarlo **solo para ver las pantallas**. Para probar la cámara y la galería sin subir nada: `https://sum-traslado-app.vercel.app/?herramientas` › «Probar la cámara». Las vistas previas de Vercel (una por rama o PR) también apuntan a producción.

## La vista del coordinador (2026-10-15)

`/api/seguimiento/*` usa la misma regla `/api/:path*`: **no hizo falta cambiar `vercel.json`**. La vista está en `main` (`29fcde0`) y solo la ve una cuenta con rol `coordinador`; esa cuenta **no existe todavía en producción** y se crea con un `admin` (`POST /api/users`). Si el alta responde `422 rol no válido`, el backend de producción aún no tiene el rol. No se comprobó el estado del despliegue de Vercel ni el de Cloud Run. Ver [pedido-backend-seguimiento-coordinador.md](../07-planificacion/pedido-backend-seguimiento-coordinador.md).

## CORS del bucket (D3)

La subida de fotos va directo del navegador a GCS, así que el bucket debe permitir el origen `https://sum-traslado-app.vercel.app` con método `PUT` y encabezado `Content-Type`. En la consola de GCP: *Cloud Storage › Buckets › (bucket) › Configuración › Uso compartido de recursos entre dominios › Editar*; se **añade una configuración nueva** sin tocar las existentes. Hasta que esté, la foto se toma y se guarda en el teléfono pero la subida falla con «revisa tu conexión o los permisos de almacenamiento».

> TODO(verificar): al 2026-10-13 el CORS del bucket de producción tenía `http://localhost:5173,https://*.run.app`; confirmar si ya se agregó el origen de Vercel.

## Qué verificar tras un despliegue

1. Carga con HTTPS válido y sin avisos.
2. La sesión sobrevive a recargar (confirmado en iPhone el 2026-10-12).
3. Con `?herramientas`: «Contexto seguro (HTTPS): sí».
