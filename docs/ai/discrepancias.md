# Discrepancias entre documentos y código

Última actualización: 2026-10-13 | Fuente: docs/02-arquitectura/arquitectura-front.md, README.md, TODO.md, src/ | Estado: vigente

Cuando un documento contradice al código, **manda el código**. Esta lista es lo detectado al reorganizar la documentación (2026-10-13).

| # | Documento | Dice | El código hace | Qué se hizo |
|---|---|---|---|---|
| 1 | [arquitectura-front.md](../02-arquitectura/arquitectura-front.md) §4 | Estructura con `sync/` (drenador, Web Locks), `pages/`, `diagnostico/`, `app/` con router, y pruebas con MSW. | No existe ninguna de esas carpetas ni MSW; las pantallas viven en `app/` y no hay router. | Se dejó el diseño original con un aviso; lo vigente está en [vision-general.md](../02-arquitectura/vision-general.md) y [estructura-src.md](../02-arquitectura/estructura-src.md). |
| 2 | arquitectura-front.md §7 y backlog E4-03, E4-04 | Drenador con candado entre pestañas y cola automática. | No existe: se descartaron por la decisión de «solo con internet». | Marcado en backlog y TODO; ver [ADR 0004](../06-decisiones/0004-solo-con-internet.md). |
| 3 | backlog E4-01 AC3 | Hasta 4 intentos con espera exponencial. | Un solo intento y «Reintentar» por foto. | El backlog ya trae la AC corregida con fecha. |
| 4 | README.md (sección «Estructura») | Listaba solo `app`, `core/config`, `core/http`, `core/ui` y `test`, y decía que `features/traslado` «se crea con F-03». | Existen `core/auth`, `core/storage` y `features/traslado` completo. | Corregido en el README. |
| 5 | README.md | Mencionaba una IP de red concreta de la PC del autor. | — | Reemplazada por `192.168.X.X`. |
| 6 | `.env.example` | Solo documenta `TRASLADO_USUARIO`, `TRASLADO_CLAVE` y `VITE_PROXY_TARGET`. | El código también lee `VITE_API_URL`, `TRASLADO_BACKEND_URL` y `TRASLADO_BUCKET_DE_PRUEBA`. | Documentadas en [variables-entorno.md](../03-configuracion/variables-entorno.md). TODO(verificar): ¿añadirlas al ejemplo? |
| 7 | README (pruebas) y plan-sprints §2.2 | La cookie de refresh del backend de desarrollo no se guarda en Chrome y Edge, y la sesión se pierde al recargar. | Contra el despliegue de Vercel (backend de producción, mismo origen) la sesión **sí** sobrevive a recargar (iPhone, 2026-10-12). El fallo es del backend de desarrollo (`SameSite=None` sin `Secure`). | Se mantiene `e2e/login.spec.ts` como fallo esperado en local; anotado en [navegacion-y-sesion.md](../02-arquitectura/navegacion-y-sesion.md). |
| 8 | plan-sprints.md §2.1–2.3 y «Registro de avances» de TODO.md | Registran los mismos avances por separado. | — | Sin reconciliar. Ver [estado-actual.md](../07-planificacion/estado-actual.md). |
| 9 | [patron-traslado-web.md](../01-vision-y-alcance/patron-traslado-web.md) | Se escribió leyendo ramas `feature/…` de `sum-app` y del backend. | Puede diferir de lo desplegado (el propio documento lo advierte). | Sin cambio; verificar ante cualquier duda contra el backend. |
| 10 | arquitectura-front.md | Enlaza a `../sum-app` y `../sum-portal-front` (repositorios hermanos). | Tras mover el archivo a `docs/02-arquitectura/`, los enlaces suben tres niveles. | Corregidos. Solo funcionan con los repositorios hermanos clonados. |

| 11 | `CLAUDE.md`, [ADR 0008](../06-decisiones/0008-no-tocar-produccion.md), README y [pruebas-e2e.md](../04-calidad/pruebas-e2e.md) | El backend en `localhost:8050` usa la base de datos de **desarrollo**. | **Confirmado por el usuario (2026-10-13), con un matiz:** ese backend **por defecto lee producción** y el usuario fija las variables de entorno para que apunte a local al arrancarlo. Las órdenes que devuelve (por ejemplo la 3697) coinciden con las vistas en producción y cambian en vivo: queda sin explicar si la base local es una copia sincronizada. La API no dice a qué base apunta. | Vigilar al arrancar: si se levanta **sin** esas variables, `:8050` lee producción. Antes de correr pruebas que toman o sueltan órdenes (`*.backend.test.ts`, E2E) hay que estar seguro de cómo se arrancó. Pendiente de decidir: un guard que lo compruebe. |

> TODO(verificar): el mapa de la skill pide `docs/01-vision-y-alcance.md` y `enrutamiento.md`; aquí son una carpeta (`01-vision-y-alcance/`) y `navegacion-y-sesion.md` porque el proyecto no tiene router y hay dos documentos de visión.
