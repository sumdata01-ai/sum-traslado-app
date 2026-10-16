/// <reference lib="dom" />
import { BarcodeFormat, QRCodeWriter } from '@zxing/library'
import { expect, test, type Page } from '@playwright/test'

/**
 * «Marcar llegada» en un navegador real. **No usa el backend**: `/api/*` y `/mobile/*` se responden aquí mismo, así que no toca
 * la base de datos ni registra llegadas reales (ADR 0008) y no gasta el límite de logins.
 *
 * Lo que sí es real: el lector de QR (zxing, leyendo un QR dibujado en la «cámara»), la geolocalización del navegador
 * (la simula Playwright) y la sesión. Lo simulado de la cámara es solo `getUserMedia`, que devuelve un lienzo con el QR.
 */
const base64Url = (objeto: unknown) => Buffer.from(JSON.stringify(objeto)).toString('base64url')
const TOKEN = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ sub: 'operario.prueba', user_id: 7, role: 'operario' })}.firma`

/** Un QR de verdad (el del vector de prueba del backend), con el texto en minúsculas y mayúsculas mezcladas. */
const TEXTO_QR = 'SUM1|7|59698271|S4eYGtymJsriCiZYxmdpHA'
const UBICACION = { latitude: -11.902172, longitude: -77.122394, accuracy: 12 }

test.use({ geolocation: UBICACION, permissions: ['geolocation'] })

/** Los módulos del QR como filas de booleanos, con su margen blanco, para dibujarlos en el navegador. */
function matrizQr(texto: string): boolean[][] {
  const matriz = new QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, 0, 0, new Map())
  return Array.from({ length: matriz.getHeight() }, (_, y) => Array.from({ length: matriz.getWidth() }, (_, x) => matriz.get(x, y)))
}

/** `getUserMedia` devuelve un video (un lienzo) que muestra el QR: lo único que se simula de la cámara. */
async function conCamaraQueVeUnQr(page: Page, texto: string) {
  await page.addInitScript(
    ({ filas }) => {
      const celda = 10
      const crear = () => {
        const lienzo = document.createElement('canvas')
        lienzo.width = filas[0]!.length * celda
        lienzo.height = filas.length * celda
        const ctx = lienzo.getContext('2d')!
        const pintar = () => {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, lienzo.width, lienzo.height)
          ctx.fillStyle = '#000'
          filas.forEach((fila, y) => fila.forEach((negro, x) => negro && ctx.fillRect(x * celda, y * celda, celda, celda)))
        }
        pintar()
        setInterval(pintar, 100) // un video que no cambia no emite cuadros
        return lienzo.captureStream(10)
      }
      navigator.mediaDevices.getUserMedia = async () => crear()
    },
    { filas: matrizQr(texto) },
  )
}

interface Llegada {
  cuerpo: unknown
  autorizacion: string | undefined
  contentType: string | undefined
}

/** El «servidor»: sesión de operario, la home vacía y `POST /mobile/llegadas` con la respuesta que diga el test. */
async function conServidorFalso(page: Page, respuestaLlegada: { status: number; cuerpo: unknown }) {
  const errores: string[] = []
  page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
  page.on('console', (mensaje) => {
    // El navegador anota en la consola cada 4xx («Failed to load resource»), también los que la prueba provoca a propósito.
    if (mensaje.type() === 'error' && !mensaje.text().startsWith('Failed to load resource')) errores.push(`console: ${mensaje.text()}`)
  })
  const peticiones: string[] = []
  const llegadas: Llegada[] = []
  let hayCookie = false
  const json = (cuerpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) })
  const sesion = { success: true, message: 'ok', nombre_completo: 'OPERARIO PRUEBA', role: 'operario', area: null, allowed_apps: ['traslado'], token: TOKEN }

  await page.route((url) => /^\/(api|mobile)\//.test(url.pathname), async (route) => {
    const peticion = route.request()
    const ruta = new URL(peticion.url()).pathname
    peticiones.push(`${peticion.method()} ${ruta}`)
    if (ruta === '/api/login') {
      hayCookie = true
      return route.fulfill(json({ ...sesion, username: 'operario.prueba' }))
    }
    if (ruta === '/api/refresh') return hayCookie ? route.fulfill(json(sesion)) : route.fulfill(json({ detail: 'Sesion expirada o invalida' }, 401))
    if (ruta === '/api/logout') {
      hayCookie = false
      return route.fulfill(json({ success: true, message: 'Sesion cerrada' }))
    }
    if (ruta === '/mobile/traslado/mis-ordenes') return route.fulfill(json({ ordenes: [] }))
    if (ruta === '/mobile/traslado/catalogos') return route.fulfill(json({ placas: [], proveedores: [] }))
    if (ruta === '/mobile/llegadas' && peticion.method() === 'POST') {
      llegadas.push({
        cuerpo: peticion.postDataJSON(),
        autorizacion: (await peticion.headerValue('authorization')) ?? undefined,
        contentType: (await peticion.headerValue('content-type')) ?? undefined,
      })
      return route.fulfill(json(respuestaLlegada.cuerpo, respuestaLlegada.status))
    }
    return route.fulfill(json({ detail: 'no esperada en esta prueba' }, 500))
  })
  return { peticiones, llegadas, errores }
}

async function entrarYAbrirLlegada(page: Page, servidor: { errores: string[] }) {
  await page.goto('/')
  await page.getByLabel('Usuario').waitFor({ timeout: 8000 }).catch(async () => {
    throw new Error(`No apareció el login. Errores: ${servidor.errores.join(' | ')} Texto: «${(await page.locator('body').innerText()).slice(0, 200)}»`)
  })
  await page.getByLabel('Usuario').fill('operario.prueba')
  await page.getByLabel('Contraseña').fill('cualquiera')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('button', { name: 'Marcar llegada' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Necesitamos la cámara y tu ubicación' })).toBeVisible()
}

const CONFIRMADA = { id_llegada: 11, punto: 'Patio de llegada', fecha_llegada: '2026-10-15T14:35:00-05:00', turno: 3, flags: ['OUT_OF_WINDOW'] }

test('el conductor escanea el QR y su llegada queda registrada con el turno', async ({ page }) => {
  const servidor = await conServidorFalso(page, { status: 201, cuerpo: CONFIRMADA })
  await conCamaraQueVeUnQr(page, TEXTO_QR)
  await entrarYAbrirLlegada(page, servidor)

  await page.getByRole('button', { name: 'Permitir cámara y ubicación' }).click()

  await expect(page.getByText('Patio de llegada')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Tu turno')).toBeVisible()
  await expect(page.getByText('Hora de Lima')).toBeVisible()
  // La hora oficial del servidor (14:35 en Lima): «Hoy» si hoy es el 15/10 en Lima y la fecha si no, según el día en que se corra.
  await expect(page.getByText(/^(Hoy|15\/10) 14:35$/)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('OUT_OF_WINDOW')

  // Una sola petición, con exactamente los cuatro campos, el texto del QR tal cual y la sesión.
  expect(servidor.llegadas).toHaveLength(1)
  const { cuerpo, autorizacion, contentType } = servidor.llegadas[0]!
  expect(Object.keys(cuerpo as object).sort()).toEqual(['latitud', 'longitud', 'payload', 'precision_m'])
  expect(cuerpo).toMatchObject({ payload: TEXTO_QR, latitud: UBICACION.latitude, longitud: UBICACION.longitude, precision_m: UBICACION.accuracy })
  expect(autorizacion).toBe(`Bearer ${TOKEN}`)
  expect(contentType).toContain('application/json')

  expect(servidor.errores).toEqual([])
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Traslado' })).toBeVisible()
})

test('un código no válido dice qué hacer y deja escanear de nuevo', async ({ page }) => {
  const servidor = await conServidorFalso(page, { status: 400, cuerpo: { detail: 'Código no válido', code: 'INVALID_CODE' } })
  await conCamaraQueVeUnQr(page, TEXTO_QR)
  await entrarYAbrirLlegada(page, servidor)

  await page.getByRole('button', { name: 'Permitir cámara y ubicación' }).click()

  await expect(page.getByText('El código no es válido.')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Escanear de nuevo' }).click()
  // Vuelve a abrir la cámara, lee el mismo QR y vuelve a mandarlo: dos peticiones en total.
  await expect.poll(() => servidor.llegadas.length, { timeout: 20_000 }).toBe(2)
  expect(servidor.errores).toEqual([])
})

test('un 403 dice que no tiene permiso y NO cierra la sesión', async ({ page }) => {
  const servidor = await conServidorFalso(page, { status: 403, cuerpo: { detail: 'Permisos insuficientes' } })
  await conCamaraQueVeUnQr(page, TEXTO_QR)
  await entrarYAbrirLlegada(page, servidor)

  await page.getByRole('button', { name: 'Permitir cámara y ubicación' }).click()

  await expect(page.getByText('No tienes permiso para marcar llegada.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('Usuario')).toHaveCount(0) // sigue con sesión
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Traslado' })).toBeVisible()
  expect(servidor.peticiones).not.toContain('POST /api/logout')
})

test('a 360 px la confirmación no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  const servidor = await conServidorFalso(page, { status: 201, cuerpo: CONFIRMADA })
  await conCamaraQueVeUnQr(page, TEXTO_QR)
  await entrarYAbrirLlegada(page, servidor)
  await page.getByRole('button', { name: 'Permitir cámara y ubicación' }).click()
  await expect(page.getByText('Patio de llegada')).toBeVisible({ timeout: 20_000 })

  const { ancho, visible } = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }))
  expect(ancho).toBeLessThanOrEqual(visible)
})
