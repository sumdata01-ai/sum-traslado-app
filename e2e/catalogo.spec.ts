import { expect, type Page, test } from '@playwright/test'
import { soltarOrdenesDelUsuarioDePrueba } from './soltarPropias'

/**
 * O-04 con un navegador real y el backend de desarrollo: elegir la placa y el proveedor de una orden
 * propia, filtrando por código, y comprobar que la elección se conserva al actualizar y sin conexión.
 *
 * **Modifica la base de desarrollo**: toma una orden real del pool y la suelta al final, también si la
 * prueba falla a mitad. Elegir no escribe nada en el servidor: queda en el teléfono hasta E4-02.
 */
const usuario = process.env.TRASLADO_USUARIO
const clave = process.env.TRASLADO_CLAVE

test.skip(!usuario || !clave, 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local')

// Aunque la prueba falle a mitad o se quede sin tiempo, las órdenes tomadas se devuelven al pool.
test.afterAll(soltarOrdenesDelUsuarioDePrueba)

const seccion = (page: Page, nombre: RegExp) => page.locator('section', { has: page.getByRole('heading', { name: nombre }) })

test('elegir placa y proveedor de una orden propia, con filtro, y que se conserve', async ({ page, context }) => {
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
    await page.getByRole('button', { name: `Comenzar despacho ${vin}` }).click()
    tomada = true
    const propia = seccion(page, /Mis traslados/).getByRole('listitem').filter({ hasText: vin })
    await expect(propia).toBeVisible()

    // La orden de la hoja no trae placa ni proveedor: se piden, y se avisa que sin placa no se fotografía.
    const placa = propia.getByRole('combobox', { name: /Placa rotativa/ })
    const proveedor = propia.getByRole('combobox', { name: /Proveedor/ })
    await expect(propia.getByText('Elige la placa para poder fotografiar la salida.')).toBeVisible()

    // Filtrar por código: la lista es corta y no pasa de 224 px.
    await placa.click()
    const todas = await page.getByRole('option').count()
    expect(todas).toBeGreaterThan(5)
    const alturaLista = await page.getByRole('listbox').evaluate((el) => el.getBoundingClientRect().height)
    expect(alturaLista).toBeLessThanOrEqual(224)
    await placa.fill('eeb')
    const filtradas = await page.getByRole('option').count()
    expect(filtradas).toBeLessThan(todas)

    // Elegir NO manda nada al servidor: queda en el teléfono hasta confirmar la salida (E4-02).
    const peticiones: string[] = []
    const registrar = (r: import('@playwright/test').Request) => {
      if (r.url().includes('/mobile/') || r.url().includes('/api/')) peticiones.push(`${r.method()} ${new URL(r.url()).pathname}`)
    }
    page.on('request', registrar)

    // Elegida una opción, el campo pasa a solo lectura con un lápiz a su costado (O-04b).
    const grupoPlaca = propia.getByRole('group', { name: /Placa rotativa/ })
    const valorPlaca = grupoPlaca.locator('p')
    const lapizPlaca = propia.getByRole('button', { name: /Editar Placa rotativa/ })
    const grupoProveedor = propia.getByRole('group', { name: /Proveedor/ })
    const lapizProveedor = propia.getByRole('button', { name: /Editar Proveedor/ })
    await expect(lapizPlaca).toHaveCount(0) // sin elegir no hay lápiz

    const primeraOpcion = (await page.getByRole('option').first().textContent())!
    await page.getByRole('option').first().click()
    await expect(valorPlaca).toHaveText(primeraOpcion)
    await expect(lapizPlaca).toBeVisible()
    await expect(lapizPlaca).toBeFocused()
    const caja = (await lapizPlaca.boundingBox())!
    expect(caja.width).toBeGreaterThanOrEqual(44)
    expect(caja.height).toBeGreaterThanOrEqual(44)

    // Con el lápiz se corrige por otra, las veces que haga falta.
    await lapizPlaca.click()
    await expect(propia.getByRole('combobox', { name: /Placa rotativa/ })).toBeFocused()
    await expect(page.getByRole('listbox')).toBeVisible()
    const otraOpcion = (await page.getByRole('option').nth(3).textContent())!
    expect(otraOpcion).not.toBe(primeraOpcion)
    await page.getByRole('option').nth(3).click()
    await expect(valorPlaca).toHaveText(otraOpcion)

    await lapizPlaca.click()
    await page.getByRole('option').nth(1).click()
    await expect(valorPlaca).not.toHaveText(otraOpcion) // espera a que el campo se actualice
    const tercera = (await valorPlaca.textContent())!

    // Salir del lápiz sin elegir conserva lo anterior.
    await lapizPlaca.click()
    await page.keyboard.press('Escape')
    await expect(valorPlaca).toHaveText(tercera)

    // El proveedor es independiente: se elige, se corrige, y la placa no cambia.
    await proveedor.click()
    await page.getByRole('option').first().click()
    await expect(lapizProveedor).toBeVisible()
    const primerProveedor = (await grupoProveedor.locator('p').textContent())!
    await lapizProveedor.click()
    await page.getByRole('option').nth(1).click()
    await expect(grupoProveedor.locator('p')).not.toHaveText(primerProveedor)
    await expect(valorPlaca).toHaveText(tercera)
    await expect(propia.getByText('Elige la placa para poder fotografiar la salida.')).toHaveCount(0)

    await page.waitForTimeout(500)
    expect(peticiones, 'elegir o corregir la placa/proveedor no debe llamar al servidor').toEqual([])
    page.off('request', registrar)

    // La elección sobrevive a actualizar (el servidor sigue sin traer placa) y a cortar la red.
    await page.getByRole('button', { name: 'Actualizar' }).click()
    await expect(page.getByRole('button', { name: 'Actualizar' })).toBeEnabled()
    await expect(valorPlaca).toHaveText(tercera)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Actualizar' }).click()
    await expect(page.getByText(/Sin conexión\. Se muestra lo último guardado/)).toBeVisible()
    await expect(valorPlaca).toHaveText(tercera)
    await expect(lapizPlaca).toBeVisible() // y sigue pudiéndose corregir sin red
    await context.setOffline(false)
  } finally {
    await context.setOffline(false)
    // Limpieza: que la orden no quede tomada por el usuario de prueba si algo falló a mitad.
    if (tomada) {
      const soltar = page.getByRole('button', { name: `Soltar ${vin}` })
      if (await soltar.isVisible().catch(() => false)) await soltar.click()
    }
  }
})
