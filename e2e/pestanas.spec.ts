import { expect, test } from '@playwright/test'

/**
 * A-03 con dos pestañas reales del mismo navegador (dos páginas del mismo contexto: comparten cookie,
 * `localStorage` y `BroadcastChannel`).
 *
 * Solo hay un usuario de prueba, así que aquí no se prueba «entra otra persona» (eso lo cubren las
 * pruebas de Vitest con el servidor falso). Sí se prueba lo que depende del navegador de verdad: que
 * el aviso viaje entre pestañas reales y que el logout de una saque a la otra.
 */
const usuario = process.env.TRASLADO_USUARIO
const clave = process.env.TRASLADO_CLAVE

test.skip(!usuario || !clave, 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local')

async function entrar(page: import('@playwright/test').Page) {
  await page.getByLabel('Usuario').fill(usuario!)
  await page.getByLabel('Contraseña').fill(clave!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' }), 'el login no entró: ¿límite de intentos?').toBeVisible()
}

test('cerrar sesión en una pestaña saca también a la otra', async ({ context }) => {
  const pestana1 = await context.newPage()
  await pestana1.goto('/')
  await entrar(pestana1)

  const pestana2 = await context.newPage()
  await pestana2.goto('/')
  // Con la cookie del backend de desarrollo (SameSite=None sin Secure) el navegador no la guarda y la
  // segunda pestaña no puede restaurar: entra con credenciales. Es la misma persona, así que la
  // primera pestaña no cambia. Cuando el backend corrija la cookie, entrará sola.
  const pideLogin = await pestana2
    .getByLabel('Usuario')
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (pideLogin) await entrar(pestana2)
  await expect(pestana2.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await expect(pestana1.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible() // sigue dentro

  await pestana2.getByRole('button', { name: 'Cerrar sesión' }).click()

  await expect(pestana2.getByLabel('Usuario')).toBeVisible()
  await expect(pestana1.getByLabel('Usuario')).toBeVisible() // el aviso llegó por el navegador real
  await expect(pestana1.getByRole('heading', { name: /Disponibles hoy/ })).toHaveCount(0)
})
