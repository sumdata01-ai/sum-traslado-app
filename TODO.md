# Traslado web — lista de tareas

**Actualizado:** 2026-10-15 (se marca a medida que se avanza).
**Detalle de cada historia:** [backlog.md](docs/07-planificacion/backlog.md) · **Sprints, decisiones y riesgos:** [plan-sprints.md](docs/07-planificacion/plan-sprints.md) · **Diseño:** [arquitectura-front.md](docs/02-arquitectura/arquitectura-front.md)

**Leyenda:** `[x]` hecho y verificado con pruebas automáticas · `[~]` hecho, falta una verificación que solo se puede hacer en un teléfono o navegador real · `[ ]` pendiente · `[!]` bloqueado por otra persona

**Estado de la suite:** ver el último recuento en la sección «Registro de avances» al final.

---

## Sprint 0 — Fundaciones
- [x] **F-01** Esqueleto del proyecto y entorno HTTPS local (probado en PC, iPhone y Android)
- [~] **F-02** Tokens y componentes base — falta mirar en un teléfono que no desborde a 360 px (AC4)
- [x] **F-03** Dominio puro: zonas, estados y reglas
- [x] **A-01** Cliente HTTP (401 → renovar y reintentar, 403, tiempo límite)

## Sprint 1 — Cámara
- [x] **S-01** Spike: ¿Safari reabre la cámara sin un toque al volver de segundo plano? — **Sí**: el usuario lo probó el 2026-10-12 en iPhone (iOS 26.5, Safari, desde Vercel): al bloquear la pantalla o cambiar de app, la cámara **vuelve sola**. Falta repetirlo en Android
- [~] **T1** Soporte y errores de la cámara — falta probar los textos de permisos en iPhone y Android
- [~] **T2** Sesión de cámara con máquina de estados — iPhone: bloquear pantalla y cambiar de app confirmado (2026-10-12). Falta la llamada entrante en iPhone y todo en Android
- [~] **T3** Capturar un frame JPEG verificado — falta comprobar en dispositivo que el archivo es JPEG
- [~] **T5** Vista previa «Usar / Repetir», contador y fichas por zona — falta mirarla en un teléfono

## Sprint 2 — Guardado y login
- [~] **T4a** Guardar la foto en Dexie con verificación — **iPhone (iOS 26.5, Safari, desde Vercel): confirmado el 2026-10-12** que la foto se guarda y **sobrevive a cerrar sesión y a cerrar la app**. Falta Android y probar la recarga con la pestaña abierta (riesgo R2)
- [~] **T4b** Reconciliar al abrir — misma comprobación en dispositivo
- [x] **A-02** Login y sesión (opción A: cookie) — hecha; la recarga mantiene la sesión en el iPhone desde Vercel (producción). **Solo en local, contra el backend de desarrollo, la cookie sigue sin guardarse en Chrome y Edge**
  - [x] Protocolo comprobado contra el backend de desarrollo (login fallido = HTTP 200 con `success:false`; el refresh rota la cookie y rechaza la anterior; el refresh no trae el `username`)
  - [x] Módulo de sesión: token solo en memoria, refresh con un solo vuelo y candado entre pestañas, sin cerrar sesión por falta de red, logout pendiente recordado
  - [x] Pantallas: login, sin acceso, sin conexión, comprobando sesión
  - [x] AC1 login válido · [x] AC2 credenciales inválidas · [x] AC3 sin `traslado` · [x] AC5 logout · [x] AC6 sin bucle
  - [x] AC4 recarga restaura la sesión — **confirmado por el usuario el 2026-10-12 en el iPhone, desde Vercel (backend de producción, mismo origen): la sesión se mantiene al recargar.** Sigue fallando solo contra el backend de DESARROLLO (`:8050`), cuya cookie Chrome y Edge no guardan (ver «Pedidos a terceros»)
  - [x] 9 pruebas contra el backend real (base de desarrollo), que se omiten solas sin credenciales o sin backend
  - [x] Prueba en Chrome y Edge reales (Playwright): **hallazgo confirmado**, ver «Pedidos a terceros»
  - [ ] Quitar la marca de «fallo esperado» de `e2e/login.spec.ts` cuando el backend corrija la cookie

- [~] **A-03** Una sola sesión en todas las pestañas *(añadida el 2026-10-09)* — hecha en código; «pasar sola a otra persona» no se puede probar en un navegador real hasta que el backend corrija la cookie
  - [x] La identidad (usuario e id) sale del token, no de la sesión anterior
  - [x] Canal entre pestañas (`BroadcastChannel`, con el evento `storage` de respaldo)
  - [x] Login en otra pestaña → esta pasa a ese usuario sola · logout en otra → esta va al login (también sin red)
  - [x] Un refresh que trae otro usuario cuenta como cambio de usuario
  - [x] La caché de órdenes recuerda de quién es y se borra si entra otro
  - [x] Pruebas unitarias (varias pestañas simuladas), de App y E2E con dos pestañas reales (el logout)
  - [!] E2E «entra otra persona en otra pestaña»: necesita un segundo usuario de prueba y la cookie corregida

## Sprint 3 — Órdenes
- [~] **O-01** Home con «Mis traslados» y «Disponibles hoy» (incluye la pantalla «Sin permiso» y la prueba de guarda de 403) — hecha en código; falta mirarla en un teléfono y probar el 403 con un usuario real de rol no permitido
  - [x] Dominio: mezcla de la caché, avance, etiquetas y tonos, filtro de VIN
  - [x] API `mis-ordenes` con `cerrarSesionEn403: false` desde un solo lugar y **prueba de guarda** (toda función nueva de `trasladoApi` debe llevarlo)
  - [x] Caché de órdenes en Dexie (base v2, con prueba de migración) y conteo de fotos por orden
  - [x] Controlador `ListaOrdenes`: primero lo guardado, luego el servidor; sin red no se pierde nada; una sola petición a la vez; 403 distinto de «sin conexión»
  - [x] Pantallas: home con las dos secciones, tarjeta con etiqueta y color, filtro de VIN, banner ámbar, «Actualizar», «Sin permiso para Traslado»
  - [x] AC1 dos secciones · [x] AC2 color y etiqueta · [x] AC3 filtro sin red · [x] AC4 sin conexión · [x] AC5 mezcla de la caché · [x] AC6 sin permiso
  - [x] Al cerrar o expirar la sesión se vacía la caché de órdenes (las fotos no se tocan)
  - [x] 6 pruebas contra el backend real y 8 de Playwright (4 en Chrome y 4 en Edge) con corte de red
  - [x] ~~Decidir en O-02 dónde vive la toma pendiente~~ — resuelto el 2026-10-10: tabla aparte, con su dueño (ver O-02)
  - [ ] Probar el 403 con un usuario de rol no permitido (lo pide a backend)
  - [ ] Mirar la home en iPhone y Android (360 px) *(solo en teléfono)*
- [~] **O-02** Tomar y soltar una orden — hecha en código; falta mirarla en un teléfono y el pedido al backend (`fecha_toma`)
  - [x] API: `tomar` y `soltar`, con la política de 403 y la prueba de guarda
  - [x] Tomas hechas en este navegador guardadas **aparte, con su dueño** (base v3, con prueba de migración): sobreviven a cerrar sesión y solo las usa quien las hizo
  - [x] «Comenzar despacho» es el único modo de tomar; tocar la tarjeta no hace nada (AC1 cambiado)
  - [x] Sin señal se toma igual: queda pendiente y se envía en la siguiente actualización con conexión
  - [x] Un 409 (otra persona se adelantó) no se reintenta: la tarjeta dice «La tomó …» en rojo y las fotos se conservan
  - [x] Soltar: solo lo tomado aquí y mientras no salió; una toma que no llegó al servidor se cancela sin red; con fotos se pide confirmación y se borran
  - [x] 10 pruebas contra el backend real (4 nuevas, con limpieza al final) y 2 de Playwright (tomar y devolver una orden real)
  - [ ] **Pedido al backend (opcional):** exponer `fecha_toma` en `mis-ordenes`, para que «soltar» no dependa de este navegador
  - [ ] Probar en un teléfono: tomar sin señal, ver el aviso y que se registre al volver la red *(solo en teléfono)*
- [~] **O-03** Identificar un VIN — hecha en código; falta mirarla en un teléfono. **Pendiente de decisión:** qué hacer con la búsqueda parcial (ver abajo)
  - [x] API `buscar` (parcial) e `identificar` (VIN exacto, codificado en la URL), con la política de 403 y la prueba de guarda
  - [x] Reglas del VIN iguales a las del backend (17 caracteres, sin I, O ni Q): con una `O` por un `0` avisa del formato sin llamar al servidor
  - [x] Panel «Buscar en el sistema» cuando el filtro no encuentra el VIN en la lista del teléfono; con menos de 4 caracteres no se llama al servidor
  - [x] Un mensaje distinto por caso: «VIN no conocido» (404), «Sin orden pendiente» (200 vacío), «Formato inválido» (422), sin conexión, sin coincidencias
  - [x] Orden del pool hallada → «Comenzar despacho» (se toma aunque el teléfono no la tuviera); mía → «Ver en mis traslados»; de otra persona → dice de quién es y **no se toma ni entra en «Mis traslados»**
  - [x] El filtro de VIN se ofrece siempre (antes se ocultaba con la lista vacía)
  - [x] 7 pruebas contra el backend real (solo lectura) y 10 de Playwright (5 por navegador)
  - [x] **Búsqueda parcial (decidido: se deja como está, 2026-10-12):** el backend la limita a lo mismo que `mis-ordenes` (lo propio y el pool de hoy), así que solo aporta si la lista está atrasada. Hoy se dejó como está; alternativa: que el botón primero actualice la lista y solo después busque
  - [ ] «Continuar igual» con una orden de otra persona (la app móvil lo permite): queda para E4, cuando exista la captura
  - [ ] Mirar el panel en iPhone y Android (360 px, teclado en pantalla) *(solo en teléfono)*
- [~] **O-04** Catálogos y selector de placa y proveedor — hecha en código; falta mirarla en un teléfono. El envío de lo elegido al servidor es E4-02
  - [x] API `catalogos` (todas las placas sin filtrar por estado, y los proveedores), con la política de 403 y la prueba de guarda
  - [x] Catálogo guardado en el teléfono (base v4): el selector funciona sin señal; si nunca se descargó, lo explica
  - [x] Selector filtrable accesible (combobox): filtra por código ignorando mayúsculas y separadores, lista de 224 px como máximo, estado como texto («· afuera»), teclado, campo de 16 px
  - [x] Lo elegido se guarda en el teléfono **con su dueño** (base v5): sobrevive a actualizar, a cortar la red y a cerrar sesión; el servidor pisa solo cuando trae dato
  - [x] Se puede cambiar de opinión hasta confirmar; en la entrega no se elige; sin placa no se fotografía la salida (el proveedor no bloquea)
  - [x] 5 pruebas nuevas contra el backend real (solo lectura) y 1 E2E (toma una orden, elige, filtra, corta la red y la suelta)
  - [x] **O-04b** Lápiz para corregir lo elegido (placa y proveedor): campo de solo lectura con un lápiz de 44 px al costado; tocarlo reabre el selector; salir sin elegir conserva lo anterior; nada se manda al servidor
  - [ ] **E4-02:** mandar la placa y el proveedor elegidos al confirmar la salida (AC4: si no se elige, van como `null`)
  - [ ] Mirar el selector en iPhone y Android (360 px, teclado en pantalla) *(solo en teléfono)*
- [~] **O-05** Escanear el VIN con la cámara *(pedida por el usuario el 2026-10-12)* — hecha en código y con pruebas; **falta probarla con una etiqueta real en iPhone y Android**
  - [x] Botón «Escanear» junto a «Filtrar por VIN»: abre un escáner a pantalla completa, lee QR y códigos de barras y escribe el VIN en el filtro sin consultar al servidor
  - [x] Si el código trae más que el VIN (una dirección, un rótulo), se extrae el VIN; si no, el texto en mayúsculas, como la app móvil
  - [x] Cierra la cámara al leer, al cerrar y al salir; Escape cierra y el foco vuelve al botón
  - [x] La librería (`@zxing/browser`, la del portal) se carga solo al abrir el escáner
  - [ ] Probar en iPhone y Android: QR de una etiqueta, código de barras Code 128/39, poca luz y distancia
  - [ ] Confirmar con el usuario qué trae el código de las etiquetas reales (¿solo el VIN?)
- [ ] *(Could)* **T11** Aviso de foto oscura o tapada
- [~] **T12** Elegir una foto de la galería *(añadida el 2026-10-12, pedida por el usuario)* — hecha en código y con pruebas; **falta probarla en iPhone y Android**
  - [x] «Elegir de la galería» junto a «Tomar foto»; abre la galería del teléfono (sin `capture`) y funciona también si la cámara está denegada o no disponible
  - [x] La foto se decodifica respetando la orientación EXIF, se reduce a 1920 px de lado largo y se **vuelve a codificar como JPEG verificado** (HEIC y PNG incluidos); la foto queda sin metadatos, también sin ubicación
  - [x] Pasa por la misma revisión «Usar / Descartar», se guarda en la zona activa y se sube sola como cualquier otra
  - [x] Su fecha es la de modificación del archivo (cuándo se tomó); si falta o es futura, la de ahora
  - [x] Archivos que no son fotos, vacíos o ilegibles: mensaje claro y se puede volver a elegir
  - [ ] Probar en iPhone (iOS 26.5): foto HEIC, foto grande de 12 MP o más, y que la orientación salga derecha
  - [ ] Decidir si las fotos de galería se marcan en el servidor (`comentario` de la foto al confirmar), para que el supervisor sepa cuáles no se tomaron en el momento

## Sprint 4 — Envío
- [x] **E4-01** Cada foto se sube a GCS al tomarla, con «Reintentar» por foto — hecha y probada contra el bucket real desde `localhost:5173` (Chrome y Edge)
  - [x] `storageApi` (pide la URL firmada) y `subidaGcs` (PUT con el mismo `Content-Type`, sin `Authorization`, con tiempo máximo de 60 s)
  - [x] Estado de subida por foto en el almacén local (`pending` → `uploaded` / `failed_upload` → `pending`), sin pisar la foto nueva si se repitió la zona
  - [x] `SubidaFotos`: una subida por foto, lee el archivo del almacén en cada intento, hasta 2 URL nuevas ante un 403, sin reintentos automáticos
  - [x] El formulario sube cada foto en cuanto la guarda (sin bloquear la captura), retoma las `pending` al abrirse y ofrece `reintentarSubida`
  - [x] Pantalla: estado por zona (Subiendo… / Subida / No se pudo subir), «Reintentar» aparte, «n/6 fotos subidas» y aviso de fallos
  - [x] Pantalla de captura desde la tarjeta de una orden propia («Fotografiar salida» / «Fotografiar entrega») con «Volver»
  - [x] Prueba real hecha una vez, el 2026-10-12 (`e2e/subida.spec.ts`, cámara simulada de Chromium); **desde entonces la E2E está apagada** (ver «Regla de producción»): una foto, un `upload-url`, un PUT con 200, sin `Authorization`. **El CORS del bucket ya acepta `localhost:5173` (D3 queda confirmado para ese origen).** Cada corrida deja un objeto en el bucket.
  - [ ] **Pendiente de decidir:** la URL firmada apunta al bucket `sum-fotos-prod`, aunque el backend sea el de desarrollo (ver «Pendientes por decidir»)
- [~] **E4-02** Confirmar salida y entrega — hecha en código y con pruebas; **falta probarla contra el backend real** (cambia la orden a `en_transito` en la base de desarrollo y no se revierte; hay que acordar con el usuario qué orden usar)
  - [x] API: `confirmarSalida` / `confirmarEntrega` (cuerpo exacto, fecha en UTC, `descartada_por_supervisor` como resultado, respuesta rara = error 502)
  - [x] `ConfirmacionTraslado`: valida antes (no llama si falta algo y dice qué), registra la toma pendiente antes de confirmar, no confirma una toma perdida ni un paso que no corresponde, una confirmación por orden a la vez
  - [x] Éxito de la salida: borra las fotos de la salida, lo elegido y la toma; la orden sigue en tránsito. Entrega o descarte: borra todo lo de la orden
  - [x] Un error (red, 4xx, 5xx) no borra nada y «Reintentar» funciona; el descarte no promete que las fotos se borraron del servidor
  - [x] Pantalla: «Confirmar salida» / «Confirmar entrega» habilitado con todas las fotos subidas, dice cuántas faltan, avisa en verde (confirmada) o en ámbar (descartada)
  - [ ] ~~Prueba real contra el backend de desarrollo~~ **No se hace** mientras el backend local use el bucket de producción: confirmar exige subir las 6 fotos a ese bucket (ver «Regla de producción»)

## Seguimiento del coordinador *(E7, pedida por el usuario el 2026-10-15)*
- [~] **C-00** Vista de seguimiento para el rol `coordinador` — hecha en código y probada con servidores falsos; **el rol y el endpoint no existen en el backend**, así que no se probó con datos reales ni en un teléfono. Detalle en [backlog.md](docs/07-planificacion/backlog.md) (E7), [mapeo-rol-coordinador.md](docs/07-planificacion/mapeo-rol-coordinador.md) y [propuesta-vista-cliente.md](docs/01-vision-y-alcance/propuesta-vista-cliente.md)
  - [x] Acceso **por rol** (`esCoordinador`), sin mirar `allowed_apps`; aunque su cuenta tenga `traslado`; sin la vista nueva, «Sin acceso»; un rol que solo se parece («Coordinador») no cuenta
  - [x] Pantalla: buscador, selector de destino (solo con más de uno), pestañas Todos / En camino / Entregados, tabla en escritorio, lista en el teléfono, detalle con hitos; sin GPS, sin mapa y sin PDI
  - [x] **Sin nada de GPS** *(pedido el 2026-10-15)*: ni ubicación, ni si lleva dispositivo; entrega con hora estimada, solo fecha. El servidor aún manda `seguimiento`; la web lo ignora
  - [x] Logos de marca (`src/assets/marcas/`): Audi, Cupra, Jetour, Porsche, Seat, Soueast y Volkswagen (con sus variantes `VW …`); el resto, la inicial. Ver el README de esa carpeta
  - [ ] Logo de `KYC` (3.ª marca con más órdenes) y del resto del catálogo; confirmar que SUM puede mostrar estos logos (son marcas registradas)
  - [x] Datos solo en memoria (sin Dexie); se piden al abrir y solo se renuevan con «Actualizar» (sin renovación automática, a pedido del usuario); un fallo no vacía lo mostrado; un 403 muestra «Sin permiso» sin cerrar la sesión; se vacían al cerrar sesión o al entrar otra persona
  - [x] E2E en Chrome y Edge **sin backend** (`e2e/seguimiento.spec.ts`); sin desborde horizontal a 360 px
  - [ ] **Pedir al backend** el rol `coordinador` y `GET /api/seguimiento/traslados` ([pedido](docs/07-planificacion/pedido-backend-seguimiento-coordinador.md), **sin enviar**)
  - [ ] Probar con el backend cuando exista (el rol, una cuenta de prueba y datos de las cuatro etapas)
  - [ ] Probar la pantalla en iPhone y Android (360 px) *(solo en teléfono)*
  - [ ] **Antes de dar cuentas reales:** que el backend cierre los endpoints que solo exigen sesión y devuelven datos de vehículos (hueco `require_auth`, ver el mapeo §8)
  - [ ] Decidir: ¿admin entra a la vista? · ¿se amplían los campos visibles para personal interno? · ¿qué marcas faltan? (KYC y el resto, hoy una inicial) · legal, si la ubicación llegara a mostrarse a terceros
  - [ ] *(fases posteriores)* mapa, hito de PDI, filtro por destino y roles para externos
- [~] **C-01** Consulta masiva de VIN *(pedida por el usuario el 2026-10-15)* — hecha en la web y en el backend (ramas sin commitear); probada contra el backend local de pruebas con el endpoint real, **no** en un teléfono ni con datos reales de producción
  - [x] Se pegan los VIN (uno por línea o separados por coma, punto y coma, espacio o tabulador); se leen antes de consultar: cuántos son, repetidos (se consultan una vez), no-VIN apartados y máximo de **200**
  - [x] Backend `POST /api/seguimiento/consulta-vines` (rama `feat/seguimiento-coordinador`): solo cuentan órdenes `en_transito`, `realizado` y `cerrada` **de cualquier fecha**; con varias del mismo VIN manda la más reciente
  - [x] Todo lo demás (sin orden, orden que aún no sale, cancelada) sale como **«Pendiente de información»** — «Aún no está en el plan de despacho.» —, sin distinguir los casos (decisión del usuario)
  - [x] Resultado en el orden pegado, con resumen; los que tienen información se ven como en la lista y abren el mismo detalle; lo anulado nunca se enseña; un fallo no borra el último resultado; solo en memoria
  - [ ] Probarla con una lista real de VIN del usuario y en un teléfono *(solo en teléfono)*
  - [ ] Decidir: exportar el resultado a CSV; subir un archivo en vez de pegar; qué hacer con un VIN que tiene una orden nueva pendiente tras una entrega vieja (hoy se muestra la entrega)

## Sprint 5 — Robustez
- [x] ~~**E4-03** Drenador con candado entre pestañas~~ — **descartada el 2026-10-10:** la web es con internet; si el envío falla, «Reintentar»
- [x] ~~**E4-04** Sesión vencida con fotos pendientes~~ — **descartada el 2026-10-10:** misma razón

## Sprint 6 — Testeo y piloto
- [ ] **P-01** Testeo en dispositivos reales y validación de resolución
- [ ] **D2** Entorno de pruebas público con HTTPS

---

## Decisiones y bloqueos
- [x] **D1** Esquema de login → opción A (cookie `/api/login`)
- [!] **D2** Entorno público con HTTPS — sin dominio ni enlace público todavía
- [!] **D3** CORS del bucket GCS por origen — pendiente de quien administra el proyecto GCP
- [x] Toda prueba contra el backend va a la **base de desarrollo**
- [x] Telemetría y bitácora: fuera por ahora

## Despliegue en Vercel (decidido el 2026-10-12)
- [x] `vercel.json` creado: build de Vite, `/api/*` y `/mobile/*` reenviados al Cloud Run de producción, `index.html` para el resto, `noindex`.
- [x] Desplegado en Vercel el 2026-10-12 desde `sumdata01-ai/sum-traslado-app`: **https://sum-traslado-app.vercel.app/** (comprobado: carga con 200, `noindex` aplicado y las rutas del SPA responden; no se probó nada contra el backend).
- [ ] Decisión: el front desplegado apunta a **producción** y se usa **solo para ver las pantallas** (no tomar órdenes, no subir fotos, no confirmar).
- [ ] Si se quiere subir fotos desde esa URL: agregar `https://sum-traslado-app.vercel.app` al CORS del bucket (D3). Subir y confirmar escribirían en producción: contradice la regla de abajo, hay que decidirlo aparte.
- [ ] Sigue pendiente el guard para que las pruebas automáticas se nieguen a correr contra backends que no sean locales.

## Regla de producción (decidida por el usuario el 2026-10-12)
**Ninguna prueba ni desarrollo toca recursos de producción**: para eso está la base de datos de desarrollo, local. Lo que se descubrió: el backend local (`:8050`) usa la base local, pero **firma las URLs de subida del bucket `sum-fotos-prod`**. Consecuencias:
- Las subidas de fotos reales y las confirmaciones reales quedan **suspendidas** hasta que ese backend apunte a un bucket de desarrollo. `e2e/subida.spec.ts` está apagada (se activa con `TRASLADO_BUCKET_DE_PRUEBA=si`) y, aunque se active, aborta cualquier PUT a un bucket con «prod» en el nombre.
- Las pruebas contra el backend real que quedan solo **toman y sueltan órdenes** (base local); no tocan el bucket.
- Antes de cualquier prueba que escriba fuera de la base local, se pregunta.
- Lo ya hecho: 5 fotos de prueba (~20 KB cada una) quedaron en `sum-fotos-prod`, bajo `traslado/2026/10/`. **Decisión del usuario: se dejan así**; no se pide borrarlas.

## Pendientes por decidir (el usuario)
- [x] **Decidido (2026-10-12):** las herramientas de prueba provisionales («Probar la cámara») quedan **ocultas** en la home. Se muestran solo si la dirección lleva `?herramientas` (p. ej. `https://sum-traslado-app.vercel.app/?herramientas`). Se retiran del todo cuando el usuario termine las pruebas de teléfono (JPEG y Android).
- [x] **Decidido (2026-10-12):** «tomar sin señal» se deja como está (opción A).
- [x] **Decidido (2026-10-12):** la búsqueda parcial de VIN se deja como está.
- [ ] ¿Se anotan los hallazgos de la revisión sobre el backend en «Pedidos a terceros»? (`confirmar-entrega` no comprueba quién entrega, responde «confirmada» al que pierde la salida, sin bloqueo entre dos confirmaciones simultáneas)
- [ ] El aviso de «órdenes con datos inválidos» de la home (se agregó sin criterio de aceptación): ¿se queda?
- [ ] ¿Se comparten teléfonos entre operarios? De eso depende si las fotos necesitan guardar su dueño

## Pedidos a terceros
- [x] **Backend (sum-bck-modulos), resuelto y desplegado el 2026-10-13:** que `GET /mobile/traslado/vin/{vin}` mande también las órdenes del VIN que **ya no están pendientes** (campo nuevo `otras_ordenes`; `ordenes` no cambia). Hoy, si otra persona ya sacó el vehículo, el servidor responde «sin órdenes» y la página dice «Sin orden pendiente… espera a que el supervisor la cree», aunque la orden salió y la tiene alguien. Detalle y esbozo del cambio en [pedido-backend-vin-otras-ordenes.md](docs/07-planificacion/pedido-backend-vin-otras-ordenes.md). **La página ya está preparada** y mostrará «Orden ya tomada… la tiene X» en cuanto el campo llegue. Ejemplo real: `LVTDD24B6VDC81445`, en tránsito desde el 2026-10-13 10:57, de Frank Xavier Cavero Ruiz.
- [ ] **Backend/GCP:** el backend de desarrollo (`:8050`) firma URLs del bucket **`sum-fotos-prod`**. Cada prueba real deja una foto de prueba en un bucket con nombre de producción (hay 5 hoy, bajo `traslado/2026/10/`, que el usuario decidió dejar). Pedir un bucket de desarrollo para el backend de desarrollo, o confirmar que ese nombre es solo un nombre. Los 5 objetos ya subidos se dejan (decisión del usuario).
- [ ] **Backend (desbloquea AC4 de A-02):** el backend de desarrollo emite la cookie de refresh con `SameSite=None` y **sin** `Secure`. Chrome y Edge la rechazan, y al recargar la sesión se pierde. Medido en Chrome real: con `SameSite=Lax` (el valor por defecto del propio backend) o con `SameSite=None; Secure` la cookie se guarda y sobrevive a 3 recargas seguidas. Hay que pedir `REFRESH_COOKIE_SAMESITE=lax` (o `REFRESH_COOKIE_SECURE=true`) en el proceso de `:8050`. Si el portal usa ese mismo backend, probablemente le pasa lo mismo: no lo verifiqué.
- [ ] Backend: datos de prueba que faltan (órdenes propias —sin ellas «Mis traslados» no se prueba con datos reales—, `en_transito`, `cancelada`, tomada por otro, reasignada, VIN existente sin orden, VIN desconocido, segundo operario, usuario con rol no permitido) y poder **regenerarlos**
- [ ] **Backend (desbloquea probar C-00 con datos reales):** el rol `coordinador` en `ROLES_VALIDOS` y `GET /api/seguimiento/traslados` (rol, contrato, ventana de días y pruebas en [pedido-backend-seguimiento-coordinador.md](docs/07-planificacion/pedido-backend-seguimiento-coordinador.md)). Hallazgos de la lectura del backend (sin verificar contra producción): el rol `cliente` existe pero es el **auditor de inspecciones** y no figura en `ROLES_VALIDOS`; los routers `/v1/*` no los reenvía esta web (por eso el prefijo es `/api`); unos 65 endpoints solo exigen sesión (`require_auth`) y devuelven datos de cualquier vehículo a cualquier rol.
- [ ] Backend: confirmar que el proceso en `:8050` no tiene `TRASLADO_EXPORT_SHEET_ID` apuntando a la hoja de producción
- [ ] Backend: valores de la cookie de refresh en producción (`SameSite`, `Secure`) y manejo de `X-Forwarded-For`
- [ ] Backend: qué roles tienen hoy los usuarios con `traslado` (¿existe alguno fuera de `admin`, `supervisor`, `operario`?)

## Verificación manual pendiente en teléfonos (iPhone y Android, con `npm run dev:https`)
- [x] Spike S-01 en iPhone: la cámara vuelve sola (2026-10-12). [ ] Falta Android
- [ ] Tomar una foto y comprobar que el archivo es JPEG (la pantalla de prueba muestra tamaño, peso y tipo)
- [x] iPhone: cerrar sesión y cerrar la app → las fotos siguen ahí (2026-10-12). [ ] Falta: recargar la página con la sesión abierta, y Android
- [ ] Que el formulario y la home no desborden a 360 px y que la guía de cada zona se entienda
- [ ] Textos de permisos de cámara denegado en iPhone y Android

---

## Registro de avances
- **2026-10-09** — Sprint 0, Sprint 1 y Sprint 2 hasta T4b hechos en código; 531 pruebas pasan en 21 archivos. Se decide que toda prueba contra el backend va a la base de desarrollo. Se confirma que el backend local expone el contrato y que el usuario de prueba tiene `traslado`. Se empieza A-02.
- **2026-10-09** — A-02 hecha en código. `lint`, `typecheck` estricto y `build` pasan; **601 pruebas de Vitest en 24 archivos** (9 de ellas contra el backend real) y **4 de Playwright** en Chrome y Edge reales. Se provocaron 10 averías para comprobar las pruebas: 9 se detectaron y 1 no; se cubrió con una prueba nueva y ahora se detecta. **Hallazgo:** el navegador no guarda la cookie de refresh que emite el backend de desarrollo; se pidió el cambio al backend. Las credenciales de prueba viven solo en `.env.local` (ignorado por git); se quitó el usuario real de los archivos de pruebas.
- **2026-10-09** — O-01 hecha en código. `lint`, `typecheck` estricto y `build` pasan; **786 pruebas de Vitest en 31 archivos** (15 contra el backend real) y **12 de Playwright** en Chrome y Edge reales (8 nuevas, con la red cortada). Se rompieron a propósito 11 comportamientos (no vaciar la caché al cerrar sesión, filtrar solo una sección, contar el pool en el avance, ignorar el 403, caché sin transacción, tratar el 403 como error, ignorar el tono, no actualizar al volver la red, no liberar la lista ni quitar el aviso de red al salir, y no avisar de las órdenes inválidas): 9 se detectaron con las pruebas que había y 2 no tenían prueba (liberar al salir de la home y quitar el aviso de red); se añadieron y ahora se detectan. Al mirar la home a 360 px se vio que «Cerrar sesión» se partía en dos líneas y se salía del alto del botón: se corrigió y una prueba lo fija. **Hallazgo para O-02:** ver `plan-sprints.md` §2.3.
- **2026-10-09** — Corregidos dos fallos de O-01 encontrados en revisión y **reproducidos antes de corregirlos**: (d) cerrar sesión mientras se guardaba lo que trajo el servidor volvía a dejar en el teléfono las órdenes de la cuenta anterior; (e) si el borrado de la caché fallaba, se ignoraba y la siguiente cuenta, sin red, veía esas órdenes como suyas. Ahora hay una marca de «limpieza pendiente» (sobrevive a recargar) y la caché pone sus escrituras en fila. **Hallazgo al probar:** Dexie no respeta por sí solo el orden de las escrituras (un borrado pedido después corría antes); se midió y se corrigió en la caché, no se supuso. 804 pruebas de Vitest en 32 archivos; se rompieron a propósito 8 comportamientos de estos arreglos y los 8 se detectan. La E2E de la home esperaba el título «Traslado», que también está en el login: un login rechazado por el límite de intentos pasaba ese paso; ahora espera «Cerrar sesión».
- **2026-10-09** — A-03 hecha en código. 861 pruebas de Vitest en 36 archivos; 2 E2E nuevas (dos pestañas reales). Se rompieron a propósito 20 comportamientos: 17 se detectaron con las pruebas de la primera tanda y 3 no (heredar el usuario anterior cuando el token no lo trae, un login que no descarta un refresh suyo cuya respuesta llega tarde, y el «uno a la vez» del refresh roto por uno viejo); se añadieron condiciones al servidor falso (respuesta demorada, token sin `sub`) y ahora se detectan las 20. La E2E también se comprobó rota: sin el aviso de logout, falla. **Hallazgo corregido de paso:** tras un refresh, la sesión conservaba el usuario anterior aunque la cookie fuera de otra persona; ahora sale del token. **Nota:** la prueba de límites de ESLint superó su tiempo con la suite entera en paralelo (arranque en frío de ESLint, ~1 s si corre sola); se le dio un margen de 60 s. Un login de la E2E se quedó una vez sin respuesta del backend más de 5 s; no se repitió.
- **2026-10-10** — O-02 hecha en código. 944 pruebas de Vitest en 40 archivos (10 contra el backend real) y 2 E2E nuevas con una orden real, que se suelta al final. Se rompieron a propósito 22 comportamientos: 21 se detectaron con las pruebas escritas y 1 no (el envío de tomas pendientes no comprobaba que la sesión siguiera siendo la misma, así que habría tomado la orden a nombre de otra persona); se escribió la prueba y ahora se detectan las 22. Se comprobó que la base de desarrollo quedó sin órdenes tomadas por el usuario de prueba. Decisiones del usuario registradas en `backlog.md` (O-02) y flujo de envío de fotos pedido para E4-01. **Nota:** correr los archivos de E2E juntos pasa el límite de 10 logins por minuto (me volvió a pasar con home + pestañas); correrlos por separado.
- **2026-10-10** — O-04 hecha en código. 1074 pruebas de Vitest en 49 archivos (15 contra el backend real) y 1 E2E nueva. Se rompieron a propósito 24 comportamientos: 23 se detectaron y 1 es un mutante equivalente (la tarjeta abría un `<div>` vacío cuando ningún selector era editable: no cambia lo que ve el operario). Al probar en el navegador apareció un defecto propio: el aviso de error del catálogo salía pegado («Error interno Se usan…»); corregido y con prueba. Al mirar la tarjeta a 360 px, la lista muestra cuatro opciones y el borde de la quinta, con el campo visible.
- **2026-10-10** — **Corregido un defecto de O-04 reportado por el usuario:** tras elegir la placa no se podía cambiar por otra (el selector desaparecía). Causa: cuando `recalcular` no podía leer la caché (error de lectura o limpieza pendiente) usaba como respaldo las órdenes **ya mostradas**, que llevan la placa elegida puesta, y la tomaba por un dato del servidor; entonces la placa dejaba de ser editable. Ahora el respaldo es la base sin elecciones. **Cómo se encontró:** se reprodujo en Chrome real (3 de 3 corridas), no con las pruebas, que pasaban porque nunca ejercitaban esa ruta; un registro de depuración cambió el tiempo y el fallo dejó de verse, así que se reprodujo el mecanismo en una prueba unitaria (falla antes del arreglo, pasa después). **No pude observar en el navegador por qué se tomó esa ruta** (la lectura de la caché no falló en las corridas con registro). Después del arreglo: 0 fallos en 6 corridas reales. También verifiqué que elegir y cambiar **no manda nada al servidor** (prueba unitaria y E2E que cuenta las peticiones). **Efectos colaterales corregidos:** mis corridas de depuración fallidas dejaron 3 órdenes tomadas por el usuario de prueba en la base de desarrollo (las devolví al pool); ahora las E2E que toman órdenes las devuelven en un `afterAll` aunque fallen; y la E2E de O-02 se había roto con O-04 (el VIN aparece ahora también en las etiquetas de los selectores) sin que yo la volviera a correr: corregida.
- **2026-10-10** — O-04b hecha en código (el lápiz para corregir la placa y el proveedor elegidos). 1099 pruebas de Vitest y la E2E en Chrome y Edge, que ahora también comprueba el tamaño del lápiz (≥ 44 px), el foco y que corregir no hace ninguna petición. Se rompieron a propósito 14 comportamientos: 12 se detectaron y 2 no tenían prueba (un lápiz que fuera `submit` enviaría el formulario de E4 al tocarlo; y la tarjeta sin pasar lo elegido dejaba de mostrarlo con el catálogo sin descargar); se añadieron y ahora se detectan los 14. Durante el desarrollo apareció un detalle de uso: al salir del campo tocando otro, el foco no debe volver al lápiz (le robaría el foco al campo tocado); solo vuelve al elegir o con Escape.
- **2026-10-10** — O-03 hecha en código. 1206 pruebas de Vitest en 53 archivos (22 contra el backend real) y 10 E2E nuevas. Se rompieron a propósito 25 comportamientos: 22 se detectaron a la primera y 3 no (un fallo tardío que pisa la búsqueda nueva, «Ver en mis traslados» que no ponía el VIN en el filtro, y el filtro que se ocultaba con la lista vacía); se escribieron las pruebas y ahora se detectan las 25. **Hallazgo del backend:** la búsqueda parcial cubre lo mismo que `mis-ordenes`; solo el VIN completo encuentra órdenes que el teléfono no descargó (pool de otros días, órdenes de otra persona). Una prueba débil mía: la del botón «Ver en mis traslados» pasaba aunque no hiciera nada, porque el filtro ya tenía el VIN escrito; ahora la prueba parte de una búsqueda parcial.
- **2026-10-10** — **Decisión de producto (el usuario):** la web es **con internet**: sin internet no se llega a ella, así que no se diseña un modo sin señal. Con señal se envía, y si el envío falla se muestra el error con «Reintentar». Consecuencias para E4: cada foto se sube al tomarla (con «Reintentar» por foto); el botón final **no «manda todo»**, porque las fotos ya están subidas: es **«Confirmar salida» / «Confirmar entrega»** y solo registra el despacho. **E4-03 y E4-04 (cola automática entre pestañas y sesión vencida con fotos pendientes) dejan de hacerse.** Lo ya construido que choca con esa regla es «tomar sin señal» (toma pendiente); el usuario aún no decidió si se quita (ver «Pendientes por decidir»).
- **2026-10-12** — E4-01 hecha en código, sin la prueba real contra el bucket. 1281 pruebas de Vitest en 59 archivos. La subida es de un solo intento y «Reintentar» por foto (decisión del usuario: la web es con internet). Se rompieron a propósito 5 comportamientos de la pantalla: 4 se detectaron y 1 no (conectar el subidor a la pantalla de captura); se añadió la prueba. **Sin prueba:** que no se ofrezca fotografiar una orden con la toma perdida. **Pendiente de decidir por el usuario antes de la prueba real:** subir una foto de prueba al bucket de desarrollo y el CORS de `localhost:5173` (no verificado).
- **2026-10-12** — Prueba real de E4-01: la foto se sube a `storage.googleapis.com` con 200 desde `localhost:5173` en Chrome y Edge; el PUT no lleva `Authorization` y hay un solo permiso y un solo PUT por foto. **Hallazgo:** el backend de desarrollo firma URLs del bucket **`sum-fotos-prod`**. Quedaron **5 objetos de prueba** en ese bucket (3 de depuración de la prueba y 2 de la corrida final), bajo `traslado/2026/10/`. No se pueden borrar desde la web. La orden usada se devolvió al pool.
- **2026-10-12** — E4-02 hecha en código, sin la prueba real. 1362 pruebas de Vitest en 61 archivos. Se rompieron a propósito 27 comportamientos: 25 se detectaron y 2 no (confirmar una orden cuya toma se perdió, y borrar la toma al confirmar); para la primera se escribió la prueba y ahora se detecta; la segunda es redundante (la actualización de la lista ya reconcilia esa toma) y se dejó una prueba del resultado. **No se probó contra el backend real:** confirmar la salida cambia la orden a `en_transito` y marca la placa «en uso» en la base de desarrollo, y subir las fotos deja objetos en el bucket; falta que el usuario lo autorice.
- **2026-10-12** — T12 (galería) hecha en código. 1375 pruebas de Vitest en 64 archivos. Se rompieron a propósito 23 comportamientos: 20 se detectaron a la primera y 3 no (bloqueo de «Tomar foto» mientras se prepara la foto, ocultar la guía sobre la foto elegida, y pedir la orientación EXIF al decodificar); se escribieron las pruebas y ahora se detectan las 23. Refactor: la codificación a JPEG verificado de `captureFrame` ahora la comparten la cámara y la galería. Falta probarla en un teléfono.
- **2026-10-12** — O-05 (escáner de VIN por QR y código de barras) hecha en código. 1443 pruebas de Vitest en 67 archivos. Se rompieron a propósito 25 comportamientos: 23 se detectaron a la primera y 2 no (un VIN con `O` seguido de uno válido, y cerrar el escáner antes de que cargue el lector); se escribieron las pruebas y ahora se detectan los 25. La librería de lectura queda en un fragmento aparte (~480 kB) que solo se descarga al abrir el escáner. Falta probar con etiquetas reales en un teléfono.
- **2026-10-13** — O-03: la página muestra «Orden ya tomada / ya entregada / cancelada» cuando el servidor mande las órdenes del VIN que ya no están pendientes (`otras_ordenes`); el servidor de hoy no las manda y todo sigue como antes. Lo detectó el caso `LVTDD24B6VDC81445` (en tránsito, de otra persona). Se rompieron a propósito 17 comportamientos: 16 se detectaron a la primera y 1 no (la lectura de `fecha_entrega`); se escribió la prueba y ahora se detectan los 17. Pedido al backend en «Pedidos a terceros».
- **2026-10-13** — Cierre de sesión. Documentación reorganizada en `docs/` (4 `.md` movidos con `git mv`, 16 comentarios del código actualizados con tu autorización), memoria para sesiones con LLM (`CLAUDE.md`, `AGENTS.md`, `docs/ai/`, skill `documentar-proyecto`) y regla de lectura. Al cierre: typecheck y lint limpios, **1513 pruebas pasan sin omitir ninguna** (con el backend local activo corrieron también las pruebas contra el backend real; no quedó ninguna orden tomada), build correcto, 186 enlaces de los `.md` sin romper. **Todo sin commitear.** Siguiente paso: commit y push; luego pruebas en teléfono (galería, escáner, Android) y el pedido `otras_ordenes` al backend. Bitácora en `docs/ai/sesiones/2026-10-13-documentacion-y-memoria.md`.
- **2026-10-13** — El aviso de una orden en tránsito de otra persona queda en una sola línea, a pedido del usuario: «Orden ya tomada el 13/10, 10:38» (sin nombre, sin VIN, sin «no es tuya»). Probado en Chrome contra el backend local con el cambio `otras_ordenes` (los dos VIN del caso) y con 3 mutaciones que se detectan. La orden tuya en tránsito, entregada, cancelada y de otro estado conservan su texto.
- **2026-10-13** — **Confirmado por el usuario:** `localhost:8050` por defecto lee producción, pero él fija las variables de entorno para que apunte a la base local al arrancarlo; con esa configuración, las pruebas contra ese backend (incluida la corrida de 1513) fueron contra local. Queda sin explicar por qué sus órdenes coinciden con las de producción y cambian en vivo. **Riesgo:** si se arranca sin esas variables, lee producción. Ver `docs/ai/discrepancias.md` #11. La prueba en Chrome del aviso «orden ya tomada» contra el backend nuevo se hará en producción, tras el despliegue (decisión del usuario).
- **2026-10-13** — Segundo cierre de sesión. El backend de producción ya manda `otras_ordenes` y se **probó en producción en solo lectura** con un usuario de prueba de rol `operario`: la página desplegada muestra «Orden ya tomada el 13/10, 10:38» y el aviso de entregada; solo hubo `POST /api/login` y `POST /api/refresh`, ninguna toma, devolución ni confirmación. Todo commiteado y subido (`1cb9faa`). Verificaciones al cierre: typecheck, lint y build limpios; **1483 pruebas pasan, excluyendo a propósito las del backend real**. **Alerta:** las respuestas de `localhost:8050` coincidieron con las de producción hasta el milisegundo, así que ese backend pudo estar leyendo producción cuando se probó; hasta confirmarlo, `npm test` no se corre con `:8050` encendido. Siguiente paso: comprobar cómo se arranca ese backend y decidir un control; luego pruebas en teléfono. Bitácora: `docs/ai/sesiones/2026-10-13-documentacion-y-memoria.md`.
- **2026-10-15** — **Vista de seguimiento para el rol `coordinador` (E7, C-00)** hecha en código, sin backend. Decisiones del usuario: rol `coordinador` (no `cliente`, que es el auditor de inspecciones y puede verificar cualquier inspección), acceso **por rol** y no por `allowed_apps`, coordinador **general sin filtro por destino**, solo web (Flutter sin cambios), el PDI fuera de este MVP y los campos visibles como en la propuesta. Nuevo: `features/seguimiento/` (dominio, API, controlador en memoria, componentes), `SeguimientoPage`, `esCoordinador` y la rama del coordinador en `AppShell`. Al cierre: typecheck, lint y build limpios; **1608 pruebas pasan en 73 archivos** (eran 1483 en 67; se excluyeron a propósito las del backend real porque `:8050` estaba encendido); 3 E2E nuevas en Chrome y 3 en Edge, **sin backend** (responden `/api` y `/mobile` en la propia prueba). Se rompieron a propósito **35 comportamientos y los 35 se detectaron** a la primera tanda; una (leer un texto sin zona como hora local) solo se detectaba si la máquina no estaba en UTC, así que se añadió una prueba que cambia la zona horaria y ahora se detecta siempre. **Hallazgos:** (1) el prefijo `/v1` que se había propuesto no llegaría al backend (esta web solo reenvía `/api` y `/mobile`): se cambió a `/api/seguimiento`; (2) mi primera E2E interceptaba también los módulos de código con carpeta `api/` y la página quedaba en blanco: ahora solo intercepta rutas que empiezan por `/api/` o `/mobile/`; (3) en la lectura del backend, el hueco de `require_auth` (ver «Pedidos a terceros»). **No se verificó:** nada contra el backend real (el rol y el endpoint no existen), ni en un teléfono real, ni el modo oscuro (el proyecto es solo claro). Marcas: una inicial neutra en vez de logos (marcas registradas; no se sabe cuáles maneja SUM). Documentos nuevos: [propuesta](docs/01-vision-y-alcance/propuesta-vista-cliente.md), [mapeo del rol](docs/07-planificacion/mapeo-rol-coordinador.md) y [pedido al backend](docs/07-planificacion/pedido-backend-seguimiento-coordinador.md). **Todo sin commitear.**
- **2026-10-15** — Cierre de sesión. Verificaciones ejecutadas y lo que no se hizo, en la bitácora [2026-10-15-vista-seguimiento-coordinador.md](docs/ai/sesiones/2026-10-15-vista-seguimiento-coordinador.md); decisión de arquitectura en el [ADR 0011](docs/06-decisiones/0011-vista-del-coordinador-por-rol-solo-lectura-y-en-memoria.md). **Todo sin commitear** (también los 8 `.md` de la sesión anterior). **Siguiente paso concreto:** decidir quién implementa en el backend el rol `coordinador` y `GET /api/seguimiento/traslados` (el equipo de backend desde el [pedido](docs/07-planificacion/pedido-backend-seguimiento-coordinador.md), o una rama de `sum-bck-modulos` hecha aquí con autorización explícita) y, con eso listo, probar la vista con una cuenta de coordinador, **confirmando antes a qué base apunta `:8050`**.
- **Siguiente (anterior a E7):** E4-01 (subida de fotos) y E4-02 (confirmar salida y entrega), luego P-01. Conviene antes que el backend corrija la cookie, y que se prueben los teléfonos (ver la lista de verificación manual).
