import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * La vista de seguimiento del coordinador en un navegador real. **No usa el backend**: `/api/*` y `/mobile/*` se responden
 * aquí mismo, así que no toca la base de datos ni el bucket (ADR 0008) y no necesita credenciales ni consume el límite de
 * logins.
 *
 * Con `SEGUIMIENTO_CAPTURAS=<carpeta>` guarda capturas de pantalla para mirarlas.
 */
const base64Url = (objeto: unknown) => Buffer.from(JSON.stringify(objeto)).toString('base64url')
const TOKEN = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ sub: 'coord.prueba', user_id: 7, role: 'coordinador' })}.firma`

/**
 * El reloj de la página queda fijo el 15 oct 2026, 07:03 en Lima: «Hoy» es siempre el 2026-10-15, haya cuando se haya corrido la
 * prueba. Los datos de abajo están hechos para ese día.
 */
const AHORA = new Date('2026-10-15T12:03:00Z')

const TRASLADOS = [
  { id_orden: 1, vin: 'TESTVIN0000X00231', marca: 'JETOUR', modelo: 'X50', color: 'Blanco', destino: 'Sede Norte', etapa: 'en_camino', salida_registrada_en: '2026-10-15T12:40:00Z', entregado_en: null, entrega_estimada: false, seguimiento: 'sin_seguimiento' },
  { id_orden: 2, vin: 'TESTVIN0000X00487', marca: 'VW PASAJEROS', modelo: 'Nivus', color: 'Gris', destino: 'Sede Sur', etapa: 'en_camino', salida_registrada_en: '2026-10-15T11:50:00Z', entregado_en: null, entrega_estimada: false, seguimiento: 'sin_seguimiento' },
  { id_orden: 3, vin: 'TESTVIN0000X00602', marca: 'AUDI', modelo: 'Q3', color: 'Rojo', destino: 'Sede Norte', etapa: 'en_camino', salida_registrada_en: '2026-10-15T13:12:00Z', entregado_en: null, entrega_estimada: false, seguimiento: 'en_vivo' },
  { id_orden: 4, vin: 'TESTVIN0000X00519', marca: 'KYC', modelo: 'Kaiyi X3', color: 'Negro', destino: 'Sede Norte', etapa: 'en_planta', salida_registrada_en: null, entregado_en: null, entrega_estimada: false, seguimiento: null },
  { id_orden: 5, vin: 'TESTVIN0000X00655', marca: 'SEAT', modelo: 'Ibiza', color: 'Plata', destino: 'Sede Sur', etapa: 'entregado', salida_registrada_en: '2026-10-15T13:30:00Z', entregado_en: '2026-10-15T16:20:00Z', entrega_estimada: false, seguimiento: 'sin_seguimiento' },
  { id_orden: 6, vin: 'TESTVIN0000X00097', marca: 'CUPRA', modelo: 'Formentor', color: 'Blanco', destino: 'Sede Norte', etapa: 'entregado', salida_registrada_en: '2026-10-15T16:05:00Z', entregado_en: '2026-10-15T20:00:00Z', entrega_estimada: true, seguimiento: 'en_vivo' },
  { id_orden: 7, vin: 'TESTVIN0000X00064', marca: 'JETOUR', modelo: 'T1', color: 'Azul', destino: 'Sede Sur', etapa: 'anulado', salida_registrada_en: null, entregado_en: null, entrega_estimada: false, seguimiento: null },
  // De destinos que NO se muestran (PLANETA y SATELITAL): no deben verse en ningún sitio, aunque el servidor los mande y sean de hoy.
  { id_orden: 9, vin: 'TESTVIN0000X00801', marca: 'JETOUR', modelo: 'X70', color: 'Negro', destino: 'PLANETA', etapa: 'en_camino', salida_registrada_en: '2026-10-15T12:10:00Z', entregado_en: null, entrega_estimada: false, seguimiento: null },
  { id_orden: 10, vin: 'TESTVIN0000X00802', marca: 'AUDI', modelo: 'Q5', color: 'Gris', destino: 'Satelital', etapa: 'entregado', salida_registrada_en: '2026-10-15T12:20:00Z', entregado_en: '2026-10-15T15:00:00Z', entrega_estimada: false, seguimiento: null },
  // De ayer: no se ve con «Hoy», solo al elegir «Ayer» (el servidor falso ignora el rango, como un servidor que aún no lo conoce).
  { id_orden: 8, vin: 'TESTVIN0000X00700', marca: 'AUDI', modelo: 'A3', color: 'Gris', destino: 'Sede Sur', etapa: 'entregado', salida_registrada_en: '2026-10-14T13:00:00Z', entregado_en: '2026-10-14T16:00:00Z', entrega_estimada: false, seguimiento: null },
]

/** El «servidor» de la prueba: responde sesión y seguimiento, y anota todo lo que se le pide. */
async function conServidorFalso(page: Page, traslados: readonly unknown[] = TRASLADOS, opciones: { demoraMs?: number } = {}) {
  // Un error de JavaScript en la página (que ninguna prueba de jsdom vería) rompe la prueba, con su mensaje.
  const errores: string[] = []
  page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
  page.on('console', (mensaje) => {
    if (mensaje.type() === 'error') errores.push(`console: ${mensaje.text()}`)
  })
  await page.clock.setFixedTime(AHORA)
  const peticiones: string[] = []
  const autorizaciones: Array<string | undefined> = []
  const consultas: string[][] = []
  /** El rango (`desde`, `hasta`) de cada pedido de la lista, en orden; `null` si el pedido no trajo ese parámetro. */
  const rangos: Array<{ desde: string | null; hasta: string | null }> = []
  let hayCookie = false
  const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
  const sesion = { success: true, message: 'ok', nombre_completo: 'COORDINADOR PRUEBA', role: 'coordinador', area: null, allowed_apps: [], token: TOKEN }

  // Solo lo que EMPIEZA por /api/ o /mobile/: los módulos de código también tienen carpetas `api/` (src/features/*/api/).
  await page.route((url) => /^\/(api|mobile)\//.test(url.pathname), async (route) => {
    const peticion = route.request()
    const ruta = new URL(peticion.url()).pathname
    peticiones.push(`${peticion.method()} ${ruta}`)
    if (ruta === '/api/login') {
      hayCookie = true
      return route.fulfill(json({ ...sesion, username: 'coord.prueba' }))
    }
    if (ruta === '/api/refresh') return hayCookie ? route.fulfill(json(sesion)) : route.fulfill(json({ detail: 'Sesion expirada o invalida' }, 401))
    if (ruta === '/api/logout') {
      hayCookie = false
      return route.fulfill(json({ success: true, message: 'Sesion cerrada' }))
    }
    if (ruta === '/api/seguimiento/traslados') {
      const parametros = new URL(peticion.url()).searchParams
      rangos.push({ desde: parametros.get('desde'), hasta: parametros.get('hasta') })
      // Un servidor lento: la lista tarda en llegar (para ver el esqueleto de carga).
      if (opciones.demoraMs) await new Promise((resolver) => setTimeout(resolver, opciones.demoraMs))
      autorizaciones.push(await peticion.headerValue('authorization').then((v) => v ?? undefined))
      return route.fulfill(json({ actualizado_hace_segundos: 5, traslados }))
    }
    if (ruta === '/api/seguimiento/consulta-vines' && peticion.method() === 'POST') {
      autorizaciones.push(await peticion.headerValue('authorization').then((v) => v ?? undefined))
      const { vines } = peticion.postDataJSON() as { vines: string[] }
      consultas.push(vines)
      // Como el servidor: solo cuenta lo que está en camino o entregado; lo demás es «pendiente».
      const resultados = vines.map((vin) => {
        const traslado = (traslados as Array<{ vin: string; etapa: string }>).find((t) => t.vin === vin && (t.etapa === 'en_camino' || t.etapa === 'entregado'))
        return traslado ? { vin, informacion: 'disponible', traslado } : { vin, informacion: 'pendiente', traslado: null }
      })
      return route.fulfill(json({ resultados }))
    }
    // Nada más debería pedirse: un coordinador no usa `/mobile/traslado`.
    return route.fulfill(json({ detail: 'no esperada en esta prueba' }, 500))
  })
  return { peticiones, autorizaciones, errores, consultas, rangos }
}

async function entrar(page: Page, servidor: { errores: string[] }) {
  await page.goto('/')
  await page.getByLabel('Usuario').waitFor({ timeout: 8000 }).catch(async () => {
    throw new Error(`No apareció el login. Errores: ${servidor.errores.join(' | ')} Texto: «${(await page.locator('body').innerText()).slice(0, 200)}»`)
  })
  await page.getByLabel('Usuario').fill('coord.prueba')
  await page.getByLabel('Contraseña').fill('cualquiera')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mis vehículos' })).toBeVisible()
}

async function capturar(page: Page, nombre: string) {
  const carpeta = process.env.SEGUIMIENTO_CAPTURAS
  if (!carpeta) return
  mkdirSync(carpeta, { recursive: true })
  await page.screenshot({ path: join(carpeta, `${nombre}.png`), fullPage: true })
}

/** Nada de GPS en pantalla, aunque el servidor mande el campo `seguimiento` (los datos de la prueba lo traen). */
const SIN_GPS = /gps|satelital|ubicaci[oó]n|en vivo|dispositivo|se define al salir/i

// Como texto: el tsconfig de e2e no incluye los tipos del DOM.
const sinDesborde = (page: Page) => page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')

test('escritorio: el coordinador entra por su rol, ve la tabla a todo lo ancho y el detalle se abre aparte', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const servidor = await conServidorFalso(page)

  await entrar(page, servidor)
  const tabla = page.getByRole('region', { name: 'Tabla de vehículos' })
  await expect(tabla).toBeVisible()
  await expect(page.getByRole('list', { name: 'Lista de vehículos' })).toBeHidden() // la lista del teléfono no se ve en escritorio
  await expect(tabla.getByRole('button', { name: /Ver detalle/ })).toHaveCount(5) // «Hoy»: 3 en camino y 2 entregados hoy; no se ven la orden en planta, la anulada ni la entregada ayer
  await expect(page.getByText('X00064')).toHaveCount(0)
  await expect(page.getByText('X00519')).toHaveCount(0)
  await expect(page.getByText('X00700')).toHaveCount(0)
  await expect(page.getByText('X00801')).toHaveCount(0) // destino PLANETA
  await expect(page.getByText('X00802')).toHaveCount(0) // destino Satelital
  await expect(page.getByRole('dialog')).toHaveCount(0) // el detalle no está abierto hasta pedirlo
  await expect(page.getByRole('group', { name: 'Filtrar por etapa' }).getByRole('button')).toHaveText(['Todos (5)', 'En camino (3)', 'Entregados (2)'])
  await expect(page.getByText('Consulta el avance de los traslados.')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(SIN_GPS)
  await expect(page.locator('body')).not.toContainText(/planeta|satelital/i) // ni en la lista ni en el selector de destino
  await expect(tabla.getByRole('columnheader')).toHaveText(['Vehículo', 'Destino', 'Etapa'])
  await expect(page.getByText(/^Última actualización: \d\d:\d\d$/)).toBeVisible()
  await capturar(page, 'escritorio-lista')

  // «Ver detalle» abre un panel a la derecha, a la altura de la ventana; Escape lo cierra.
  await tabla.getByRole('button', { name: 'Ver detalle de TESTVIN0000X00231' }).click()
  const panel = page.getByRole('dialog', { name: 'Detalle del traslado' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('VIN TESTVIN0000X00231')
  await expect(panel).toContainText('15 oct, 07:40')
  await expect(panel).not.toContainText(SIN_GPS)
  const caja = await panel.boundingBox()
  expect(caja!.y).toBe(0)
  expect(caja!.x + caja!.width).toBeCloseTo(1280, 0) // pegado a la derecha
  expect(caja!.x).toBeGreaterThan(640) // sin cubrir la mitad izquierda
  await capturar(page, 'escritorio-sin-gps')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(tabla.getByRole('button', { name: 'Ver detalle de TESTVIN0000X00231' })).toBeFocused() // el foco vuelve a quien lo abrió

  await tabla.getByRole('button', { name: 'Ver detalle de TESTVIN0000X00097' }).click()
  await expect(panel).toContainText('Hitos del traslado')
  await expect(panel).not.toContainText(SIN_GPS)
  await capturar(page, 'escritorio-entregado-estimado')
  await panel.getByRole('button', { name: 'Cerrar' }).click()
  await expect(panel).toHaveCount(0)

  // Pestañas y buscador.
  await page.getByRole('group', { name: 'Filtrar por etapa' }).getByRole('button', { name: /En camino/ }).click()
  await expect(tabla.getByRole('button', { name: /Ver detalle/ })).toHaveCount(3)
  await page.getByRole('searchbox', { name: 'Buscar vehículo' }).fill('q3')
  await expect(tabla.getByRole('button', { name: /Ver detalle/ })).toHaveCount(1)

  expect(await sinDesborde(page)).toBe(true)

  // El token viaja en cada petición y no se pidió nada de Traslado.
  expect(servidor.autorizaciones.length).toBeGreaterThan(0)
  expect(servidor.autorizaciones.every((a) => a === `Bearer ${TOKEN}`)).toBe(true)
  expect(servidor.peticiones.filter((p) => p.includes('/mobile/'))).toEqual([])

  // Salir vuelve al login.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByLabel('Usuario')).toBeVisible()
})

test('escritorio: con muchos vehículos, el detalle se abre a la vista sin importar cuánto se haya bajado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // 60 vehículos: la tabla es mucho más alta que la pantalla, que es donde el detalle quedaba «hasta abajo».
  const muchos = Array.from({ length: 60 }, (_, i) => ({
    ...TRASLADOS[0],
    id_orden: 100 + i,
    vin: `TESTVIN0000X${String(i).padStart(5, '0')}`,
    salida_registrada_en: `2026-10-15T${String(8 + (i % 10)).padStart(2, '0')}:00:00Z`,
  }))
  const servidor = await conServidorFalso(page, muchos)
  await entrar(page, servidor)

  const panel = page.getByRole('dialog', { name: 'Detalle del traslado' })
  const botones = page.getByRole('region', { name: 'Tabla de vehículos' }).getByRole('button', { name: /Ver detalle/ })
  /** El panel ocupa toda la altura de la ventana: se ve entero, sin desplazarse. */
  const panelALaVista = async () => {
    const caja = await panel.boundingBox()
    expect(caja).not.toBeNull()
    expect(caja!.y).toBe(0)
    expect(caja!.height).toBeCloseTo(900, 0)
  }

  // 1) Un vehículo de arriba. Al abrir el detalle la página de atrás no se corre. (Playwright corre sin barras de desplazamiento visibles, así que esto no
  // detecta el salto de la barra; eso lo comprueba la prueba unitaria de `PanelDetalle`. Aquí se vigila que nada más se mueva.)
  const titulo = page.getByRole('heading', { level: 1, name: 'Mis vehículos' })
  const filaAntes = await botones.nth(2).boundingBox()
  const tituloAntes = await titulo.boundingBox()
  await botones.nth(2).click()
  await panelALaVista()
  expect(await titulo.boundingBox()).toEqual(tituloAntes)
  expect(await botones.nth(2).boundingBox()).toEqual(filaAntes)
  await page.keyboard.press('Escape')
  expect(await titulo.boundingBox()).toEqual(tituloAntes)

  // 2) El de más abajo, tras bajar por la lista; mientras está abierto, la página de atrás no se mueve.
  const ultimo = botones.last()
  const nombre = (await ultimo.getAttribute('aria-label'))!
  await ultimo.scrollIntoViewIfNeeded()
  const bajado = Number(await page.evaluate('window.scrollY'))
  expect(bajado).toBeGreaterThan(1000) // de verdad se bajó por la lista
  await ultimo.click()
  await expect(panel).toContainText(nombre.replace('Ver detalle de ', 'VIN ')) // el VIN completo
  await panelALaVista()
  await page.mouse.wheel(0, 600)
  expect(Number(await page.evaluate('window.scrollY'))).toBe(bajado)
  await capturar(page, 'escritorio-muchos')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  expect(Number(await page.evaluate('window.scrollY'))).toBe(bajado) // y al cerrar, sigue donde estaba
  // El 401 del primer refresh (aún sin sesión) llega como error de consola y es lo esperado: solo cuentan los errores de la página.
  expect(servidor.errores.filter((e) => e.startsWith('pageerror'))).toEqual([])
})

test('teléfono: lista continua, detalle a pantalla completa y sin desborde horizontal a 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const servidor = await conServidorFalso(page)

  await entrar(page, servidor)
  const lista = page.getByRole('list', { name: 'Lista de vehículos' })
  await expect(lista).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tabla de vehículos' })).toBeHidden()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await sinDesborde(page)).toBe(true)
  await capturar(page, 'telefono-lista')

  await lista.getByRole('button', { name: 'Ver detalle de TESTVIN0000X00231' }).click()
  const panel = page.getByRole('dialog', { name: 'Detalle del traslado' })
  await expect(panel).toBeVisible()
  await expect(panel).not.toContainText(SIN_GPS)
  await page.keyboard.press('Tab') // el foco se queda en «Cerrar»: su contorno se ve completo, dentro del panel
  await expect(panel.getByRole('button', { name: 'Cerrar' })).toBeFocused()
  const cerrar = await panel.getByRole('button', { name: 'Cerrar' }).boundingBox()
  expect(cerrar!.y).toBeGreaterThanOrEqual(2)
  expect(cerrar!.x + cerrar!.width).toBeLessThanOrEqual(360)
  const caja = await panel.boundingBox()
  expect([caja!.x, caja!.y, caja!.width, caja!.height]).toEqual([0, 0, 360, 780]) // pantalla completa
  expect(await sinDesborde(page)).toBe(true)
  await capturar(page, 'telefono-detalle')

  await panel.getByRole('button', { name: 'Cerrar' }).click()
  await expect(panel).toHaveCount(0)
  await expect(lista).toBeVisible()
})

test('consulta masiva: se pegan los VIN y cada uno sale con información o como pendiente de información', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  // VIN de verdad válidos (17 caracteres, sin I, O ni Q): los de las otras pruebas llevan una «I» y la consulta los rechazaría.
  const EN_CAMINO = 'LVTDD24B6VDX00231'
  const ENTREGADO = 'KMHJB81B1PU123456'
  const EN_PLANTA = 'JTDBR32E102345678'
  const SIN_ORDEN = 'LVTDD24B6VDX99999'
  const DESTINO_OCULTO = 'LVTDD24B6VDX00801' // está en camino, pero su destino (Satelital) no se muestra: sale como pendiente
  const servidor = await conServidorFalso(page, [
    { ...TRASLADOS[0], vin: EN_CAMINO },
    { ...TRASLADOS[4], vin: ENTREGADO },
    { ...TRASLADOS[3], vin: EN_PLANTA },
    { ...TRASLADOS[0], vin: DESTINO_OCULTO, destino: 'Satelital' },
  ])
  await entrar(page, servidor)

  await page.getByRole('button', { name: 'Consulta masiva de VIN' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Consulta masiva de VIN' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Consultar' })).toBeDisabled()

  // Lo pegado se lee antes de consultar: repetidos y no-VIN se avisan.
  await page.getByRole('textbox', { name: 'VIN a consultar' }).fill([EN_CAMINO, ENTREGADO.toLowerCase(), EN_PLANTA, SIN_ORDEN, DESTINO_OCULTO, EN_CAMINO, 'ABC123'].join('\n'))
  await expect(page.getByText('5 VIN para consultar (1 repetido se consulta una sola vez)')).toBeVisible()
  await expect(page.getByText(/no tiene forma de VIN y no se consultará: ABC123/)).toBeVisible()
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText('5 VIN consultados: 2 con información y 3 pendientes de información.')).toBeVisible()
  expect(servidor.consultas).toEqual([[EN_CAMINO, ENTREGADO, EN_PLANTA, SIN_ORDEN, DESTINO_OCULTO]]) // mayúsculas, sin repetidos, sin lo inválido, en orden
  const tabla = page.getByRole('region', { name: 'Tabla de vehículos' })
  await expect(tabla.getByRole('button', { name: /Ver detalle/ })).toHaveCount(2)
  const pendientes = page.getByRole('list', { name: 'VIN pendientes de información' })
  await expect(pendientes.getByRole('listitem')).toHaveCount(3)
  await expect(pendientes).toContainText(`VIN ${EN_PLANTA}`)
  await expect(pendientes).toContainText(`VIN ${DESTINO_OCULTO}`) // no se enseña su vehículo, pero no se pierde el VIN
  await expect(tabla).not.toContainText(DESTINO_OCULTO)
  await expect(pendientes).toContainText('Pendiente de información')
  await expect(pendientes).toContainText('Aún no está en el plan de despacho.')
  await capturar(page, 'consulta-escritorio')

  await tabla.getByRole('button', { name: `Ver detalle de ${EN_CAMINO}` }).click()
  await expect(page.getByRole('dialog', { name: 'Detalle del traslado' })).toContainText(`VIN ${EN_CAMINO}`)
  await page.keyboard.press('Escape')

  // En el teléfono: sin desborde horizontal.
  await page.setViewportSize({ width: 360, height: 780 })
  await expect(page.getByRole('list', { name: 'Lista de vehículos' })).toBeVisible()
  expect(await sinDesborde(page)).toBe(true)
  await capturar(page, 'consulta-telefono')

  await page.getByRole('button', { name: 'Volver a mis vehículos' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mis vehículos' })).toBeVisible()
  expect(servidor.autorizaciones.every((a) => a === `Bearer ${TOKEN}`)).toBe(true)
})

test('recargar con la sesión viva vuelve a la vista de seguimiento sin pedir credenciales', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const servidor = await conServidorFalso(page)
  await entrar(page, servidor)

  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Mis vehículos' })).toBeVisible()
  await expect(page.getByLabel('Usuario')).toHaveCount(0)
})

/** El día de Lima de hoy (`AAAA-MM-DD`), como lo calcula la web: UTC-5, sin horario de verano. */
const hoyEnLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)
const restarDias = (dia: string, dias: number) => new Date(Date.parse(`${dia}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10)

test('filtro por fecha: abre en «Hoy», aplica «Ayer» y un rango propio, y el panel cabe en 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const servidor = await conServidorFalso(page)
  await entrar(page, servidor)
  const botonFecha = page.getByRole('button', { name: /^Fecha:/ })
  const lista = page.getByRole('list', { name: 'Lista de vehículos' })
  await expect(botonFecha).toHaveAccessibleName('Fecha: Hoy')
  // «Hoy»: solo lo de hoy, aunque el servidor falso mande también lo de otros días y lo que no tiene fecha.
  await expect(lista.getByRole('button', { name: /Ver detalle/ })).toHaveCount(5)
  await expect(lista.getByRole('button', { name: 'Ver detalle de TESTVIN0000X00700' })).toHaveCount(0)

  // Al abrir se pidió UN solo día: el de hoy en Lima (el mismo en `desde` y en `hasta`, y nunca futuro). En desarrollo React monta
  // dos veces cada componente y la pantalla pide al montarse, así que puede haber más de un pedido de apertura: todos iguales.
  const alAbrir = servidor.rangos.length
  expect(alAbrir).toBeGreaterThanOrEqual(1)
  const nuevos = () => servidor.rangos.slice(alAbrir)
  const hoy = servidor.rangos[0]!.desde!
  expect(hoy).toBe('2026-10-15') // el reloj de la página está fijo (AHORA)
  expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  for (const rango of servidor.rangos) expect(rango).toEqual({ desde: hoy, hasta: hoy })
  expect(hoy <= hoyEnLima()).toBe(true)

  // El panel abre dentro de la pantalla del teléfono y no mueve la página.
  await botonFecha.click()
  const panel = page.getByRole('dialog', { name: 'Filtrar por fecha' })
  await expect(panel).toBeVisible()
  const caja = await panel.boundingBox()
  expect(caja!.x).toBeGreaterThanOrEqual(0)
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(360)
  expect(await sinDesborde(page)).toBe(true)
  await capturar(page, 'fecha-panel-360')

  // Elegir no pide nada; «Aplicar» pide ayer.
  await panel.getByRole('radio', { name: 'Ayer' }).check()
  expect(nuevos()).toEqual([])
  await panel.getByRole('button', { name: 'Aplicar' }).click()
  await expect(panel).toHaveCount(0)
  await expect(botonFecha).toHaveAccessibleName('Fecha: Ayer')
  await expect.poll(() => nuevos().length).toBe(1)
  expect(nuevos()[0]).toEqual({ desde: restarDias(hoy, 1), hasta: restarDias(hoy, 1) })
  // «Ayer»: solo el entregado de ayer.
  await expect(lista.getByRole('button', { name: /Ver detalle/ })).toHaveCount(1)
  await expect(lista.getByRole('button', { name: 'Ver detalle de TESTVIN0000X00700' })).toBeVisible()

  // Un rango propio con las fechas escritas.
  await botonFecha.click()
  await panel.getByRole('radio', { name: 'Rango personalizado' }).check()
  await panel.getByLabel('Desde').fill(restarDias(hoy, 3))
  await panel.getByLabel('Hasta').fill(restarDias(hoy, 1))
  expect(await sinDesborde(page)).toBe(true)
  await capturar(page, 'fecha-rango-360')
  await panel.getByRole('button', { name: 'Aplicar' }).click()
  await expect.poll(() => nuevos().length).toBe(2)
  expect(nuevos()[1]).toEqual({ desde: restarDias(hoy, 3), hasta: restarDias(hoy, 1) })

  // Un rango que el servidor rechazaría no se pide: se explica y el panel sigue abierto.
  await botonFecha.click()
  await panel.getByRole('radio', { name: 'Rango personalizado' }).check()
  await panel.getByLabel('Desde').fill(restarDias(hoy, 1))
  await panel.getByLabel('Hasta').fill(restarDias(hoy, 3))
  await panel.getByRole('button', { name: 'Aplicar' }).click()
  await expect(panel.getByRole('alert')).toContainText('La fecha de inicio no puede ser posterior a la de fin.')
  expect(nuevos()).toHaveLength(2)

  // Cancelar no cambia nada.
  await panel.getByRole('button', { name: 'Cancelar' }).click()
  await expect(panel).toHaveCount(0)
  expect(nuevos()).toHaveLength(2)

  // Sin errores de JavaScript en la página (los 4xx que anota la consola, como el 401 del `refresh` antes del login, no cuentan).
  expect(servidor.errores.filter((e) => e.startsWith('pageerror'))).toEqual([])
})


for (const ancho of [1440, 1024, 768]) {
  test(`filtro por fecha en pantalla de ${ancho} px: el panel abre dentro de la pantalla, sin mover la página, y las fechas se pueden elegir`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 800 })
    const servidor = await conServidorFalso(page)
    await entrar(page, servidor)

    await page.getByRole('button', { name: /^Fecha:/ }).click()
    const panel = page.getByRole('dialog', { name: 'Filtrar por fecha' })
    await panel.getByRole('radio', { name: 'Rango personalizado' }).check()

    // El panel cabe entero en la ventana (no se sale por la derecha) y la página no gana desplazamiento horizontal.
    const caja = await panel.boundingBox()
    expect(caja!.x).toBeGreaterThanOrEqual(0)
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho)
    expect(await sinDesborde(page)).toBe(true)

    // Elegir la fecha (tocar el campo y escribir) no mueve el panel ni la página hacia la derecha.
    const antes = await panel.boundingBox()
    await panel.getByLabel('Desde').click()
    await panel.getByLabel('Desde').fill('2026-10-10')
    await panel.getByLabel('Hasta').click()
    expect(await panel.boundingBox()).toEqual(antes)
    expect(Number(await page.evaluate('window.scrollX'))).toBe(0)
    expect(await sinDesborde(page)).toBe(true)
    await capturar(page, `fecha-panel-${ancho}`)
  })
}

for (const [nombre, ancho] of [['escritorio', 1280], ['teléfono', 360]] as const) {
  test(`esqueleto de carga (${nombre}): se ve mientras tarda el servidor, ocupa el lugar de la lista y se va sin mover nada`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 })
    const servidor = await conServidorFalso(page, TRASLADOS, { demoraMs: 2500 })
    await entrar(page, servidor)

    // Mientras llega: el esqueleto con su aviso para el lector de pantalla, el filtro por fecha ya a la vista, y ni tabla ni pestañas.
    const aviso = page.getByRole('status').filter({ hasText: 'Cargando los traslados…' })
    const esqueleto = aviso.locator('.animate-pulse')
    await expect(aviso).toHaveCount(1)
    await expect(esqueleto).toBeVisible()
    await expect(page.getByRole('button', { name: /^Fecha:/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tabla de vehículos' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Filtrar por etapa' })).toHaveCount(0)
    expect(await sinDesborde(page)).toBe(true)
    await capturar(page, `esqueleto-${nombre}`)

    const buscador = page.getByRole('searchbox', { name: 'Buscar vehículo' })
    const yBuscador = (await buscador.boundingBox())!.y
    const yPestanasDibujadas = (await esqueleto.locator('> div').first().boundingBox())!.y

    // Llega la lista: el esqueleto se va y lo de arriba no se movió (ni el buscador ni la barra de pestañas).
    const pestanas = page.getByRole('group', { name: 'Filtrar por etapa' })
    await expect(pestanas).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.animate-pulse')).toHaveCount(0)
    await expect(aviso).toHaveCount(0)
    expect((await buscador.boundingBox())!.y).toBe(yBuscador)
    expect(Math.abs((await pestanas.boundingBox())!.y - yPestanasDibujadas)).toBeLessThanOrEqual(1)
    expect(await sinDesborde(page)).toBe(true)
    expect(servidor.errores.filter((e) => e.startsWith('pageerror'))).toEqual([])
  })
}

test('esqueleto de carga: late, pero se queda quieto si la persona pidió menos movimiento', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const nombreAnimacion = () => page.evaluate<string>("getComputedStyle(document.querySelector('.animate-pulse')).animationName")

  const normal = await conServidorFalso(page, TRASLADOS, { demoraMs: 2500 })
  await entrar(page, normal)
  await expect(page.locator('.animate-pulse').first()).toBeVisible()
  expect(await nombreAnimacion()).toBe('pulse')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await nombreAnimacion()).toBe('none')
})

