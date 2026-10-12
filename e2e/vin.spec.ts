import { expect, type Request, test } from '@playwright/test'

/**
 * O-03 con un navegador real y el backend de desarrollo: buscar en el sistema un VIN que no está en la
 * lista del teléfono. **Solo lectura**: no toma ni cambia ninguna orden.
 *
 * No se prueba aquí «hallar una orden por VIN»: si el VIN de una orden ya está en la lista del teléfono,
 * el filtro la encuentra sin consultar al servidor, y la búsqueda parcial del backend cubre lo mismo que
 * la lista. Esos casos los cubren las pruebas con respuestas simuladas y las de `trasladoApi.backend`.
 */
const usuario = process.env.TRASLADO_USUARIO
const clave = process.env.TRASLADO_CLAVE

test.skip(!usuario || !clave, 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local')

// Un VIN con forma válida que no es ningún vehículo del sistema.
const VIN_DESCONOCIDO = '1HGCM82633A004352'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Usuario').fill(usuario!)
  await page.getByLabel('Contraseña').fill(clave!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' }), 'el login no entró: ¿límite de intentos?').toBeVisible()
  await expect(page.getByLabel('Filtrar por VIN')).toBeVisible()
})

function registrarPeticionesDeVin(page: import('@playwright/test').Page) {
  const peticiones: string[] = []
  page.on('request', (r: Request) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/mobile/traslado/vin') || url.pathname.startsWith('/mobile/traslado/buscar')) peticiones.push(`${r.method()} ${url.pathname}${url.search}`)
  })
  return peticiones
}

test('con menos de 4 caracteres no se puede buscar y no se llama al servidor', async ({ page }) => {
  const peticiones = registrarPeticionesDeVin(page)

  await page.getByLabel('Filtrar por VIN').fill('QQQ')

  await expect(page.getByRole('button', { name: 'Buscar en el sistema' })).toBeDisabled()
  await expect(page.getByText('Escribe al menos 4 caracteres del VIN para buscar en el sistema.')).toBeVisible()
  await page.waitForTimeout(300)
  expect(peticiones).toEqual([])
})

test('un VIN válido que no existe dice «VIN no conocido», tras una sola consulta con el VIN en la URL', async ({ page }) => {
  const peticiones = registrarPeticionesDeVin(page)
  await page.getByLabel('Filtrar por VIN').fill(VIN_DESCONOCIDO.toLowerCase()) // se normaliza a mayúsculas

  await page.getByRole('button', { name: 'Buscar en el sistema' }).click()

  await expect(page.getByText('VIN no conocido.')).toBeVisible()
  expect(peticiones).toEqual([`GET /mobile/traslado/vin/${VIN_DESCONOCIDO}`])
})

test('un VIN con una O por un 0 avisa del formato sin consultar al servidor', async ({ page }) => {
  const peticiones = registrarPeticionesDeVin(page)
  await page.getByLabel('Filtrar por VIN').fill('LSCABN3E2VE84063O')

  await page.getByRole('button', { name: 'Buscar en el sistema' }).click()

  await expect(page.getByText('Formato de VIN inválido.')).toBeVisible()
  expect(peticiones).toEqual([])
})

test('una búsqueda parcial sin coincidencias lo dice con lo buscado', async ({ page }) => {
  const peticiones = registrarPeticionesDeVin(page)
  await page.getByLabel('Filtrar por VIN').fill('QQQQ9')

  await page.getByRole('button', { name: 'Buscar en el sistema' }).click()

  await expect(page.getByText('Ningún vehículo del sistema coincide con «QQQQ9».')).toBeVisible()
  expect(peticiones).toEqual(['GET /mobile/traslado/buscar?q=QQQQ9'])
})

test('sin conexión dice que buscar en el sistema necesita internet; al cambiar el texto el aviso se va', async ({ page, context }) => {
  await page.getByLabel('Filtrar por VIN').fill(VIN_DESCONOCIDO)
  await context.setOffline(true)

  await page.getByRole('button', { name: 'Buscar en el sistema' }).click()
  await expect(page.getByText('Sin conexión. Buscar en el sistema necesita internet.')).toBeVisible()

  await page.getByLabel('Filtrar por VIN').fill(`${VIN_DESCONOCIDO}X`)
  await expect(page.getByText('Sin conexión. Buscar en el sistema necesita internet.')).toHaveCount(0)
  await context.setOffline(false)
})
