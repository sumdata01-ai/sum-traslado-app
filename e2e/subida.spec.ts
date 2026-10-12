import { expect, type Page, test } from '@playwright/test'
import { soltarOrdenesDelUsuarioDePrueba } from './soltarPropias'

/**
 * E4-01 con un navegador real, la cámara simulada de Chromium y el backend de desarrollo: tomar UNA foto
 * de la salida y comprobar que se sube sola al bucket (PUT a la URL firmada, sin `Authorization`).
 *
 * **APAGADA POR DEFECTO.** Sube una foto de verdad a GCS y el objeto no se puede borrar desde aquí. El
 * 2026-10-12 se vio que el backend local firma URLs del bucket `sum-fotos-prod` (PRODUCCIÓN) y se
 * decidió no volver a tocarlo. Solo se activa con `TRASLADO_BUCKET_DE_PRUEBA=si`, cuando el backend local
 * apunte a un bucket de desarrollo; y aun así, **cualquier PUT a un bucket con «prod» en el nombre se
 * aborta** (ver más abajo).
 */
const usuario = process.env.TRASLADO_USUARIO
const clave = process.env.TRASLADO_CLAVE

test.skip(!usuario || !clave, 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local')
test.skip(process.env.TRASLADO_BUCKET_DE_PRUEBA !== 'si', 'apagada: el backend local firma URLs del bucket de producción (ver el comentario)')

// La cámara es de mentira (patrón de prueba) y el permiso ya está concedido.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

test.afterAll(soltarOrdenesDelUsuarioDePrueba)

const seccion = (page: Page, nombre: RegExp) => page.locator('section', { has: page.getByRole('heading', { name: nombre }) })

test('una foto de la salida se sube sola al bucket', async ({ page }) => {
  const puts: Array<{ url: string; status: number | null; cabeceras: Record<string, string> }> = []
  page.on('response', async (respuesta) => {
    const r = respuesta.request()
    if (r.method() !== 'PUT') return
    puts.push({ url: new URL(r.url()).origin, status: respuesta.status(), cabeceras: await r.allHeaders() })
  })

  const trazas: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PUT' || r.url().includes('upload-url')) trazas.push(`${Date.now() % 100000} ${r.method()} ${new URL(r.url()).pathname}`)
  })
  // Guarda: nunca subir a un bucket de producción, ni aunque la prueba esté activada.
  await page.route('https://storage.googleapis.com/**', (ruta) => {
    const bucket = new URL(ruta.request().url()).pathname.split('/')[1] ?? ''
    return /prod/i.test(bucket) ? ruta.abort('blockedbyclient') : ruta.continue()
  })
  await page.goto('/')
  await page.getByLabel('Usuario').fill(usuario!)
  await page.getByLabel('Contraseña').fill(clave!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' }), 'el login no entró: ¿límite de intentos?').toBeVisible()

  const primera = seccion(page, /Disponibles hoy/).getByRole('listitem').first()
  await expect(primera).toBeVisible()
  const vin = (await primera.locator('p').first().textContent())!.trim()

  await page.getByRole('button', { name: `Comenzar despacho ${vin}` }).click()
  const propia = seccion(page, /Mis traslados/).getByRole('listitem').filter({ hasText: vin })
  await expect(propia).toBeVisible()

  // Sin placa no se fotografía: se elige la primera.
  await propia.getByRole('combobox', { name: /Placa rotativa/ }).click()
  await page.getByRole('option').first().click()

  await page.getByRole('button', { name: `Fotografiar salida ${vin}` }).click()
  await expect(page.getByText('Fotos de la salida')).toBeVisible()
  await expect(page.getByText('0/6 fotos subidas')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Tomar foto' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Tomar foto' }).click()
  await expect(page.getByRole('button', { name: 'Usar' })).toBeVisible()
  await page.waitForTimeout(700) // la protección contra toques accidentales ignora un «Usar» en los primeros 500 ms
  await page.getByRole('button', { name: 'Usar' }).click()

  const frontal = page.getByRole('button', { name: /^Frontal:/ })
  await expect(frontal, `la foto no llegó a «Subida». PUT: ${JSON.stringify(puts)}`).toHaveText(/Subida|No se pudo subir/, { timeout: 30_000 })
  const alerta = await page.getByRole('alert').allTextContents()
  await expect(frontal, `falló la subida: ${alerta.join(' | ')}. PUT: ${JSON.stringify(puts)}`).toContainText('Subida')
  await expect(page.getByText('1/6 fotos subidas')).toBeVisible()

  // El PUT fue a Google, con 2xx y SIN el token de sesión.
  // Una sola petición de permiso y un solo PUT: no se subió dos veces (cada subida deja un objeto en el bucket).
  expect(trazas.filter((t) => t.includes('upload-url'))).toHaveLength(1)
  expect(trazas.filter((t) => t.includes(' PUT '))).toHaveLength(1)
  expect(puts).toHaveLength(1)
  expect(puts[0]!.status).toBeGreaterThanOrEqual(200)
  expect(puts[0]!.status).toBeLessThan(300)
  expect(puts[0]!.cabeceras).not.toHaveProperty('authorization')
})
