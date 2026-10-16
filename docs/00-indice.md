# Índice de la documentación

Última actualización: 2026-10-16 | Fuente: docs/ | Estado: vigente

Punto de entrada del repositorio: [README.md](../README.md). Memoria para sesiones con LLM: [CLAUDE.md](../CLAUDE.md) y [AGENTS.md](../AGENTS.md).

## 01 · Visión y alcance
- [vision-y-alcance.md](01-vision-y-alcance/vision-y-alcance.md): qué es, qué hace hoy y endpoints que usa.
- [patron-traslado-web.md](01-vision-y-alcance/patron-traslado-web.md): contrato de datos y desenlaces (referencia, del 2026-10-09).
- [marcacion-llegada-qr.md](01-vision-y-alcance/marcacion-llegada-qr.md): la marcación de llegada por QR del conductor (L-01): qué hace, el contrato y lo que no se probó.
- [tablero-llegadas-qr.md](01-vision-y-alcance/tablero-llegadas-qr.md): el tablero de solo lectura (`/dashboard`) para supervisores: orden de llegada y distancia, rechazos y puntos.
- [propuesta-vista-cliente.md](01-vision-y-alcance/propuesta-vista-cliente.md): propuesta (borrador) de una vista para que el cliente siga sus vehículos: PDI, en camino, GPS y ubicación.

## 02 · Arquitectura
- [vision-general.md](02-arquitectura/vision-general.md): contexto, contenedores y capas.
- [estructura-src.md](02-arquitectura/estructura-src.md): árbol de `src/`.
- [navegacion-y-sesion.md](02-arquitectura/navegacion-y-sesion.md): pantallas, sesión y pestañas.
- [estado-y-datos.md](02-arquitectura/estado-y-datos.md): stores, Dexie, cliente HTTP.
- [camara-y-fotos.md](02-arquitectura/camara-y-fotos.md): cámara, captura, galería, escáner, estados de foto.
- [subida-y-confirmacion.md](02-arquitectura/subida-y-confirmacion.md): subida a GCS y confirmaciones.
- [componentes.md](02-arquitectura/componentes.md) · [estilos-y-ui.md](02-arquitectura/estilos-y-ui.md)
- [arquitectura-front.md](02-arquitectura/arquitectura-front.md): diseño original (propuesta; ver discrepancias).

## 03 · Configuración
- [entorno-local.md](03-configuracion/entorno-local.md) · [https-local.md](03-configuracion/https-local.md) · [variables-entorno.md](03-configuracion/variables-entorno.md)
- [build-vite.md](03-configuracion/build-vite.md) · [typescript.md](03-configuracion/typescript.md) · [lint-y-formato.md](03-configuracion/lint-y-formato.md)

## 04 · Calidad
- [pruebas-unitarias.md](04-calidad/pruebas-unitarias.md) · [pruebas-e2e.md](04-calidad/pruebas-e2e.md) · [convenciones-codigo.md](04-calidad/convenciones-codigo.md)

## 05 · Despliegue
- [vercel.md](05-despliegue/vercel.md)

## 06 · Decisiones (ADR)
[0000 plantilla](06-decisiones/0000-plantilla.md) ·
[0001 stack](06-decisiones/0001-stack-vite-react-typescript.md) ·
[0002 capas](06-decisiones/0002-capas-y-dominio-puro.md) ·
[0003 mismo origen](06-decisiones/0003-mismo-origen-por-proxy.md) ·
[0004 solo con internet](06-decisiones/0004-solo-con-internet.md) ·
[0005 fotos en IndexedDB](06-decisiones/0005-fotos-en-indexeddb.md) ·
[0006 subida directa a GCS](06-decisiones/0006-subida-directa-a-gcs.md) ·
[0007 HTTPS con mkcert](06-decisiones/0007-https-local-con-mkcert.md) ·
[0008 no tocar producción](06-decisiones/0008-no-tocar-produccion.md) ·
[0009 Vercel contra producción](06-decisiones/0009-vercel-contra-produccion-solo-para-ver.md) ·
[0010 galería y escáner](06-decisiones/0010-galeria-y-escaner-con-jpeg-verificado.md) ·
[0011 vista del coordinador](06-decisiones/0011-vista-del-coordinador-por-rol-solo-lectura-y-en-memoria.md) ·
[0012 llegada por QR](06-decisiones/0012-marcacion-de-llegada-por-qr-solo-lado-conductor-y-solo-con-internet.md) ·
[0013 tablero de llegadas](06-decisiones/0013-tablero-de-llegadas-en-esta-web-por-rol-y-area-en-dashboard.md)

## 07 · Planificación
- [estado-actual.md](07-planificacion/estado-actual.md): resumen y fuente de cada cosa.
- [backlog.md](07-planificacion/backlog.md) · [plan-sprints.md](07-planificacion/plan-sprints.md) · [TODO.md](../TODO.md) (lista viva)
- [plan-dashboard-llegadas.md](07-planificacion/plan-dashboard-llegadas.md): plan (borrador) del dashboard de llegadas por QR para supervisores: primero el backend, después la web; historias, sprints y compuerta.
- [pedido-backend-vin-otras-ordenes.md](07-planificacion/pedido-backend-vin-otras-ordenes.md): pedido al backend para decir que una orden ya salió.
- [pedido-backend-seguimiento-coordinador.md](07-planificacion/pedido-backend-seguimiento-coordinador.md): pedido al backend: el rol `coordinador` y el endpoint de seguimiento (contrato contra el que está construida la web).
- [mapeo-rol-coordinador.md](07-planificacion/mapeo-rol-coordinador.md): mapeo del rol `coordinador` y de su acceso a la vista de seguimiento (cruza backend, portal, app y esta web).

## Memoria para LLM (`docs/ai/`)
- [contexto-proyecto.md](ai/contexto-proyecto.md) · [convenciones.md](ai/convenciones.md) · [comandos.md](ai/comandos.md) · [glosario.md](ai/glosario.md) · [discrepancias.md](ai/discrepancias.md)
- [uso-con-llm.md](ai/uso-con-llm.md): mensajes para iniciar y cerrar una sesión y qué consultar según la tarea.
- Bitácoras: [docs/ai/sesiones/](ai/sesiones/) (plantilla: [_plantilla.md](ai/sesiones/_plantilla.md)).
