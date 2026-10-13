# Visión general de la arquitectura

Última actualización: 2026-10-13 | Fuente: src/, vite.config.ts, vercel.json, docs/02-arquitectura/arquitectura-front.md | Estado: vigente

> El diseño original está en [arquitectura-front.md](arquitectura-front.md) (propuesta del 2026-10-09). **Lo vigente es este documento**; las diferencias están en [discrepancias.md](../ai/discrepancias.md).

## Contexto (C4 nivel 1)

```mermaid
flowchart LR
  operario([Operario<br/>iPhone o Android]) -->|usa| web[Traslado web<br/>SPA React]
  web -->|/api y /mobile<br/>mismo origen| backend[Backend sum-bck-modulos]
  web -->|PUT con URL firmada| gcs[(Bucket GCS<br/>fotos)]
  backend -->|firma URLs| gcs
  app[sum-app Flutter] -.->|mismos endpoints| backend
  supervisor([Supervisor]) -->|portal| backend
```

## Contenedores (C4 nivel 2)

```mermaid
flowchart TB
  subgraph navegador[Navegador del operario]
    spa[SPA React 19 + TypeScript]
    idb[(IndexedDB<br/>Dexie)]
    cam[Cámara getUserMedia]
    spa --- idb
    spa --- cam
  end
  subgraph borde[Mismo origen]
    vite[Vite dev server<br/>proxy /api y /mobile]
    vercel[Vercel<br/>rewrites /api y /mobile]
  end
  spa --> vite
  spa --> vercel
  vite --> be[Backend localhost:8050]
  vercel --> prod[Cloud Run de producción]
  spa -->|PUT directo| gcs[(GCS)]
```

- **Mismo origen:** el navegador solo habla con su propio servidor (Vite en desarrollo, Vercel desplegado), que reenvía `/api/*` y `/mobile/*` al backend. Así no hay CORS contra el backend y la cookie de refresh viaja como cookie del mismo sitio ([ADR 0003](../06-decisiones/0003-mismo-origen-por-proxy.md)).
- **La única excepción** es el PUT de cada foto a GCS, que va directo desde el navegador y por eso exige CORS en el bucket ([ADR 0006](../06-decisiones/0006-subida-directa-a-gcs.md)).

## Capas

```mermaid
flowchart TD
  app[app/<br/>composición y pantallas raíz] --> comp[components/ y camera/]
  comp --> data[data/<br/>controladores y almacenes]
  data --> api[api/<br/>clientes y esquemas zod]
  data --> domain
  api --> domain
  comp --> domain
  app --> core[core/<br/>http, auth, ui, storage, config]
  data --> core
  domain[domain/<br/>reglas puras]
```

- **`domain/`** es puro: no importa React, Dexie, el router, capas superiores ni globales del navegador. ESLint lo exige y una prueba lo comprueba ([ADR 0002](../06-decisiones/0002-capas-y-dominio-puro.md)).
- **`data/`** contiene los controladores como **stores externos** (`getSnapshot` + `suscribir`, leídos con `useSyncExternalStore`) y los puertos de almacenamiento con sus implementaciones Dexie y en memoria.
- **`app/composicion.ts`** es el único lugar donde se conectan las piezas reales; las pruebas arman sus propias piezas con dobles.

Detalle por área: [estructura-src.md](estructura-src.md), [navegacion-y-sesion.md](navegacion-y-sesion.md), [estado-y-datos.md](estado-y-datos.md), [camara-y-fotos.md](camara-y-fotos.md), [subida-y-confirmacion.md](subida-y-confirmacion.md).
