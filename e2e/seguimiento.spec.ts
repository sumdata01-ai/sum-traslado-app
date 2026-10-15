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

const TRASLADOS = [
  { id_orden: 1, vin: 'TESTVIN0000X00231', marca: 'JETOUR', modelo: 'X50', color: 'Blanco', destino: 'Sede Norte', etapa: 'en_camino', salida_registrada_en: '2026-10-15T12:40:00Z', entregado_en: null, entrega_estimada: false, seguimiento: 'sin_seguimiento' },
  { id_orden: 2, vin: 'TESTVIN0000X00487', marca: 'VW PASAJEROS', modelo: 'Nivus', color: 'Gris', destino: 'Sede Sur', etapa: 'en_camino', salida_registrada_en: '2026-10-15T11:50:00Z', entregado_en: null, entrega_estimada: false, seguimiento: 'sin_seguimiento' },
  { id_orden: 3, vin: 'TESTVIN0000X00602', marca: 'AUDI', modelo: 'Q3', color: 'Rojo', destino: 'Sede Norte', etapa: 'en_camino', salida_registrada_en: '2026-10-15T13:12:00Z', entregado_en: null, entrega_estimada: false, seguimiento: 'en_vivo' },
  { id_orden: 4, vin: 'TESTVIN0000X00519', marca: 'KYC', modelo: 'Kaiyi X3', color: 'Negro', destino: 'Sede Norte', etapa: 'en_planta', salida_registrada_en: null, entregado_en: null, entrega_estimada: false, seguimiento: null },
  { id_orden: 5, vin: 'TESTVIN0000X00655', marca: 'SEAT', modelo: 'Ibiza', color: 'Plata', destino: 'Sede Sur', etapa: 'entregado', salida_registrada_en: '2026-10-14T13:30:00Z', entregado_en: '2026-10-14T16:20:00Z', entrega_estimada: false, seguimiento: 'sin_seguimiento' },
  { id_orden: 6, vin: 'TESTVIN0000X00097', marca: 'CUPRA', modelo: 'Formentor', color: 'Blanco', destino: 'Sede Norte', etapa: 'entregado', salida_registrada_en: '2026-10-13T16:05:00Z', entregado_en: '2026-10-13T20:00:00Z', entrega_estimada: true, seguimiento: 'en_vivo' },
  { id_orden: 7, vin: 'TESTVIN0000X00064', marca: 'JETOUR', modelo: 'T1', color: 'Azul', destino: 'Sede Sur', etapa: 'anulado', salida_registrada_en: null, entregado_en: null, entrega_estimada: false, seguimiento: null },
]

/** El «servidor» de la prueba: responde sesión y seguimiento, y anota todo lo que se le pide. */
async function conServidorFalso(page: Page, traslados: readonly unknown[] = TRASLADOS) {
  // Un error de JavaScript en la página (que ninguna prueba de jsdom vería) rompe la prueba, con su mensaje.
  const errores: string[] = []
  page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
  page.on('console', (mensaje) => {
    if (mensaje.type() === 'error') errores.push(`console: ${mensaje.text()}`)
  })
  const peticiones: string[] = []
  const autorizaciones: Array<string | undefined> = []
  const consultas: string[][] = []
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
  return { peticiones, autorizaciones, errores, consultas }
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
  await expect(tabla.getByRole('button', { name: /Ver detalle/ })).toHaveCount(6) // 6 vehículos: la orden anulada no se muestra
  await expect(page.getByText('X00064')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0) // el detalle no está abierto hasta pedirlo
  await expect(page.getByRole('group', { name: 'Filtrar por etapa' }).getByRole('button')).toHaveText(['Todos (6)', 'En camino (3)', 'Entregados (2)'])
  await expect(page.getByText('Consulta el avance de los traslados.')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(SIN_GPS)
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

  await tabla.getByRole('button', { name: 'Ver detalle de TESTVIN0000X00519' }).click()
  await expect(panel).toContainText('Hitos del traslado')
  await expect(panel).not.toContainText(SIN_GPS)
  await capturar(page, 'escritorio-en-planta')
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
  const servidor = await conServidorFalso(page, [
    { ...TRASLADOS[0], vin: EN_CAMINO },
    { ...TRASLADOS[4], vin: ENTREGADO },
    { ...TRASLADOS[3], vin: EN_PLANTA },
  ])
  await entrar(page, servidor)

  await page.getByRole('button', { name: 'Consulta masiva de VIN' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Consulta masiva de VIN' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Consultar' })).toBeDisabled()

  // Lo pegado se lee antes de consultar: repetidos y no-VIN se avisan.
  await page.getByRole('textbox', { name: 'VIN a consultar' }).fill([EN_CAMINO, ENTREGADO.toLowerCase(), EN_PLANTA, SIN_ORDEN, EN_CAMINO, 'ABC123'].join('\n'))
  await expect(page.getByText('4 VIN para consultar (1 repetido se consulta una sola vez)')).toBeVisible()
  await expect(page.getByText(/no tiene forma de VIN y no se consultará: ABC123/)).toBeVisible()
  await page.getByRole('button', { name: 'Consultar' }).click()

  await expect(page.getByText('4 VIN consultados: 2 con información y 2 pendientes de información.')).toBeVisible()
  expect(servidor.consultas).toEqual([[EN_CAMINO, ENTREGADO, EN_PLANTA, SIN_ORDEN]]) // mayúsculas, sin repetidos, sin lo inválido, en orden
  const tabla = page.getByRole('region', { name: 'Tabla de vehículos' })
  await expect(tabla.getByRole('button', { name: /Ver detalle/ })).toHaveCount(2)
  const pendientes = page.getByRole('list', { name: 'VIN pendientes de información' })
  await expect(pendientes.getByRole('listitem')).toHaveCount(2)
  await expect(pendientes).toContainText(`VIN ${EN_PLANTA}`)
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
