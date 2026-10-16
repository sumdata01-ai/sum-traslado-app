import { expect, test, type Page } from '@playwright/test'

/**
 * El tablero de llegadas por QR (`/dashboard`) en un navegador real. **No usa el backend**: `/api/*` y `/mobile/*` se responden
 * aquí mismo, así que no toca la base de datos (ADR 0008) y no necesita credenciales ni gasta el límite de logins.
 *
 * Los datos son inventados (conductores `op.demo01` a `op.demo03`).
 */
const base64Url = (objeto: unknown) => Buffer.from(JSON.stringify(objeto)).toString('base64url')
const token = (role: string) => `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ sub: 'sup.prueba', user_id: 7, role })}.firma`

const PATIO = { id_punto: 1, nombre: 'Patio de llegada', radio_m: 100, precision_max_m: 100 }
const PUERTA = { id_punto: 2, nombre: 'Puerta norte', radio_m: 80, precision_max_m: 100 }
const cond = (n: number) => ({ id_usuario: 100 + n, username: `op.demo0${n}`, nombre: `Conductor 0${n}` })

const llegada = (id: number, turno: number, punto: typeof PATIO, n: number, qr: string, recv: string, demora: number, pasos: number, dist: number, prec: number) => ({
  id_llegada: id,
  turno,
  punto,
  conductor: cond(n),
  step: Math.floor(Date.parse(`2026-10-15T${qr}-05:00`) / 30_000),
  hora_oficial: `2026-10-15T${qr}-05:00`,
  hora_recepcion: `2026-10-15T${recv}-05:00`,
  demora_s: demora,
  pasos,
  flag: Math.abs(pasos) > 2,
  flags: Math.abs(pasos) > 2 ? ['OUT_OF_WINDOW'] : [],
  latitud: -12.0501,
  longitud: -77.0499,
  distancia_m: dist,
  pct_radio: Math.round((dist / punto.radio_m) * 1000) / 10,
  precision_m: prec,
})

const LLEGADAS = [
  llegada(1, 1, PATIO, 1, '07:12:00', '07:12:09', 9, 0, 31.2, 8.4),
  llegada(2, 2, PATIO, 2, '07:46:30', '07:47:41', 71, 2, 44.3, 51.6),
  llegada(3, 8, PATIO, 1, '08:41:00', '08:43:20', 140, 4, 27.5, 15),
  llegada(4, 1, PUERTA, 3, '09:48:30', '09:51:40', 190, 6, 77.9, 20),
]

const INTENTOS = [
  { id_intento: 3, hora_recepcion: '2026-10-15T09:14:05-05:00', conductor: cond(3), punto: { id_punto: 1, nombre: 'Patio de llegada' }, motivo: 'fuera_de_tope', etiqueta: 'QR demasiado viejo', antiguedad_qr_s: 64_980, texto_inicio: 'SUM1|1|59734129|dE5a', repeticiones_conductor_dia: 2 },
  { id_intento: 2, hora_recepcion: '2026-10-15T09:13:20-05:00', conductor: cond(3), punto: { id_punto: 1, nombre: 'Patio de llegada' }, motivo: 'fuera_de_tope', etiqueta: 'QR demasiado viejo', antiguedad_qr_s: 64_920, texto_inicio: 'SUM1|1|59734129|dE5a', repeticiones_conductor_dia: 2 },
  { id_intento: 1, hora_recepcion: '2026-10-15T07:40:12-05:00', conductor: cond(2), punto: null, motivo: 'payload_ilegible', etiqueta: 'Texto ilegible', antiguedad_qr_s: null, texto_inicio: 'WAUZZZ8U1HA004123', repeticiones_conductor_dia: 0 },
]

const PUNTOS = [
  { id_punto: 1, nombre: 'Patio de llegada', activo: true, latitud: -12.05, longitud: -77.05, radio_m: 100, precision_max_m: 100, peor_caso_m: 200, llegadas_dia: 3, ultimo_escaneo: '2026-10-15T08:43:20-05:00' },
  { id_punto: 2, nombre: 'Puerta norte', activo: true, latitud: -12.0485, longitud: -77.0492, radio_m: 80, precision_max_m: 100, peor_caso_m: 180, llegadas_dia: 1, ultimo_escaneo: '2026-10-15T09:51:40-05:00' },
]

interface Perfil {
  role: string
  area: string
  apps: string[]
}

/** El «servidor» de la prueba: sesión, el tablero y (si hace falta) la home vacía. Anota todo lo que se le pide. */
async function conServidorFalso(page: Page, perfil: Perfil) {
  const errores: string[] = []
  page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
  page.on('console', (mensaje) => {
    // El navegador anota en la consola cada 4xx («Failed to load resource»), también el 401 del primer refresh sin sesión.
    if (mensaje.type() === 'error' && !mensaje.text().startsWith('Failed to load resource')) errores.push(`console: ${mensaje.text()}`)
  })
  const peticiones: string[] = []
  const consultas: Array<{ ruta: string; query: string; autorizacion: string | undefined }> = []
  let hayCookie = false
  const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
  const sesion = { success: true, message: 'ok', nombre_completo: 'SUPERVISOR PRUEBA', role: perfil.role, area: perfil.area, allowed_apps: perfil.apps, token: token(perfil.role) }

  // Solo lo que EMPIEZA por /api/ o /mobile/: los módulos de código también tienen carpetas `api/` (src/features/*/api/).
  await page.route((url) => /^\/(api|mobile)\//.test(url.pathname), async (route) => {
    const peticion = route.request()
    const url = new URL(peticion.url())
    peticiones.push(`${peticion.method()} ${url.pathname}`)
    if (url.pathname === '/api/login') {
      hayCookie = true
      return route.fulfill(json({ ...sesion, username: 'sup.prueba' }))
    }
    if (url.pathname === '/api/refresh') return hayCookie ? route.fulfill(json(sesion)) : route.fulfill(json({ detail: 'Sesion expirada o invalida' }, 401))
    if (url.pathname === '/api/logout') {
      hayCookie = false
      return route.fulfill(json({ success: true, message: 'Sesion cerrada' }))
    }
    if (url.pathname.startsWith('/api/llegada-qr/')) {
      consultas.push({ ruta: url.pathname, query: url.search, autorizacion: (await peticion.headerValue('authorization')) ?? undefined })
      const idPunto = url.searchParams.get('id_punto')
      // El día lo manda la página (hoy de Lima, el del reloj real de la prueba): el servidor falso responde con los mismos datos para cualquiera.
      const dia = url.searchParams.get('dia') ?? new Date().toISOString().slice(0, 10)
      const hay = true
      if (url.pathname.endsWith('/dia')) {
        const llegadas = hay ? LLEGADAS.filter((l) => idPunto === null || String(l.punto.id_punto) === idPunto) : []
        const conFlag = llegadas.filter((l) => l.flag).length
        return route.fulfill(
          json({
            dia,
            id_punto: idPunto === null ? null : Number(idPunto),
            resumen: {
              total: llegadas.length,
              por_punto: [PATIO, PUERTA].map((p) => ({ id_punto: p.id_punto, nombre: p.nombre, total: llegadas.filter((l) => l.punto.id_punto === p.id_punto).length })).filter((p) => p.total > 0),
              con_flag: conFlag,
              rechazados: hay && idPunto === null ? INTENTOS.length : 0,
              mediana_demora_s: llegadas.length ? 105.5 : 0,
            },
            senales: { con_flag: conFlag, qr_vencido_repetido: hay && idPunto === null ? [{ conductor: cond(3), veces: 2 }] : [] },
            llegadas,
            truncado: false,
          }),
        )
      }
      if (url.pathname.endsWith('/intentos')) return route.fulfill(json({ dia, id_punto: idPunto === null ? null : Number(idPunto), intentos: hay && idPunto === null ? INTENTOS : [], truncado: false }))
      if (url.pathname.endsWith('/puntos')) return route.fulfill(json({ dia, puntos: PUNTOS }))
    }
    // Nada más debería pedirse: este usuario no tiene Traslado.
    return route.fulfill(json({ detail: 'no esperada en esta prueba' }, 500))
  })
  return { peticiones, consultas, errores }
}

async function entrar(page: Page, servidor: { errores: string[] }, ruta = '/') {
  await page.goto(ruta)
  await page.getByLabel('Usuario').waitFor({ timeout: 8000 }).catch(async () => {
    throw new Error(`No apareció el login. Errores: ${servidor.errores.join(' | ')} Texto: «${(await page.locator('body').innerText()).slice(0, 200)}»`)
  })
  await page.getByLabel('Usuario').fill('sup.prueba')
  await page.getByLabel('Contraseña').fill('cualquiera')
  await page.getByRole('button', { name: 'Entrar' }).click()
}

const SUPERVISOR: Perfil = { role: 'supervisor', area: 'despacho', apps: [] }

test('el supervisor de despacho entra al tablero en /dashboard y ve las cifras', async ({ page }) => {
  const servidor = await conServidorFalso(page, SUPERVISOR)
  await entrar(page, servidor)

  await expect(page.getByRole('heading', { level: 1, name: 'Llegadas por QR' })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  const resumen = page.getByRole('region', { name: 'Resumen del día' })
  await expect(resumen.getByText('Patio de llegada: 3 · Puerta norte: 1')).toBeVisible()
  await expect(resumen.getByRole('button', { name: /Con flag/ })).toContainText('2')
  await expect(resumen.getByRole('button', { name: /Códigos rechazados/ })).toContainText('3')
  await expect(page.getByRole('list', { name: 'Llegadas' }).getByRole('listitem')).toHaveCount(4)
  await expect(page.getByText('OUT_OF_WINDOW · 4 pasos')).toBeVisible()
  await expect(page.getByText('1 min 11 s')).toBeVisible()

  // Solo lectura y solo del tablero: ningún POST fuera de la sesión (entrar y renovar), ninguna llamada de Traslado, y cada lectura con la sesión.
  expect(servidor.peticiones.filter((p) => p.startsWith('POST') && !/\/api\/(login|refresh)$/.test(p))).toEqual([])
  expect(servidor.peticiones.some((p) => p.includes('/mobile/'))).toBe(false)
  // Las tres lecturas del tablero y nada más. (En desarrollo React monta dos veces cada pantalla y las pide dos veces; en producción, una.)
  expect([...new Set(servidor.consultas.map((c) => c.ruta))].sort()).toEqual(['/api/llegada-qr/dia', '/api/llegada-qr/intentos', '/api/llegada-qr/puntos'])
  expect(servidor.consultas.every((c) => c.autorizacion?.startsWith('Bearer '))).toBe(true)
  expect(servidor.errores).toEqual([])
})

test('aunque su cuenta tenga `traslado`, el supervisor entra directo al tablero y no ve Traslado', async ({ page }) => {
  const servidor = await conServidorFalso(page, { role: 'supervisor', area: 'secado', apps: ['traslado', 'gps', 'rastreo'] })
  await entrar(page, servidor)

  await expect(page.getByRole('heading', { level: 1, name: 'Llegadas por QR' })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Traslado' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Marcar llegada|Tablero de llegadas|Volver a Traslado/ })).toHaveCount(0)

  // Ni siquiera abriendo la dirección de la raíz a mano llega a Traslado.
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Llegadas por QR' })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(servidor.peticiones.some((p) => p.includes('/mobile/traslado'))).toBe(false) // nunca pidió las órdenes
})

test('abrir /dashboard directo y recargar mantienen la sesión y la ruta', async ({ page }) => {
  const servidor = await conServidorFalso(page, SUPERVISOR)
  await entrar(page, servidor, '/dashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'Llegadas por QR' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Llegadas por QR' })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(servidor.errores).toEqual([])
})

test('elegir un punto vuelve a pedir con ese punto y cambia las cifras', async ({ page }) => {
  const servidor = await conServidorFalso(page, SUPERVISOR)
  await entrar(page, servidor)
  await expect(page.getByRole('region', { name: 'Resumen del día' })).toBeVisible()

  await page.getByLabel('Punto').selectOption({ label: 'Puerta norte' })

  await expect(page.getByRole('region', { name: 'Resumen del día' }).getByText('Puerta norte: 1')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Llegadas' }).getByRole('listitem')).toHaveCount(1)
  expect(servidor.consultas.some((c) => c.ruta === '/api/llegada-qr/dia' && c.query.includes('id_punto=2'))).toBe(true)
})

test('el detalle de una llegada: panel con esquema, Escape lo cierra y el foco vuelve a la fila', async ({ page }) => {
  const servidor = await conServidorFalso(page, SUPERVISOR)
  await entrar(page, servidor)
  const fila = page.getByRole('button', { name: /^Turno 8, Conductor 01/ })
  await fila.click()

  const dialogo = page.getByRole('dialog', { name: 'Detalle de la llegada' })
  await expect(dialogo).toBeVisible()
  await expect(dialogo).toContainText('Entró con flag')
  await expect(dialogo.getByRole('img', { name: /Esquema: el teléfono estaba a 27,5 m/ })).toBeVisible()
  await expect(dialogo).toContainText('-12,050100, -77,049900')

  await page.keyboard.press('Escape')
  await expect(dialogo).toHaveCount(0)
  await expect(fila).toBeFocused()
})

test('los rechazados y los puntos', async ({ page }) => {
  const servidor = await conServidorFalso(page, SUPERVISOR)
  await entrar(page, servidor)
  await page.getByRole('button', { name: /^Códigos rechazados \(/ }).click()
  const lista = page.getByRole('list', { name: 'Códigos rechazados' })
  await expect(lista.getByRole('listitem')).toHaveCount(3)
  await expect(lista.getByText('×2').first()).toBeVisible()
  await expect(lista.getByText('hace 18 h 2 min').first()).toBeVisible()
  await expect(lista.getByText('— (no existe)')).toBeVisible()

  await page.getByRole('button', { name: /^Puntos \(/ }).click()
  await expect(page.getByText('Peor caso aceptado: 200 m')).toBeVisible()
  await expect(page.getByText('guardado · no se muestra nunca').first()).toBeVisible()
})

test('a 360 px no hay desborde horizontal y la lista son tarjetas', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  const servidor = await conServidorFalso(page, SUPERVISOR)
  await entrar(page, servidor)
  await expect(page.getByRole('list', { name: 'Llegadas' })).toBeVisible()

  const medidas = () => page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }))
  let { ancho, visible } = await medidas()
  expect(ancho).toBeLessThanOrEqual(visible)
  // En el teléfono cada dato lleva su rótulo (la tabla es una tarjeta).
  await expect(page.getByRole('list', { name: 'Llegadas' }).getByText('Hora del QR').first()).toBeVisible()

  await page.getByRole('button', { name: /^Turno 8, Conductor 01/ }).click()
  await expect(page.getByRole('dialog', { name: 'Detalle de la llegada' })).toBeVisible()
  ;({ ancho, visible } = await medidas())
  expect(ancho).toBeLessThanOrEqual(visible)
  await page.getByRole('dialog', { name: 'Detalle de la llegada' }).getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('button', { name: /^Códigos rechazados \(/ }).click()
  await expect(page.getByRole('list', { name: 'Códigos rechazados' })).toBeVisible()
  ;({ ancho, visible } = await medidas())
  expect(ancho).toBeLessThanOrEqual(visible)
})

test('un operario que abre /dashboard no ve el tablero: vuelve a la raíz', async ({ page }) => {
  const servidor = await conServidorFalso(page, { role: 'operario', area: 'despacho', apps: ['traslado'] })
  await entrar(page, servidor, '/dashboard')
  // Ve su home de Traslado (que pide sus órdenes al servidor de mentira: puede fallar con el 500 de «no esperada», no importa).
  await expect(page.getByRole('heading', { level: 1, name: 'Traslado' })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Llegadas por QR' })).toHaveCount(0)
  expect(servidor.consultas).toEqual([]) // ni una lectura del tablero
})
