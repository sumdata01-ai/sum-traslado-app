import { expect, test } from '@playwright/test'

/**
 * A-02 con un navegador real. Lo que ninguna otra prueba puede ver: si el NAVEGADOR acepta y
 * devuelve la cookie de refresh. El backend de desarrollo la emite con `SameSite=None` y sin
 * `Secure`, una combinación que Chrome rechaza; si aquí la recarga pierde la sesión, es eso.
 */
const usuario = process.env.TRASLADO_USUARIO
const clave = process.env.TRASLADO_CLAVE
const NOMBRE_COOKIE = 'sum_refresh_token'

test.skip(!usuario || !clave, 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local')

test('entrar, recargar sin perder la sesión y salir', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByLabel('Usuario')).toBeVisible()

  await page.getByLabel('Usuario').fill(usuario!)
  await page.getByLabel('Contraseña').fill(clave!)
  const respuestaLogin = page.waitForResponse((r) => r.url().endsWith('/api/login') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()

  // Comprobado el 2026-10-09 con Chrome y Edge reales: un `Set-Cookie` con `SameSite=None` y SIN `Secure`
  // lo rechaza el navegador, y la recarga pierde la sesión. Con `SameSite=Lax` (el valor por defecto del
  // backend) o con `SameSite=None; Secure` funciona. Mientras el backend de desarrollo emita la primera
  // combinación esta prueba es un fallo ESPERADO; cuando se corrija pasará sola y Playwright avisará
  // de que ya se puede quitar esta marca. No oculta fallos del código del cliente: solo cubre esa causa.
  const setCookie = (await (await respuestaLogin).headerValue('set-cookie')) ?? ''
  const cookieRechazable = /samesite=none/i.test(setCookie) && !/;\s*secure/i.test(setCookie)
  test.fail(
    cookieRechazable,
    'El backend emite la cookie de refresh con SameSite=None y sin Secure: el navegador la rechaza. Pedir REFRESH_COOKIE_SAMESITE=lax (o SECURE=true).',
  )

  // ¿Qué hizo el navegador con la cookie de refresh que mandó el servidor?
  const cookie = (await context.cookies()).find((c) => c.name === NOMBRE_COOKIE)
  test.info().annotations.push({
    type: 'cookie de refresh',
    description: cookie
      ? `guardada · httpOnly=${cookie.httpOnly} secure=${cookie.secure} sameSite=${cookie.sameSite} path=${cookie.path}`
      : 'EL NAVEGADOR NO LA GUARDÓ',
  })
  expect(cookie, 'el navegador no guardó la cookie de refresh: la recarga perderá la sesión').toBeDefined()
  expect(cookie?.httpOnly).toBe(true) // el JavaScript no debe poder leerla

  // Recargar: no debe pedir credenciales.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await expect(page.getByLabel('Usuario')).toHaveCount(0)

  // Recargar otra vez: el refresh rota la cookie en cada recarga y debe seguir funcionando.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()

  // Salir: vuelve al login y, al recargar, no vuelve a entrar solo.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByLabel('Usuario')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Usuario')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0)
  expect((await context.cookies()).find((c) => c.name === NOMBRE_COOKIE)).toBeUndefined()
})

test('una contraseña incorrecta muestra el mensaje del servidor y se queda en el login', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Usuario').fill(usuario!)
  await page.getByLabel('Contraseña').fill('esta-clave-no-es-la-correcta')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('alert')).toContainText(/incorrect/i)
  await expect(page.getByLabel('Usuario')).toHaveValue(usuario!)
  await expect(page.getByLabel('Contraseña')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0)
})
