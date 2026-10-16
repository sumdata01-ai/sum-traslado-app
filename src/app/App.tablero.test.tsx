/** Quién ve el tablero de llegadas y cómo llega: la ruta `/dashboard` y el par rol + área (decididos el 2026-10-16). */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthCookie } from '@/core/auth'
import { normalizarRuta } from '@/core/navegacion/ruta'
import { AlmacenMemoria, crearServidorFalso } from '@/core/auth/testing/servidorFalso'
import { crearListaSeguimientoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import { crearTableroDePrueba } from '@/features/tablero-llegadas/data/testing/fakes'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaDePrueba } from '@/features/traslado/data/testing/fakes'
import { App } from './App'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => window.history.replaceState(null, '', '/'))

function montar(perfil: { role: string; area?: string; apps: string[] }, { conTablero = true, ruta = '/' }: { conTablero?: boolean; ruta?: string } = {}) {
  window.history.replaceState(null, '', ruta)
  const servidor = crearServidorFalso()
  servidor.perfil = { role: perfil.role, area: perfil.area ?? '', apps: perfil.apps }
  const auth = new AuthCookie({ solicitar: servidor.solicitar, almacen: new AlmacenMemoria(), candado: (tarea) => tarea() })
  const tablero = crearTableroDePrueba()
  const vista = render(
    <App
      auth={auth}
      lista={crearListaDePrueba().lista}
      catalogo={crearCatalogoDePrueba().catalogo}
      identificador={crearIdentificadorDePrueba().identificador}
      seguimiento={crearListaSeguimientoDePrueba().lista}
      tablero={conTablero ? tablero.tablero : undefined}
    />,
  )
  return { ...vista, tablero, servidor }
}

async function entrar() {
  await userEvent.type(await screen.findByLabelText('Usuario'), 'usuario.prueba')
  await userEvent.type(screen.getByLabelText('Contraseña'), 'buena')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

const tablero = () => screen.findByRole('heading', { level: 1, name: 'Llegadas por QR' })
const home = () => screen.findByRole('heading', { level: 1, name: 'Traslado' })
const sinAcceso = () => screen.findByRole('heading', { name: /Sin acceso/ })
const ruta = () => window.location.pathname

describe('los pares que ven el tablero: entran directo y NO ven Traslado (decidido el 2026-10-16)', () => {
  it.each([
    ['supervisor', 'despacho'],
    ['supervisor', 'secado'],
    ['asistente', 'despacho'],
    ['admin', ''],
    ['admin', 'qc'],
  ])('%s en %s entra directo al tablero y la dirección pasa a /dashboard', async (role, area) => {
    montar({ role, area, apps: [] })
    await entrar()
    expect(await tablero()).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Resumen del día' })).toBeInTheDocument()
    await waitFor(() => expect(ruta()).toBe('/dashboard'))
    expect(screen.queryByRole('heading', { name: /Sin acceso/ })).not.toBeInTheDocument()
  })

  it.each([
    ['supervisor', 'despacho'],
    ['supervisor', 'secado'],
    ['asistente', 'despacho'],
    ['admin', ''],
  ])('%s en %s aunque su cuenta TENGA `traslado`: sigue entrando al tablero y no ve Traslado', async (role, area) => {
    const m = montar({ role, area, apps: ['traslado', 'gps', 'rastreo'] })
    await entrar()
    expect(await tablero()).toBeInTheDocument()
    await waitFor(() => expect(ruta()).toBe('/dashboard'))
    // Ni la home, ni el botón de marcar llegada, ni un botón al tablero o de vuelta a Traslado.
    expect(screen.queryByRole('heading', { level: 1, name: 'Traslado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar llegada|Tablero de llegadas|Volver a Traslado|Comenzar/ })).not.toBeInTheDocument()
    expect(m.tablero.api.dia).toBeDefined()
  })

  it('con `traslado` en la cuenta, nunca pide las órdenes de Traslado', async () => {
    const lista = crearListaDePrueba()
    window.history.replaceState(null, '', '/')
    const servidor = crearServidorFalso()
    servidor.perfil = { role: 'supervisor', area: 'despacho', apps: ['traslado'] }
    const auth = new AuthCookie({ solicitar: servidor.solicitar, almacen: new AlmacenMemoria(), candado: (tarea) => tarea() })
    render(
      <App
        auth={auth}
        lista={lista.lista}
        catalogo={crearCatalogoDePrueba().catalogo}
        identificador={crearIdentificadorDePrueba().identificador}
        tablero={crearTableroDePrueba().tablero}
      />,
    )
    await entrar()
    await tablero()
    await new Promise((r) => setTimeout(r, 50))
    expect(lista.misOrdenes).not.toHaveBeenCalled()
  })

  it.each(['/', '/dashboard', '/dashboard/', '/Dashboard', '/otra/ruta', '/traslado'])('abrir «%s» los deja en /dashboard', async (rutaInicial) => {
    montar({ role: 'supervisor', area: 'despacho', apps: ['traslado'] }, { ruta: rutaInicial })
    await entrar()
    expect(await tablero()).toBeInTheDocument()
    // «/dashboard/» y «/Dashboard» ya son el tablero: la dirección no hace falta corregirla.
    await waitFor(() => expect(normalizarRuta(ruta())).toBe('/dashboard'))
  })

  it('la dirección se corrige sin dejar una entrada nueva: «atrás» no los lleva a Traslado', async () => {
    montar({ role: 'supervisor', area: 'despacho', apps: ['traslado'] })
    const antes = window.history.length
    await entrar()
    await tablero()
    await waitFor(() => expect(ruta()).toBe('/dashboard'))
    expect(window.history.length).toBe(antes)
    window.history.back()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('heading', { level: 1, name: 'Traslado' })).not.toBeInTheDocument()
  })

  it('el tablero no tiene botón de volver ni de ir a Traslado', async () => {
    montar({ role: 'asistente', area: 'despacho', apps: ['traslado'] })
    await entrar()
    await tablero()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).not.toContain('Volver a Traslado')
  })
})

describe('los que NO ven el tablero', () => {
  it.each([
    ['supervisor', 'puerto'],
    ['supervisor', 'secado_fisico'],
    ['asistente', 'secado'],
    ['asistente', 'repuestos'],
    ['gerencia', ''],
  ])('%s en %s sin Traslado ve «Sin acceso» y no se queda en /dashboard', async (role, area) => {
    montar({ role, area, apps: [] }, { ruta: '/dashboard' })
    await entrar()
    expect(await sinAcceso()).toBeInTheDocument()
    await waitFor(() => expect(ruta()).toBe('/'))
  })

  it('un operario con Traslado ve su home sin el botón del tablero, y /dashboard vuelve a /', async () => {
    montar({ role: 'operario', area: 'despacho', apps: ['traslado'] }, { ruta: '/dashboard' })
    const antes = window.history.length
    await entrar()
    expect(await home()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tablero de llegadas' })).not.toBeInTheDocument()
    await waitFor(() => expect(ruta()).toBe('/'))
    expect(window.history.length).toBe(antes) // se corrigió sin dejar una entrada nueva
  })

  it('un supervisor de Puerto con Traslado ve su home sin el botón', async () => {
    montar({ role: 'supervisor', area: 'puerto', apps: ['traslado'] })
    await entrar()
    expect(await home()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tablero de llegadas' })).not.toBeInTheDocument()
  })

  it('el coordinador sigue con su seguimiento, aunque abra /dashboard', async () => {
    montar({ role: 'coordinador', apps: [] }, { ruta: '/dashboard' })
    await entrar()
    expect(await screen.findByRole('heading', { level: 1, name: 'Mis vehículos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Llegadas por QR' })).not.toBeInTheDocument()
    await waitFor(() => expect(ruta()).toBe('/'))
  })

  it('si la aplicación no trae el tablero, nadie lo ve (un despliegue sin la vista nueva)', async () => {
    montar({ role: 'supervisor', area: 'despacho', apps: [] }, { conTablero: false })
    await entrar()
    expect(await sinAcceso()).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Llegadas por QR' })).not.toBeInTheDocument()
  })

  it('si la aplicación no trae el tablero, la home no ofrece el botón', async () => {
    montar({ role: 'supervisor', area: 'despacho', apps: ['traslado'] }, { conTablero: false })
    await entrar()
    expect(await home()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tablero de llegadas' })).not.toBeInTheDocument()
  })
})

describe('la sesión', () => {
  it('al cerrar sesión no queda nada del tablero en memoria', async () => {
    const m = montar({ role: 'supervisor', area: 'despacho', apps: [] })
    await entrar()
    await screen.findByRole('region', { name: 'Resumen del día' })
    expect(m.tablero.tablero.getSnapshot().datos).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(m.tablero.tablero.getSnapshot().datos).toBeNull()
  })

  it('sin sesión, abrir /dashboard muestra el login (no el tablero)', async () => {
    montar({ role: 'supervisor', area: 'despacho', apps: [] }, { ruta: '/dashboard' })
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Llegadas por QR' })).not.toBeInTheDocument()
  })
})
