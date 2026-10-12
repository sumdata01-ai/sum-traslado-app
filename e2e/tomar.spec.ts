import { expect, type Page, test } from '@playwright/test'
import { soltarOrdenesDelUsuarioDePrueba } from './soltarPropias'

/**
 * O-02 con un navegador real y el backend de desarrollo: tomar una orden del pool con «Comenzar
 * despacho» y devolverla con «Soltar». **Modifica la base de desarrollo**: toma una orden real y la
 * suelta al final, también si la prueba falla a mitad.
 */
const usuario = process.env.TRASLADO_USUARIO
const clave = process.env.TRASLADO_CLAVE

test.skip(!usuario || !clave, 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local')

// Aunque la prueba falle a mitad o se quede sin tiempo, las órdenes tomadas se devuelven al pool.
test.afterAll(soltarOrdenesDelUsuarioDePrueba)

const seccion = (page: Page, nombre: RegExp) => page.locator('section', { has: page.getByRole('heading', { name: nombre }) })

test('tomar una orden del pool y devolverla', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Usuario').fill(usuario!)
  await page.getByLabel('Contraseña').fill(clave!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' }), 'el login no entró: ¿límite de intentos?').toBeVisible()

  const primera = seccion(page, /Disponibles hoy/).getByRole('listitem').first()
  await expect(primera).toBeVisible()
  const vin = (await primera.locator('p').first().textContent())!.trim()
  let tomada = false

  try {
    // Tocar la tarjeta no la toma: solo el botón.
    await primera.locator('p').first().click()
    await expect(seccion(page, /Mis traslados/).getByText(vin, { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: `Comenzar despacho ${vin}` }).click()
    tomada = true
    await expect(page.getByText('La orden es tuya.')).toBeVisible()
    await expect(seccion(page, /Mis traslados/).getByText(vin, { exact: true })).toBeVisible()
    await expect(seccion(page, /Disponibles hoy/).getByText(vin, { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: `Soltar ${vin}` }).click() // sin fotos: no pide confirmación
    await expect(page.getByText('Devuelta al pool.')).toBeVisible()
    tomada = false
    await expect(seccion(page, /Disponibles hoy/).getByText(vin, { exact: true })).toBeVisible()
    await expect(seccion(page, /Mis traslados/).getByText(vin, { exact: true })).toHaveCount(0)
  } finally {
    // Limpieza: que la orden no quede tomada por el usuario de prueba si algo falló a mitad.
    if (tomada) {
      const soltar = page.getByRole('button', { name: `Soltar ${vin}` })
      if (await soltar.isVisible().catch(() => false)) await soltar.click()
    }
  }
})
