# Backlog — Traslado web

Última actualización: 2026-10-15 | Fuente: decisiones del usuario y pruebas por historia | Estado: vigente

**Para quién:** el equipo que construye la versión web de Traslado.
**Fecha:** 2026-10-09.
**Convención:** *confirmado* sale del código revisado; *recomendación* es propuesta; *no verificado* queda abierto.
**Documentos hermanos:** [patron-traslado-web.md](../01-vision-y-alcance/patron-traslado-web.md) (contrato y estados), [arquitectura-front.md](../02-arquitectura/arquitectura-front.md) (diseño y fallas C1–C19), [plan-sprints.md](plan-sprints.md) (secuencia de sprints, DoR/DoD, riesgos).

**Tipos de prueba usados abajo**

| Sigla | Qué es | Herramienta |
|---|---|---|
| **U** | Unitaria | Vitest |
| **C** | Componente | Testing Library (+ vitest-axe para accesibilidad) |
| **I** | Integración contra el contrato simulado | MSW |
| **E** | Extremo a extremo con cámara falsa | Playwright (Chromium, y WebKit como aproximación a iOS) |
| **M** | Manual en dispositivo real | iPhone y Android |

**Tamaños:** S, M o L, **provisionales**. El equipo los convierte en puntos con Planning Poker; no hay velocidad histórica.

---

## Decisiones tomadas

| Decisión | Detalle |
|---|---|
| Foto desde la web | Widget en el navegador con `getUserMedia`. Sin salto a la cámara nativa, para que Android no mate la pestaña. |
| Dispositivos | Android **e iPhone**. |
| Sin PWA | Web normal. **Aceptado:** si se recarga la página sin señal, no carga. El modo sin señal solo vale mientras la pestaña siga abierta. |
| Endpoints | Se reutilizan los existentes (`/mobile/traslado/*`, `/mobile/storage/upload-url`). No se crea ninguno. |
| Desarrollo local | Proxy de Vite hacia `localhost:8050` y HTTPS local con mkcert. Puerto 5173, que el backend ya permite (es el mismo del portal: no correr ambos a la vez). |
| CORS del bucket GCS | Se configura desde el proyecto GCP, por origen. |
| Resolución de la foto | Se valida en testeo (P-01). Se parte de 1920 px de lado largo, como constante de configuración. |
| Telemetría y bitácora | **Fuera por ahora** (incluye «Copiar diagnóstico»). |
| Pruebas contra el backend | **Toda prueba va a la base de desarrollo, a través del backend** (2026-10-09). Las de integración y extremo a extremo usan el backend real, no MSW. Detalle y consecuencias en plan-sprints.md §6.1. |

**Dependencias nuevas** (no están en el portal): `zod`, `dexie-react-hooks` y `fake-indexeddb` (solo pruebas). **Aprobadas el 2026-10-09**, mientras resulten útiles; se revisan al final del Sprint 2 (plan-sprints.md §6.1).

---

## Orden de épicas

| Épica | Contenido | Prioridad |
|---|---|---|
| E0 Fundaciones | Proyecto, tokens, dominio puro | Must |
| E1 Acceso | Cliente HTTP, login y sesión | Must |
| E2 Cámara y captura | Soporte, sesión, frame, preview, guardado | Must |
| E3 Órdenes | Home, tomar/soltar, VIN, catálogos | Must |
| E4 Envío | Subida, confirmación, drenador, sesión vencida | Must (E4-03 y E4-04: Should) |
| E5 Testeo | Pruebas en dispositivos reales | Must |
| E6 Topología y despliegue | D1, D2, D3 | Pendiente (ver al final) |
| E7 Seguimiento del coordinador | C-00 (web, hecha), C-01 consulta masiva de VIN (web y backend, hechas en ramas), B-01 (backend, hecho en una rama, sin enviar) | Pedida el 2026-10-15 |

---

## E0 — Fundaciones

### F-01 Esqueleto del proyecto y entorno HTTPS local · Tamaño M
Como desarrollador, quiero un proyecto que arranque en HTTPS local y se pruebe desde un celular, para validar la cámara desde el primer día.

- **AC1.** Given el repositorio recién clonado, When corro `npm run dev`, Then sirve en `http://localhost:5173` (en `localhost` la cámara funciona sin certificado) y, con `npm run dev:https`, por HTTPS accesible desde la red; en ambos casos con proxy de `/api` y `/mobile` hacia `localhost:8050`.
- **AC2.** Given un iPhone en la misma red con la CA de mkcert instalada, When abro la URL de `npm run dev:https`, Then carga y `window.isSecureContext` es `true`.
- **AC3.** Given el proyecto, When corro lint, typecheck (con `strict: true`) y tests, Then pasan en limpio.
- **AC4.** Given un archivo en `domain/` que importa `react` o `dexie`, When corro lint, Then falla por la regla de dependencias.
- **AC5.** Given la URL base en producción vacía, When la app arma una petición, Then usa ruta relativa y no `localhost:8050`.
- **Pruebas:** [U] la función de URL base devuelve relativa con config vacía. [U] prueba de la regla ESLint con un fixture que debe fallar. [M] abrir desde un iPhone y un Android. [U] smoke test de arranque.

### F-02 Tokens y componentes base · Tamaño M
Como operario, quiero que la web se vea y se sienta como la app, para no reaprender la pantalla.

- **AC1.** Given los tokens de `patron-traslado-web.md` §5, When se renderiza un componente, Then usa esos colores, radios y tamaños (tarjetas con borde y sin sombra, botones de peso 700).
- **AC2.** Given un estado de conexión o de error, When se muestra, Then aparece como banner de color arriba, sin modal: ámbar sin conexión, verde listo, rojo error.
- **AC3.** Given el contador de avance, When se renderiza, Then son tres cuadros de 92 px de alto con el número a 28 px.
- **AC4.** Given un ancho de 360 px, When se ve cualquier componente base, Then no hay scroll horizontal.
- **AC5.** Given cada componente base, When corre la revisión de accesibilidad, Then no reporta violaciones.
- **Pruebas:** [C] un caso por componente y variante. [C] axe por componente. [C] ancho 360 px sin desborde.

### F-03 Dominio puro: zonas, estados y reglas · Tamaño M
Como equipo, quiero las reglas del negocio como funciones puras, para probarlas sin navegador.

- **AC1.** Given las zonas, When pido las de la salida, Then devuelve 6: `FRONTAL`, `LATERAL_IZQUIERDO`, `LATERAL_DERECHO`, `POSTERIOR`, `PLACA_ESTADO`, `PLACA_INSTALADA`. Las de la entrega son 5: las 4 exteriores más `VIN`.
- **AC2.** Given `EstadoFoto`, When pido una transición permitida (por ejemplo `writing → pending`), Then la devuelve; When pido una no permitida (por ejemplo `failed_upload → uploaded`), Then lanza un error de programación.
- **AC3.** Given el estado del servidor y el conteo de fotos, When llamo a `derivarEstadoOrden`, Then devuelve `sinIniciar`, `enCaptura`, `listaParaEnviar`, `enviando`, `confirmada` o `descartadaPorSupervisor` según `patron-traslado-web.md` §2.2, con N = 6 para `pendiente` y N = 5 para `en_transito`.
- **AC4.** Given un conjunto de fotos, When valido una confirmación, Then rechaza si no son exactamente 6 (o 5), si hay zonas repetidas o si falta alguna `storage_key`.
- **AC5.** Given una tanda de fotos, When pido la fecha medida, Then devuelve la `createdAt` más reciente de la tanda, no el reloj actual.
- **Pruebas:** [U] tabla completa de transiciones permitidas y prohibidas. [U] `derivarEstadoOrden` con todas las combinaciones. [U] validación de conteo, zonas repetidas y claves faltantes. [U] fecha medida con relojes simulados.
- **Nota:** el estado `confirmando` **no se implementa** (hallazgo 3 de `patron-traslado-web.md`); se declara fuera de alcance.

---

## E1 — Acceso

### A-01 Cliente HTTP · Tamaño M
Como equipo, quiero un cliente único que maneje la sesión, para que ninguna pantalla repita esa lógica.

- **AC1.** Given un 401, When ocurre en una llamada normal, Then se renueva la sesión una vez y se reintenta la llamada una vez.
- **AC2.** Given 5 llamadas simultáneas que reciben 401, When se renueva, Then se hace un solo refresh compartido.
- **AC3.** Given el reintento vuelve a dar 401, When ocurre, Then se limpia la sesión y se emite el evento de sesión expirada.
- **AC4.** Given un 403 del API, When ocurre, Then se cierra la sesión por defecto; con la opción `cerrarSesionEn403: false` la respuesta se devuelve tal cual.
- **AC5.** Given 12 segundos sin respuesta, When vence el tiempo, Then se lanza un error «Sin conexión».
- **AC6.** Given la subida a GCS, When se hace el PUT, Then no pasa por este cliente ni lleva `Authorization`.
- **Pruebas:** [I] 401, 401 doble, 403 con y sin la opción, timeout. [U] 5 llamadas concurrentes producen 1 refresh. [U] el PUT firmado no lleva cabecera de autorización.

### A-02 Login y sesión · Tamaño M · *D1 resuelta: opción A*
Como operario, quiero iniciar sesión y conservarla mientras trabajo, para no repetir mi usuario en cada orden.

- **AC1.** Given credenciales válidas, When inicio sesión, Then el access token queda solo en memoria, el refresh queda en la cookie HttpOnly que fija el servidor (`/api/login`) y paso a la home.
- **AC2.** Given credenciales inválidas (401), When intento entrar, Then veo el mensaje del servidor y no se guarda nada.
- **AC3.** Given un usuario cuyo `allowed_apps` no incluye `traslado`, When inicia sesión, Then veo una pantalla de «sin acceso» y no la home.
- **AC4.** Given una sesión iniciada, When recargo la página, Then la sesión se restaura sin pedir credenciales mediante `/api/refresh`.
- **AC5.** Given cierro sesión, When confirmo, Then se limpian el token y los metadatos.
- **AC6.** Given un usuario cuyo rol no está en `admin`, `supervisor` u `operario`, When inicia sesión, Then el login no cierra la sesión ni entra en bucle; la pantalla de «sin permiso» la muestra la home (O-01 AC6).
- **Riesgo confirmado con navegadores reales (2026-10-09):** el backend de desarrollo emite la cookie de refresh con `SameSite=None` y **sin** `Secure`. Chrome y Edge la rechazan: el login funciona pero **AC4 no se cumple en el navegador** (la recarga pide login). Con `SameSite=Lax` o con `SameSite=None; Secure` sí funciona (medido en Chrome, por `http://localhost`). **Hay que pedir al backend** `REFRESH_COOKIE_SAMESITE=lax` (o `REFRESH_COOKIE_SECURE=true`). Firefox y Safari no se verificaron. La prueba `e2e/login.spec.ts` está marcada como fallo esperado hasta entonces.
- **Pruebas:** [I] login ok, 401, sin `traslado`, 403. [E] login → home. [M] recargar en Safari de iPhone y comprobar que la sesión sigue (es la prueba clave de D1).

### A-03 Una sola sesión en todas las pestañas · Tamaño M · *Depende de A-02* · *Añadida el 2026-10-09*
**Estado (2026-10-09):** hecha en código; AC1 a AC6 cubiertos por pruebas con pestañas simuladas, y el logout entre dos pestañas reales con Playwright. Pasar sola a otra persona no se puede probar en un navegador real hasta que el backend corrija la cookie (ver A-02) y haya un segundo usuario de prueba. Detalle en [plan-sprints.md](plan-sprints.md) §2.3.

Como operario que comparte el navegador, quiero que todas las pestañas tengan el mismo usuario, para que nadie trabaje ni vea órdenes con la sesión de otra persona.

- **AC1.** Given A con sesión en las pestañas 1 y 2, When en la 2 se inicia sesión como B, Then la 1 pasa sola a B sin pedir credenciales y no muestra nada de A (ni en pantalla ni en la caché de órdenes).
- **AC2.** Given varias pestañas con sesión, When se cierra sesión en una, Then todas pasan al login, también si el logout no llegó al servidor por falta de red.
- **AC3.** Given una pestaña en el login, When otra pestaña inicia sesión, Then entra sola.
- **AC4.** Given un refresh que devuelve un usuario distinto del que tenía la pestaña, When ocurre (aunque no haya llegado ningún aviso), Then se trata como cambio de usuario.
- **AC5.** Given cualquier login o refresh, When se arma la sesión, Then el usuario y su id salen del token (`sub`, `user_id`); nunca se conserva el usuario de una sesión anterior.
- **AC6.** Given un navegador sin `BroadcastChannel`, When cambia la sesión, Then el aviso llega por el evento `storage`; sin ninguno de los dos, cada pestaña sigue funcionando como en A-02.
- **Decisiones (2026-10-09):** la pestaña pasa a B **sola**, sin preguntar; **no** hay aviso en el login cuando ya hay otra sesión abierta. Una sesión que expira (401) **no se anuncia**: cada pestaña lo descubre por su cuenta. Si se anunciara, una pestaña que se abre sin cookie podría cerrar la sesión que otra acaba de iniciar.
- **Fuera de alcance:** cada navegador, perfil o ventana de incógnito tiene su propia sesión (es una por navegador, no una por persona). Las fotos no guardan a qué usuario pertenecen.
- **Pruebas:** [U] canal entre pestañas falso: login en otra pestaña, logout, sin ecos, solo evento `storage`, identidad desde el token, refresh con otro usuario. [C] App: el cambio de A a B vacía las órdenes de A. [E] dos pestañas reales: el logout de una saca a la otra (pasar a B depende de la cookie del backend, ver A-02).

---

## E2 — Cámara y captura

Las fallas C1–C19 están en [arquitectura-front.md](../02-arquitectura/arquitectura-front.md) §2.

### T1 Detectar soporte de cámara y explicar bloqueos · Tamaño S
Como operario, quiero saber por qué no abre la cámara y qué hacer, para resolverlo sin llamar a soporte.

- **AC1.** Given una página sin contexto seguro, When abro el formulario, Then veo «La cámara solo funciona con HTTPS» y no se llama a `getUserMedia`. (C1)
- **AC2.** Given el permiso denegado, When falla, Then veo instrucciones distintas para iPhone y Android y un botón «Reintentar». (C2)
- **AC3.** Given no hay cámara o está ocupada, When falla, Then veo el mensaje correspondiente. (C3, C4)
- **AC4.** Given `OverconstrainedError`, When ocurre, Then se reintenta con restricciones mínimas y no se muestra error si funciona. (C5)
- **Pruebas:** [U] mapeo de cada nombre de error del navegador a su código y mensaje. [C] cada pantalla de error. [M] denegar el permiso en iPhone y en Android y verificar las instrucciones.

### T2 Sesión de cámara con máquina de estados · Tamaño L · *Depende de T1*
Como operario, quiero que la cámara se mantenga estable y se recupere sola, para no perder el hilo entre fotos.

- **AC1.** Given el formulario abierto, When tomo las 6 fotos, Then `getUserMedia` se llama una sola vez.
- **AC2.** Given el video sin primer frame, When intento disparar, Then el botón está deshabilitado. (C7)
- **AC3.** Given la pestaña pasa a segundo plano o el track termina, When ocurre, Then la sesión pasa a `suspendida`. (C6)
- **AC4.** Given vuelvo a primer plano, When la sesión estaba `suspendida`, Then se reabre la cámara; si el navegador exige un gesto, veo «Tocar para reactivar la cámara».
- **AC5.** Given `play()` rechazado, When ocurre, Then veo un botón de inicio. (C8)
- **AC6.** Given salgo del formulario, When se desmonta, Then todos los tracks quedan detenidos.
- **AC7.** Given una transición no permitida de la máquina, When se intenta, Then lanza un error de programación.
- **Pruebas:** [U] tabla de transiciones. [C] widget con un `CameraPort` falso por cada estado. [E] flujo con cámara falsa de Chromium: 6 capturas con una sola apertura. [M] bloquear pantalla, recibir una llamada, cambiar de app y volver, en iPhone y Android.
- **Riesgo:** el comportamiento de iOS al volver de segundo plano no está verificado; ver el spike S-01 en plan-sprints.md.

### T3 Capturar un frame JPEG verificado · Tamaño M · *Depende de T2*
Como operario, quiero que la foto solo se acepte si salió bien, para no descubrir después que quedó vacía.

- **AC1.** Given la cámara en `lista`, When toco el disparo, Then se genera un Blob `image/jpeg` con `size > 0` y se muestra el preview.
- **AC2.** Given `toBlob` devuelve `null`, tamaño 0 o un tipo distinto de JPEG, When termina la captura, Then no se guarda nada y veo «Vuelve a tomarla». (C9, C10)
- **AC3.** Given dos toques seguidos, When la primera captura sigue en curso, Then solo se procesa una. (C12)
- **AC4.** Given un frame de 4000×3000, When se captura, Then el lado largo del JPEG no supera 1920 px.
- **AC5.** Given una excepción por memoria en el canvas, When ocurre, Then veo un error recuperable, la cámara sigue en `lista` y el canvas queda liberado. (C11)
- **Pruebas:** [U] con canvas simulado: Blob nulo, tamaño 0, tipo PNG, 4000×3000, excepción. [C] doble disparo. [E] captura con cámara falsa y verificación del tipo. [M] foto real en iPhone: el archivo resultante abre y es JPEG.

### T5 Preview «Usar / Repetir» y contador por zona · Tamaño M · *Depende de T3*
Como operario, quiero revisar cada foto antes de guardarla, para no mandar fotos mal encuadradas.

- **AC1.** Given una captura correcta, When termina, Then veo el preview con «Usar» y «Repetir» y no se guarda hasta elegir.
- **AC2.** Given elijo «Repetir», When confirmo, Then se descarta sin guardar y vuelvo a la cámara en la misma zona.
- **AC3.** Given elijo «Usar», When se guarda, Then avanza a la siguiente zona sin foto.
- **AC4.** Given la salida o la entrega, When veo el formulario, Then el contador muestra `n/6` o `n/5` y cada zona muestra su miniatura o su hueco.
- **AC5.** Given la zona activa, When la cámara está en `lista`, Then veo la guía visual de esa zona sobre el video.
- **AC6.** Given la entrega, When veo las zonas, Then incluyen `VIN` y no las dos de placa.
- **Pruebas:** [C] Usar, Repetir y avance. [C] contador y zonas por momento. [E] 6 fotos de salida y 5 de entrega. [C] axe del formulario.

### T4a Guardar la foto en Dexie con verificación · Tamaño M · *Depende de T3*
Como operario, quiero que mi foto aceptada quede guardada de forma segura, para no perderla aunque la pestaña se cierre.

- **AC1.** Given una foto aceptada, When se guarda, Then la fila se inserta como `writing` antes de escribir el Blob y pasa a `pending` solo si se lee de vuelta con el mismo tamaño.
- **AC2.** Given falla la escritura, When se reintenta una vez y vuelve a fallar, Then la fila queda `failed_local` con el motivo.
- **AC3.** Given `QuotaExceededError`, When ocurre, Then veo «Espacio insuficiente».
- **AC4.** Given recapturo una zona con una foto previa, When la nueva no se verifica, Then la anterior sigue intacta. (C15)
- **AC5.** Given dos fotos de la misma zona y momento, When se guardan, Then el índice único `[orden+momento+zona]` impide dos filas vivas.
- **AC6.** Given el formulario abierto, When entro, Then se solicita `storage.persist()` y, si el espacio estimado es bajo, se avisa. Un `false` no bloquea.
- **Pruebas:** [I] con `fake-indexeddb`: ciclo `writing → pending`. [I] error de cuota simulado. [I] recaptura fallida conserva la foto anterior. [U] cada foto lleva `clientId` único. [I] el índice único rechaza el duplicado.

### T4b Reconciliar al abrir · Tamaño S · *Depende de T4a*
Como operario, quiero retomar donde estaba tras una recarga, para no repetir fotos que ya tomé.

- **AC1.** Given filas `writing` huérfanas, When abro la app, Then pasan a `failed_local` y se me pide retomar solo esas zonas. (C14)
- **AC2.** Given filas `pending` de una sesión anterior, When abro la app, Then se conservan y aparecen en su zona.
- **AC3.** Given fotos de salida y de entrega de la misma orden, When abro el formulario, Then cada momento muestra solo las suyas.
- **AC4.** Given acepto una foto y recargo con fuerza, When vuelvo, Then la foto sigue ahí.
- **Pruebas:** [I] filas `writing` sembradas se marcan `failed_local`. [I] filtro por momento. [E] recarga forzada tras «Usar» (indicador «0 fotos aceptadas perdidas»). [M] cerrar la pestaña desde el selector de apps en iPhone y Android.

### T11 Aviso de foto oscura o tapada · Tamaño S · *Could*
- **AC1.** Given el frame es casi negro, When se captura, Then veo un aviso «La foto parece oscura o tapada» y puedo repetir o usarla.
- **Pruebas:** [U] medición de luminosidad con imágenes de muestra. [C] el aviso.

---

## E3 — Órdenes

### O-01 Home con «Mis traslados» y «Disponibles hoy» · Tamaño L · *Depende de A-02, F-03*
**Estado (2026-10-09):** hecha en código; AC1 a AC6 cubiertos por pruebas. Falta mirarla en un teléfono y probar el 403 con un usuario real de rol no permitido. Detalle en [plan-sprints.md](plan-sprints.md) §2.3.

Como operario, quiero ver mis órdenes y las del pool del día, para saber qué me toca.

- **AC1.** Given sesión iniciada, When abro la home, Then veo dos secciones que no se fusionan.
- **AC2.** Given una tarjeta, When se pinta, Then el color sigue el mapa: lista para enviar verde, cancelada rojo, en tránsito azul, el resto gris, con las etiquetas de `patron-traslado-web.md` §5.
- **AC3.** Given escribo en el filtro de VIN, When no hay red, Then filtra sobre lo ya cargado y no consulta al servidor.
- **AC4.** Given pierdo la conexión, When estoy en la home, Then veo el banner ámbar y los datos en caché.
- **AC5.** Given el servidor trae placa o proveedor vacíos, When actualizo la caché, Then conserva los valores anteriores; Given trae `conductor_asignado` nulo, Then se interpreta como «sin dueño» y no se conserva el anterior.
- **AC6.** Given la llamada a `mis-ordenes` recibe 403 (rol no permitido: `Permisos insuficientes`), When ocurre, Then veo «Sin permiso para Traslado» con el mensaje del servidor y un botón «Cerrar sesión»; la sesión no se cierra sola.
- **Política de 403 (decidida el 2026-10-09):** todas las llamadas de Traslado pasan `cerrarSesionEn403: false`, definido en un solo lugar dentro de `features/traslado/api/`. No se cambia A-01. `/mobile/storage/upload-url` no puede dar 403 (solo exige un token válido), así que no necesita la constante.
- **Opcionales (Could), no entran sin pedirlo:** un botón «Reintentar» que renueva la sesión y vuelve a probar (sirve si el rol cambió a mitad de turno: el backend relee el rol al renovar); y mostrar «El servicio rechazó la solicitud» cuando el 403 no trae `detail` en JSON (lo que haría un bloqueo de Cloud Run o de un WAF).
- **Pruebas:** [U] reglas de mezcla de la caché. [I] `mis-ordenes` con y sin datos. [C] color y etiqueta por estado. [E] modo sin conexión de Playwright con el filtro. [I] 403 en `mis-ordenes` muestra la pantalla y no cierra la sesión. [U] **prueba de guarda:** toda función de `trasladoApi` pasa `cerrarSesionEn403: false`.

### O-02 Tomar y soltar una orden · Tamaño M · *Depende de O-01*
**Estado (2026-10-10):** hecha en código; AC1 a AC7 cubiertos por pruebas, y tomar/soltar probados contra una orden real de la base de desarrollo. Falta probarla en un teléfono. Detalle en [plan-sprints.md](plan-sprints.md) §2.3.

Como operario, quiero tomar una orden del pool, para empezar el despacho.

- **AC1** *(cambiado el 2026-10-10)*. Given una tarjeta del pool, When pulso «Comenzar despacho», Then se toma; tocar el resto de la tarjeta no hace nada (un toque accidental no asigna un auto).
- **AC2.** Given otra persona la tomó antes (409), When intento tomarla, Then veo el mensaje con su nombre y no se reintenta.
- **AC3.** Given tomo una orden ya mía, When llamo a tomar, Then responde 200 sin duplicar.
- **AC4** *(precisado el 2026-10-10)*. Given no hay red, When pulso «Comenzar despacho», Then la toma queda pendiente **guardada aparte con su dueño**: sobrevive a cerrar la sesión y se envía cuando esa persona vuelve a tener sesión y conexión. Given al enviarla el servidor responde 409, Then **no se reintenta más**: la tarjeta dice «La tomó …» y las fotos se conservan.
- **AC5.** Given soltar una orden, When no hay red, Then se exige conexión; Given la orden ya salió o no es mía (409), Then veo el motivo. Given la toma todavía no llegó al servidor, When la suelto, Then se cancela en el teléfono sin necesitar red.
- **AC6** *(añadido el 2026-10-10)*. Given una orden propia con fotos, When la suelto, Then se pide confirmación («se borran de este teléfono») y, al confirmar, las fotos se borran.
- **AC7** *(añadido el 2026-10-10)*. Solo se pueden soltar las órdenes tomadas del pool en este navegador; una asignada por el supervisor no se ofrece para soltar.
- **Decisiones (2026-10-10):** toma pendiente aparte con su dueño (no en la caché de órdenes); solo el botón toma; 409 al enviar una toma pendiente = no se reintenta; soltar solo lo tomado aquí; al soltar con fotos se borran tras confirmar. **Cuándo se envía la toma pendiente:** al actualizar la lista con conexión, y antes de subir las fotos y del botón «Enviar» del formulario (E4-01, E4-02); no hay un proceso aparte en segundo plano.
- **Pedido al backend (C, opcional):** exponer `fecha_toma` en `mis-ordenes`. La columna ya existe y solo la escribe `tomar` (el alta del supervisor la deja vacía), así que distingue «tomada del pool» de «asignada por el supervisor» desde cualquier dispositivo. Cambio aditivo en tres lugares (`_SELECT_ORDEN`, `TrasladoOrdenOut` y su mapeo en el servicio); la app móvil lee campo por campo e ignora uno nuevo. Con eso AC7 dejaría de depender de este navegador.
- **Pruebas:** [I] 200, 409 con nombre, idempotencia. [E] la carrera de `patron-traslado-web.md` §4.2: A sin señal, B toma, A reconecta y conserva sus fotos. [I] soltar 409.

### O-03 Identificar un VIN · Tamaño M · *Depende de A-01*
**Estado (2026-10-10):** hecha en código; AC1 a AC5 cubiertos por pruebas, y las E2E en Chrome y Edge. Falta mirarla en un teléfono. **Pendiente de decisión:** qué hacer con la búsqueda parcial. Detalle en [plan-sprints.md](plan-sprints.md) §2.3.
- **AC1.** Given un VIN exacto, When consulto, Then se codifica en la URL.
- **AC2.** Given 404, When responde, Then veo «VIN no conocido».
- **AC3.** Given 200 con lista vacía, When responde, Then veo «sin orden pendiente» (mensaje distinto del 404).
- **AC4.** Given 422, When responde, Then veo «formato de VIN inválido».
- **AC5.** Given menos de 4 caracteres en la búsqueda parcial, When escribo, Then no se llama al servidor.
- **Pruebas:** [I] 200, 404, 422, lista vacía. [U] el corte de 4 caracteres. [C] los tres mensajes.

### O-04 Catálogos y selector de placa y proveedor · Tamaño S · *Depende de O-01*
**Estado (2026-10-10):** hecha en código; AC1 a AC3 cubiertos por pruebas. **AC4 queda para E4-02:** lo elegido se guarda en el teléfono y el `null` se aplica al confirmar la salida, que aún no existe. Falta mirarla en un teléfono. Detalle en [plan-sprints.md](plan-sprints.md) §2.3.

- **AC1.** Given el formulario de salida, When abro el selector de placa, Then puedo filtrar por código y la lista tiene una altura máxima de 224 px.
- **AC2.** Given una placa con estado, When se lista, Then el estado aparece como texto («afuera»), no como color.
- **AC3.** Given no hay red, When abro el selector, Then usa el catálogo en caché.
- **AC4.** Given no elijo placa o proveedor, When confirmo, Then se envían como `null`.
- **Pruebas:** [I] catálogos. [C] filtro y altura. [U] caché offline.

### O-04b Corregir con un lápiz la placa o el proveedor elegidos · Tamaño S · *Depende de O-04* · *Añadida el 2026-10-10*
**Estado (2026-10-10):** hecha en código; AC1 a AC8 cubiertos por pruebas, y la E2E en Chrome y Edge. Falta mirarla en un teléfono.
Como operario, quiero un lápiz junto a la placa y al proveedor que ya elegí, para corregir una selección hecha por error sin dudar si me dejará cambiarla.

**Por qué:** hoy, tras elegir, el campo sigue pareciendo un cuadro de texto lleno y nada dice que se puede cambiar; el usuario reportó que «no me permite cambiar por otra». Un lápiz hace visible la acción (reconocer es más fácil que recordar), protege contra el toque accidental (el valor elegido no se pisa al rozar el campo) y deja claro **qué quedó elegido**.

**Decisiones (2026-10-10):**
- **Dos modos por campo.** *Sin elegir:* el selector filtrable de O-04, sin lápiz. *Elegido:* el campo pasa a **solo lectura** (muestra la opción con su estado en texto) con un **lápiz a su costado**. Tocar el lápiz vuelve al selector, con el foco puesto y la lista abierta.
- **Corregir nunca borra por accidente:** si el operario abre el lápiz y se va (Escape o toca fuera) sin elegir, **se conserva lo que había**. No se ofrece «quitar la elección» (dejar el campo vacío): corregir es cambiar por otra. Si hiciera falta, es otra historia (ver *Could*).
- **No se pide confirmación** al cambiar: nada se envía al servidor hasta E4-02, así que equivocarse y corregir no cuesta nada.
- **El lápiz aplica a la placa y al proveedor, cada uno por separado.** No aparece en lo que el servidor ya trae (no es editable).
- **Es un botón, no solo un icono:** mide al menos 44 px, tiene nombre accesible («Editar placa rotativa de …») y no depende del color.

- **AC1.** Given un campo sin elegir, When lo veo, Then es el selector filtrable y **no** hay lápiz.
- **AC2.** Given elijo una opción, When queda guardada, Then el campo pasa a solo lectura mostrando la elección y aparece un lápiz a su costado; el foco pasa al lápiz y no se manda nada al servidor.
- **AC3.** Given un campo elegido, When toco el lápiz, Then vuelve el selector con el foco puesto, la lista abierta y la opción actual marcada.
- **AC4.** Given estoy corrigiendo, When elijo otra opción, Then el campo muestra la nueva y el lápiz sigue ahí; puedo repetirlo hasta confirmar la salida.
- **AC5.** Given estoy corrigiendo, When salgo sin elegir (Escape, tocar fuera o cambiar de campo), Then se conserva la elección anterior y vuelve el modo de solo lectura.
- **AC6.** Given un valor que trae el servidor, When veo la orden, Then no hay selector ni lápiz.
- **AC7.** Given la placa y el proveedor, When corrijo uno, Then el otro no cambia.
- **AC8.** Given un lector de pantalla o el teclado, When recorro la tarjeta, Then el lápiz es un botón alcanzable con Tab, con nombre propio por campo y orden, y sin violaciones de accesibilidad.
- **Pruebas:** [C] modos del campo, lápiz, salir sin elegir, conservar lo anterior, foco, accesibilidad. [C] en la home: corregir la placa y el proveedor por separado y que no se llame al servidor. [E] en Chrome y Edge: elegir, tocar el lápiz y cambiar por otra tres veces sin peticiones al servidor. [M] en un teléfono: que el toque en el lápiz sea cómodo con una mano y el teclado no tape la lista.
- **Could (no entra sin pedirlo):** «quitar la elección» para dejar el campo vacío.

### O-05 Escanear el VIN con la cámara · Tamaño M · *Could→Should (pedida por el usuario el 2026-10-12)*
- **AC1.** Given el escaneo, When detecta un VIN, Then llena el filtro y no consulta al servidor.
- **AC2.** Given una sesión de captura abierta, When abro el escáner, Then se libera primero el stream anterior (una sola cámara a la vez). *Hoy se cumple por construcción: el escáner solo existe en la home y la captura la reemplaza; al cerrar el escáner se suelta la cámara.*
- **AC3.** Lee **QR y códigos de barras** (Code 128, Code 39, Data Matrix), como la app móvil. Lo leído es texto: si trae un VIN completo suelto (por ejemplo dentro de una dirección o con rótulo) se usa ese; si no, el texto en mayúsculas y sin espacios.
- **AC4.** Given que la cámara está denegada o no disponible, When abro el escáner, Then veo el motivo y cómo arreglarlo, y puedo cerrar. Escape cierra; el foco vuelve al botón.
- **Librería:** `@zxing/browser` (la misma que el portal), cargada **solo al abrir el escáner** (no pesa en la carga de la home).
- **Pruebas:** [U] extracción del VIN, lector cuadro a cuadro, decodificador. [C] diálogo y home. [M] escanear una etiqueta real en iPhone y Android.
**Estado (2026-10-12):** hecha en código; falta [M].

---

## E4 — Envío

### E4-01 Subida a GCS con reintentos · Tamaño L · *Depende de T4a, D3*
**Nota del 2026-10-10:** la subida es **al tomar cada foto** y sin cola automática: si falla, «Reintentar» en esa foto. La foto se sigue guardando en el teléfono al tomarla (red de seguridad ante una recarga), pero no hay modo sin señal.
Como operario, quiero que mis fotos suban aunque la señal falle, para no repetir el trabajo.

- **Flujo pedido por el usuario (2026-10-10), a refinar al empezar E4:** cada foto **se va subiendo en cuanto se toma** (no al final), con vista previa y la opción de **editar o cambiar** una foto ya tomada; al terminar, un botón **«Enviar»** registra el envío (VIN, usuario, fotos y demás: es `confirmar-salida` o `confirmar-entrega`). Antes de la primera subida y antes de «Enviar» se registra la toma si estaba pendiente (O-02). **Por revisar al refinar:** cambiar una foto ya subida deja la anterior en el bucket sin referencia; y D3 (CORS) para los orígenes de los teléfonos.

- **AC1.** Given una foto `pending`, When subo, Then pido `upload-url` con `module: 'traslado'` y `content_type: 'image/jpeg'`.
- **AC2.** Given la URL firmada, When hago el PUT, Then uso el mismo `Content-Type`, sin `Authorization`.
- **AC3.** *(cambiada el 2026-10-12 por la decisión «web con internet»)* Given falla de red o 5xx, When ocurre, Then se hace **un solo intento**, la foto queda `failed_upload` con el motivo y la zona muestra «Reintentar»; no hay espera ni reintentos automáticos.
- **AC4.** Given 403 en el PUT, When ocurre, Then se pide una URL nueva, hasta 2 veces; luego falla con el mensaje de storage.
- **AC5.** Given otro 4xx, When ocurre, Then se aborta sin reintentar.
- **AC6.** Given `TypeError` sin código, When ocurre, Then el mensaje dice «red o permisos de storage» (C17).
- **AC7.** Given cada intento, When arranca, Then lee el Blob desde Dexie; Given el Blob ya no está, Then falla sin reintentar.
- **AC8.** Given éxito, When responde 2xx, Then la fila pasa a `uploaded` y guarda `storage_key`.
- **Pruebas:** [U] calendario de esperas con temporizadores falsos. [I] 200, 403 una y tres veces, 400, `TypeError`. [I] Blob ausente. [M] subida real contra el bucket una vez configurado D3.

**Estado (2026-10-12):** hecha en código; AC1 a AC8 con pruebas (sin la prueba real contra el bucket, que necesita D3). La subida se dispara al guardar la foto y se retoma al abrir el formulario; la pantalla de captura se abre desde la tarjeta de una orden propia.

### E4-02 Confirmar salida y confirmar entrega · Tamaño L · *Depende de E4-01, F-03*
**Nota del 2026-10-10 (decisión del usuario):** la web es **con internet**. El botón final **no «manda todo»**: las fotos ya se subieron una por una al tomarlas (E4-01). Se llama **«Confirmar salida»** o **«Confirmar entrega»** y solo **registra el despacho** (referencias de las fotos, placa, proveedor, fecha medida). Si falla, mensaje y «Reintentar»; reintentar es seguro porque el backend reconoce al mismo conductor y no duplica. **E4-03 y E4-04 se descartan.**
Como operario, quiero confirmar el despacho cuando las fotos estén arriba, para cerrar la orden.

- **AC1.** Given fotos incompletas o con zonas repetidas, When intento confirmar, Then no se llama al servidor y veo qué falta. (C19)
- **AC2.** Given 6 fotos subidas, When confirmo la salida, Then el cuerpo trae las 6 fotos con zona y `storage_key`, `id_conductor_asignado_esperado`, `id_placa` e `id_proveedor` (pueden ser `null`) y `fecha_salida_cliente` en UTC ISO con la fecha medida.
- **AC3.** Given respuesta `confirmada`, When llega, Then se borran las fotos de ese momento y la orden pasa a `en_transito`.
- **AC4.** Given respuesta `descartada_por_supervisor`, When llega, Then no es un error: se borran las fotos locales y la orden de la caché, y veo el motivo.
- **AC5.** Given un 4xx, When ocurre, Then es un error y no se borra nada.
- **AC6.** Given 5 fotos subidas (4 exteriores + `VIN`), When confirmo la entrega, Then el cuerpo trae `fecha_entrega_cliente`; Given la orden nunca salió (422), Then veo el mensaje específico.
- **AC7.** Given el servidor guarda las fotos aunque la orden esté cancelada, When descarto, Then mi mensaje no promete lo contrario.
- **Pruebas:** [U] validación previa. [I] 200 confirmada, 200 descartada, 422, 409. [I] cuerpo exacto de ambas confirmaciones. [E] salida y entrega de punta a punta contra el backend local. [M] flujo completo en iPhone y Android.

**Estado (2026-10-12):** hecha en código; AC1 a AC7 cubiertos por pruebas con un servidor falso. Falta la prueba contra el backend de desarrollo (cambia la orden a `en_transito`). Detalle en `TODO.md`.

### T12 Elegir una foto de la galería · Tamaño M · *Could→Should (pedida por el usuario el 2026-10-12)*
Como operario, quiero elegir una foto que ya tengo en el teléfono, para completar una zona cuando no puedo usar la cámara de la página.
- **AC1.** Given el formulario de captura, When lo abro, Then veo «Elegir de la galería» junto a «Tomar foto», y se bloquea cuando ya no hay zona por fotografiar.
- **AC2.** Given que elijo un archivo, When es una imagen, Then se convierte a JPEG (lado largo máximo 1920 px, orientación corregida, sin metadatos) y queda en revisión con «Usar» y «Descartar».
- **AC3.** Given la foto en revisión, When pulso «Usar», Then se guarda en la zona que estaba activa al elegirla y se sube igual que una foto de la cámara; «Descartar» no guarda nada.
- **AC4.** Given que elijo algo que no es una foto, está vacío o no se puede leer, When ocurre, Then veo el motivo y puedo elegir otra.
- **AC5.** Given que la cámara está denegada o no disponible, When quiero fotografiar, Then la galería funciona igual.
- **AC6.** Given una foto de la galería, When se registra su fecha, Then es la de modificación del archivo (cuándo se tomó); si falta o es futura, la de ahora.
- **AC7.** Given una foto en revisión o procesándose, When intento cambiar de zona o tomar otra, Then está bloqueado.
- **Decisiones abiertas:** marcar en el servidor las fotos de galería (campo `comentario` de cada foto al confirmar); que el supervisor sepa cuáles no se tomaron en el momento.
- **Pruebas:** [U] conversión (tipos, fecha, memoria, orientación). [C] widget y formulario. [M] iPhone y Android con HEIC y fotos grandes.
**Estado (2026-10-12):** hecha en código; falta [M].

### E4-03 Drenador con candado entre pestañas · Tamaño L · *Should · Depende de E4-02*
Como operario, quiero que lo pendiente se envíe solo cuando vuelva la señal, para no tener que acordarme.

- **AC1.** Given las 5 igniciones (captura completa, abrir o refrescar la home, volver al primer plano, recuperar conexión, cambio de red), When ocurre una, Then arranca un barrido.
- **AC2.** Given el barrido, When corre, Then el orden es tomas, salidas, entregas.
- **AC3.** Given un barrido en curso, When llega otra ignición, Then se anota y se repite al terminar.
- **AC4.** Given dos pestañas abiertas, When ambas intentan drenar, Then solo una lo hace (Web Locks).
- **AC5.** Given una foto pasa a `pending` y hay red, When ocurre, Then empieza a subir sin esperar a las demás.
- **AC6.** Given se confirma una tanda, When termina, Then se borra por `(orden, momento)` y no en bloque.
- **AC7.** Given una foto `failed_upload`, When llega el siguiente barrido, Then se reintenta.
- **Pruebas:** [U] orden del barrido. [U] reentrada. [U] dos instancias con candado simulado: una corre. [E] dos pestañas. [M] alternar modo avión con fotos pendientes.

### E4-04 Sesión vencida con fotos pendientes · Tamaño M · *Should · Depende de A-02, E4-03*
- **AC1.** Given un refresh fallido (401), When hay fotos pendientes, Then no se toca ninguna foto y se bloquea el envío.
- **AC2.** Given inicio sesión de nuevo, When entro, Then el drenador retoma el envío.
- **AC3.** Given el API responde 403 durante el envío, When ocurre, Then no se cierra la sesión: el envío queda en pausa, las fotos locales se conservan y veo «Sin permiso para Traslado».
- **AC4.** Given otro usuario inicia sesión en el mismo teléfono, When entra, Then no ve ni envía las fotos pendientes del anterior. *(Supuesto a confirmar con negocio: no lo cubre el código revisado.)*
- **Pruebas:** [I] 401 con fotos sembradas: siguen intactas. [I] 403 durante el envío: la sesión sigue abierta y las fotos intactas. [E] expirar y volver a entrar. [I] fotos asociadas al usuario.

---

## E5 — Testeo

### P-01 Testeo en dispositivos reales y validación de resolución · Tamaño M · *Depende de E4-02*
Como equipo, quiero comprobar la captura en teléfonos reales, para validar lo que Playwright no puede ver.

- **AC1.** Given una lista de dispositivos con modelo y versión de sistema (al menos un iPhone y un Android), When se ejecuta la matriz, Then cada falla C1–C19 queda marcada como pasa, falla o no aplica.
- **AC2.** Given un supervisor revisa un conjunto de fotos de prueba, When opina, Then la resolución queda aprobada o se ajusta la constante y se repite la prueba.
- **AC3.** Given los casos que solo se validan en dispositivo (C6, C13, C14), When se ejecutan, Then el resultado queda registrado.
- **AC4.** Given el testeo, When termina, Then se informa el recuento de fotos vacías subidas (meta 0) y de fotos aceptadas perdidas (meta 0).
- **Pruebas:** [M] matriz completa. No se fija una tasa objetivo de fallos de cámara hasta tener datos.

---

## E7 — Seguimiento del coordinador *(añadida el 2026-10-15, pedida por el usuario)*

Una segunda audiencia: el rol `coordinador` ve, **solo en esta web**, todos los traslados que genera Traslado. Solo lectura, **sin mapa y sin PDI** en este MVP, entra **por rol** y sin filtro por destino. Mapeo: [mapeo-rol-coordinador.md](mapeo-rol-coordinador.md). Contrato y pedido: [pedido-backend-seguimiento-coordinador.md](pedido-backend-seguimiento-coordinador.md). Funcional: [propuesta-vista-cliente.md](../01-vision-y-alcance/propuesta-vista-cliente.md).

### C-00 Seguimiento de los traslados · Tamaño L · *Depende de B-01*
**Estado (2026-10-15):** hecha en código y probada con servidores falsos (Vitest y Playwright en Chrome y Edge); **el rol y el endpoint no existen en el backend**, así que no se probó con datos reales.

Como coordinador, quiero ver todos los traslados con su etapa y los hitos registrados, para saber qué vehículos salieron, cuáles van en camino y cuáles se entregaron.

- **AC1.** Given un usuario con rol `coordinador`, When inicia sesión, Then ve la vista de seguimiento, **aunque su `allowed_apps` esté vacío o incluya `traslado`**.
- **AC2.** Given un usuario que no es coordinador, When inicia sesión, Then todo sigue como hoy: la home con `traslado`, «Sin acceso» sin él. Un rol que solo se parece («Coordinador») no cuenta.
- **AC3.** Given la lista, When se pinta, Then cada vehículo tiene una etapa con texto (En planta, En camino, Entregado, Anulado), y se ordena: en camino (lo más reciente arriba), en planta, entregados, anulados.
- **AC4.** Given las pestañas, Then son **Todos, En camino y Entregados**; «Todos» muestra también lo que está en planta. **Las órdenes anuladas no se muestran** (cambiado el 2026-10-15, a pedido del usuario; antes se mostraban con «Comunícate con SUM»): la web las descarta aunque el servidor las mande.
- **AC5 — Sin GPS** *(decidido el 2026-10-15, a pedido del usuario; reemplaza al AC5 anterior)*. Given cualquier pantalla de la vista (lista, tabla, detalle, consulta masiva), Then **no se muestra nada de GPS**: ni ubicación, ni «en vivo» o «última ubicación», ni si el traslado lleva un dispositivo, ni «seguimiento satelital». La tabla tiene tres columnas (Vehículo, Destino, Etapa) y el detalle solo trae el vehículo, el destino, la etapa y los hitos. La web no lee el campo `seguimiento` aunque el servidor lo mande.
- **AC6.** Given el detalle, Then muestra «Salida registrada» y «Entrega» con fecha en hora de Lima, y «—» (con texto para lector de pantalla) donde no hay registro; una entrega con hora estimada muestra solo la fecha y «Hora no disponible».
- **AC7.** Given el teléfono (360 px), Then hay una lista continua y el detalle a pantalla completa, sin desborde horizontal; en pantalla ancha, una tabla a todo lo ancho y el detalle en un panel a la derecha que se abre con «Ver detalle» (cambiado el 2026-10-15: debajo de la tabla quedaba lejos con muchos vehículos). El VIN se muestra completo; las pestañas llevan su conteo; la pantalla dice «Última actualización: HH:MM» (hora de Lima).
- **AC8.** Given la pantalla, Then no muestra conductor, velocidad, fotos ni mapa.
- **AC9.** Given un 403 del servidor, Then se ve «Sin permiso para ver el seguimiento» con el mensaje del servidor y **no se cierra la sesión**; sin red se sigue viendo lo último recibido con un aviso; un fallo nunca vacía la lista.
- **AC10.** Given que se cierra la sesión o entra otra persona, Then no queda nada de la anterior en memoria; los datos **no se guardan en el navegador**.
- **AC11 — Consulta masiva de VIN** *(pedida el 2026-10-15)*. Given el botón «Consulta masiva de VIN», When se abre, Then hay un cuadro para pegar los VIN (uno por línea o separados por coma, punto y coma, espacio o tabulador; sirve copiar una columna de Excel), «Consultar» y «Limpiar», y no se ven la lista ni sus filtros.
- **AC12.** Given lo pegado, Then antes de consultar se dice cuántos VIN son, que los repetidos se consultan una vez, cuáles no tienen forma de VIN (17 letras y números, sin I, O ni Q; no se consultan) y, si pasan de **200**, cuántos sobran (no se puede consultar).
- **AC13.** Given una consulta, Then cada VIN sale **en el orden pegado**: si su orden **más reciente entre las que están en tránsito o ya entregadas** existe (de cualquier fecha, sin ventana de días), se ve como en la lista (vehículo, destino, etapa, seguimiento, fecha, «Ver detalle»); **todo lo demás** —sin orden, orden que aún no sale, orden cancelada— sale como **«Pendiente de información»** con «Aún no está en el plan de despacho.», sin distinguir esos casos.
- **AC14.** Given el resultado, Then se resume («4 VIN consultados: 2 con información y 2 pendientes de información.»); lo anulado nunca se enseña; un fallo (sin red, 403, 5xx) se dice con qué hacer y **no borra** el último resultado; «Limpiar» lo borra todo; el resultado vive solo en memoria.
- **AC15.** Given «Ver detalle» de un resultado, Then se abre el mismo panel de detalle que en la lista.
- **AC16.** Given el panel de detalle, Then el vehículo, el destino, la etapa y los hitos se ven en tamaño grande (el panel ocupa el ancho en el teléfono y 560 px en pantalla grande); al abrirlo nada de la página de atrás se corre; «Cerrar» muestra su contorno completo al recibir el foco.
- **AC11.** Given la vista, Then la lista se pide **una vez al abrir** y después **solo con el botón «Actualizar»**: no hay renovación automática (ni por tiempo, ni al volver a la pestaña, ni al volver la red). Cambiado el 2026-10-15: el usuario no la pidió. «Última actualización: HH:MM» dice cuándo llegó la última lista.
- **Decisiones del usuario (2026-10-15):** rol `coordinador` (no `cliente`, que es el auditor de inspecciones); acceso por rol y no por `allowed_apps`; coordinador general sin filtro por destino; solo web, sin cambios en Flutter; el PDI no entra en este MVP; campos visibles como en la propuesta (sin conductor, velocidad ni fotos).
- **Pruebas:** [U] dominio (fechas en Lima, hitos, filtros), API y esquemas, controlador; [C] página y componentes con axe; [I] acceso por rol en `App`; [E] `e2e/seguimiento.spec.ts` con las respuestas simuladas.
- **Pendiente:** probarla en un teléfono real, y con el backend cuando exista.

### B-01 El rol `coordinador` y el endpoint de seguimiento · *Backend, sin hacer*
Ver [pedido-backend-seguimiento-coordinador.md](pedido-backend-seguimiento-coordinador.md): `coordinador` en `ROLES_VALIDOS`, `GET /api/seguimiento/traslados` con guard por rol, lista cerrada de campos, sin llamar al proveedor de GPS. **Bloquea** probar C-00 con datos reales.

### Fases posteriores (no incluidas)
- **C-03** Mapa con la posición y la estela de un vehículo con GPS.
- **C-04** Hito «PDI terminado» (necesita ligar el PDI a la orden).
- **C-05** Filtro por destino y roles para externos (tabla usuario → destino); hoy el rol solo debe darse a personal de SUM.
- Logos de marca (hoy una inicial neutra) cuando se confirmen las marcas y el permiso de uso.

## E6 — Topología y despliegue (PENDIENTE)

**Estado:** Pendiente. Fuera de la etapa de desarrollo actual.
**Razón:** no hay enlace público ni dominio todavía. En desarrollo local no bloquea.
**Plazo límite recomendado:** D1 antes de A-02. D3 antes de E4-01. D2 antes del primer demo con operarios.

### D1 — Esquema de login: **DECIDIDO, opción A** (2026-10-09)

| | A. `/api/login` con cookie (patrón del portal) | B. `/mobile/auth/*` con refresh en el cuerpo (patrón de la app) |
|---|---|---|
| Refresh token | Cookie HttpOnly. El JS no lo ve. | Storage legible por JS. |
| iPhone | Riesgo si front y API están en sitios distintos (cookie `lax`). | Sin problema de cookies. |
| Límite de intentos | 10/min en login, 20/min en refresh, por IP. | Sin límite en `mobile/auth.py` (confirmado). |

- **Decisión (2026-10-09): opción A**, con front y API bajo el mismo origen (proxy de Vite en desarrollo, nginx en D2). El AC2 ya no aplica. El AC1 sigue abierto solo para producción: falta que backend confirme `REFRESH_COOKIE_SAMESITE` y `X-Forwarded-For`.
- **AC1.** Given el equipo de backend confirma `REFRESH_COOKIE_SAMESITE` y `X-Forwarded-For` en producción, When se revisan las opciones, Then queda registrada la decisión A o B con su motivo.
- **AC2.** Given se eligió B, When se revisa seguridad, Then hay aprobación escrita para guardar el refresh en el navegador.
- **AC3.** Given se eligió A, When se prueba en iPhone Safari, Then el refresh restaura la sesión tras recargar.

### D2 — Entorno de pruebas público con HTTPS

- **Recomendación:** nginx con proxy dentro del front nuevo (Cloud Run), rutas `/api/` y `/mobile/` hacia el API. No requiere dominio.
- **Alternativas** (si aparece un dominio): balanceador HTTPS con mapa de URL, o subdominios hermanos.
- **AC1.** Given el front desplegado, When abro la URL en iPhone y Android, Then el login funciona y la cámara pide permiso.
- **AC2.** Given varios usuarios entran a la vez desde el proxy, When inician sesión, Then no reciben 429 por compartir IP.
- **AC3.** Given el front en producción, When llama al API, Then usa rutas relativas.

### D3 — CORS del bucket GCS por origen

- **Nota:** aplica en todas las opciones. La subida va directa del navegador al bucket.
- **AC1.** Given los orígenes de dev, staging y producción, When se configura el CORS, Then un PUT con URL firmada desde cada origen devuelve 2xx.
- **AC2.** Given un origen sin configurar, When se hace el PUT, Then falla por CORS (sirve para detectar el origen que falta).

### Solicitudes a terceros

| Qué | A quién | Estado |
|---|---|---|
| `REFRESH_COOKIE_SAMESITE` y `REFRESH_COOKIE_SECURE` en producción | Equipo de backend | No verificado |
| Manejo de `X-Forwarded-For` y límite por IP detrás de un proxy | Equipo de backend | No verificado |
| Revisión de seguridad del refresh token (solo si B) | Seguridad de la información | No verificado |
| ¿SUM tiene dominio propio y quién controla el DNS? | TI / infraestructura | No verificado |
| CORS del bucket para los orígenes de desarrollo | Administración del proyecto GCP | No verificado |
| Casos de prueba en el backend (lista mínima en plan-sprints.md §6.1) y un entorno de pruebas con base propia | Equipo de backend | En curso; falta confirmar cobertura y entorno |
| Qué roles tienen hoy los usuarios con `traslado` en `allowed_apps`, para saber si existe algún rol fuera de `admin`, `supervisor` y `operario` (hoy el 403 es solo una hipótesis) | Equipo de backend | No verificado |
| Un iPhone y un Android para probar, con modelo y versión de sistema | Quien coordina el testeo | Se probará en ambos cuando haya algo que probar; modelos sin definir |

---

## Fuera de alcance por ahora (Won't)

- Telemetría remota y bitácora de captura («Copiar diagnóstico», T10).
- Respaldo visible en `Documents/eSum/`.
- Estado `confirmando` (hallazgo 3).
- Historial de órdenes `realizado` (hallazgo 4).
- Service worker o PWA.
- Soporte de iOS más allá de lo que cubra P-01: se acepta el riesgo de que Safari expulse datos locales.
