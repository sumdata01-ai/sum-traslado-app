import { expect, test } from '@playwright/test'

/**
 * O-01 con un navegador real y el backend de desarrollo: la home con las órdenes, el filtro de VIN
 * y el modo sin conexión (`context.setOffline`).
 *
 * No recarga la página: con el backend de desarrollo actual la cookie de refresh la rechaza el
 * navegador (ver `login.spec.ts`), así que una recarga perdería la sesión por esa otra causa.
 */
const usuario = process.env.TRASLADO_USUARIO
const clave = process.env.TRASLADO_CLAVE

test.skip(!usuario || !clave, 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Usuario').fill(usuario!)
  await page.getByLabel('Contraseña').fill(clave!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // «Cerrar sesión» y no el título: «Traslado» también está en el login, y un login rechazado
  // (por ejemplo, por el límite de 10 por minuto) pasaba este paso y fallaba después sin decir por qué.
  await expect(page.getByRole('button', { name: 'Cerrar sesión' }), 'el login no entró: ¿límite de intentos?').toBeVisible()
})

const tarjetas = (page: import('@playwright/test').Page) => page.locator('section', { has: page.getByRole('heading', { name: /Disponibles hoy/ }) }).getByRole('listitem')

test('muestra las dos secciones y las órdenes del pool, con su etiqueta', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Mis traslados/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Disponibles hoy/ })).toBeVisible()

  await expect(page.getByText('Cargando tus traslados…')).toHaveCount(0)
  // La base de desarrollo tiene órdenes pendientes sin conductor; si un día no las tiene, el mensaje de vacío lo dice.
  const hay = await tarjetas(page).count()
  if (hay === 0) {
    await expect(page.getByText('No hay traslados disponibles hoy.')).toBeVisible()
    test.skip(true, 'la base de desarrollo no tiene órdenes disponibles hoy')
  }
  await expect(tarjetas(page).first().getByText('Sin empezar')).toBeVisible()
})

test('el filtro de VIN trabaja sin red: con la conexión cortada sigue filtrando lo ya cargado', async ({ page, context }) => {
  await expect(tarjetas(page).first()).toBeVisible()
  const total = await tarjetas(page).count()
  const vin = (await tarjetas(page).first().locator('p').first().textContent())!.trim()

  await context.setOffline(true)
  const peticiones: string[] = []
  page.on('request', (r) => peticiones.push(r.url()))

  await page.getByLabel('Filtrar por VIN').fill(vin.toLowerCase())

  await expect(tarjetas(page).filter({ hasText: vin })).toHaveCount(1)
  expect(await tarjetas(page).count()).toBeLessThanOrEqual(total)
  expect(peticiones.filter((u) => u.includes('/mobile/') || u.includes('/api/'))).toEqual([]) // filtrar no pide nada al servidor

  await page.getByLabel('Filtrar por VIN').fill('ESTE-VIN-NO-EXISTE')
  await expect(tarjetas(page)).toHaveCount(0)
  await expect(page.getByText('Ningún traslado coincide con «ESTE-VIN-NO-EXISTE».').first()).toBeVisible()
})

test('sin conexión: avisa con el banner ámbar y mantiene las órdenes; al volver la red actualiza sola', async ({ page, context }) => {
  await expect(tarjetas(page).first()).toBeVisible()
  const total = await tarjetas(page).count()

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Actualizar' }).click()

  await expect(page.getByText(/Sin conexión\. Se muestra lo último guardado/)).toBeVisible()
  await expect(tarjetas(page)).toHaveCount(total) // nada se pierde

  await context.setOffline(false) // el navegador emite «online» y la home se actualiza sola
  await expect(page.getByText(/Sin conexión\. Se muestra/)).toHaveCount(0)
  await expect(tarjetas(page)).toHaveCount(total)
})

test('cerrar sesión vuelve al login y las órdenes ya no se ven', async ({ page }) => {
  await expect(tarjetas(page).first()).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()

  await expect(page.getByLabel('Usuario')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Disponibles hoy/ })).toHaveCount(0)
})
