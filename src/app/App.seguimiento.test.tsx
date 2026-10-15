import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { AuthCookie } from '@/core/auth'
import { AlmacenMemoria, crearServidorFalso } from '@/core/auth/testing/servidorFalso'
import { crearListaSeguimientoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaDePrueba } from '@/features/traslado/data/testing/fakes'
import { App } from './App'

/**
 * Quién entra a la vista de seguimiento: el **rol** coordinador (decisión del 2026-10-15), sin mirar `allowed_apps`.
 * docs/07-planificacion/mapeo-rol-coordinador.md §5.
 */
function navegador(perfil: { role: string; apps: string[] }) {
  const servidor = crearServidorFalso()
  servidor.perfil = { role: perfil.role, area: '', apps: perfil.apps }
  const almacen = new AlmacenMemoria()
  const abrirPestana = () => new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (tarea) => tarea() })
  return { servidor, abrirPestana }
}

function montar(perfil: { role: string; apps: string[] }, conSeguimiento = true) {
  const n = navegador(perfil)
  const seguimiento = crearListaSeguimientoDePrueba()
  const lista = crearListaDePrueba()
  const vista = render(
    <App
      auth={n.abrirPestana()}
      lista={lista.lista}
      catalogo={crearCatalogoDePrueba().catalogo}
      identificador={crearIdentificadorDePrueba().identificador}
      seguimiento={conSeguimiento ? seguimiento.lista : undefined}
    />,
  )
  return { ...n, ...vista, seguimiento, ordenes: lista }
}

async function entrar() {
  await userEvent.type(await screen.findByLabelText('Usuario'), 'usuario.prueba')
  await userEvent.type(screen.getByLabelText('Contraseña'), 'buena')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

const vistaDeSeguimiento = () => screen.findByRole('heading', { level: 1, name: 'Mis vehículos' })

describe('el rol coordinador', () => {
  it('entra a la vista de seguimiento, no a la home de Traslado', async () => {
    montar({ role: 'coordinador', apps: [] })
    await entrar()

    expect(await vistaDeSeguimiento()).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Tabla de vehículos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Traslado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Sin acceso/ })).not.toBeInTheDocument()
  })

  it('entra aunque `allowed_apps` esté vacío: no depende de las apps de su cuenta', async () => {
    montar({ role: 'coordinador', apps: [] })
    await entrar()
    expect(await vistaDeSeguimiento()).toBeInTheDocument()
  })

  it('entra a la vista de seguimiento AUNQUE su cuenta tenga `traslado`: el rol manda', async () => {
    montar({ role: 'coordinador', apps: ['traslado'] })
    await entrar()
    expect(await vistaDeSeguimiento()).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Traslado' })).not.toBeInTheDocument()
  })

  it('no hace ninguna petición de órdenes de Traslado (`mis-ordenes`): ve el seguimiento, no el trabajo del operario', async () => {
    const m = montar({ role: 'coordinador', apps: ['traslado'] })
    await entrar()
    await vistaDeSeguimiento()
    expect(m.ordenes.misOrdenes).not.toHaveBeenCalled()
  })

  it('recargar con la cookie viva lo devuelve a la vista de seguimiento sin pasar por el login', async () => {
    const m = montar({ role: 'coordinador', apps: [] })
    await entrar()
    await vistaDeSeguimiento()
    m.unmount()

    const otra = render(
      <App
        auth={m.abrirPestana()}
        lista={crearListaDePrueba().lista}
        catalogo={crearCatalogoDePrueba().catalogo}
        identificador={crearIdentificadorDePrueba().identificador}
        seguimiento={crearListaSeguimientoDePrueba().lista}
      />,
    )

    expect(await vistaDeSeguimiento()).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument()
    otra.unmount()
  })

  it('sin la vista nueva (un despliegue anterior) ve «Sin acceso», nunca la home del operario', async () => {
    montar({ role: 'coordinador', apps: ['traslado'] }, false)
    await entrar()
    expect(await screen.findByRole('heading', { name: 'Sin acceso a Traslado' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Traslado' })).not.toBeInTheDocument()
  })

  it('cerrar la sesión lo manda al login y la lista queda vacía para quien entre después', async () => {
    const m = montar({ role: 'coordinador', apps: [] })
    await entrar()
    await screen.findByRole('region', { name: 'Tabla de vehículos' })
    expect(m.seguimiento.lista.getSnapshot().traslados.length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(m.seguimiento.lista.getSnapshot().traslados).toEqual([])
  })

  it('la pantalla de seguimiento tampoco tiene violaciones de axe', async () => {
    const m = montar({ role: 'coordinador', apps: [] })
    await entrar()
    await screen.findByRole('region', { name: 'Tabla de vehículos' })
    expect(await axe(m.container)).toHaveNoViolations()
  })
})

describe('quien NO es coordinador sigue como hoy', () => {
  it('un operario con `traslado` va a la home de Traslado', async () => {
    montar({ role: 'operario', apps: ['traslado'] })
    await entrar()
    expect(await screen.findByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Traslado' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Mis vehículos' })).not.toBeInTheDocument()
  })

  it('un operario sin `traslado` ve «Sin acceso»: tener la app `seguimiento` en su cuenta no le abre la vista', async () => {
    montar({ role: 'operario', apps: ['seguimiento'] })
    await entrar()
    expect(await screen.findByRole('heading', { name: 'Sin acceso a Traslado' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Mis vehículos' })).not.toBeInTheDocument()
  })

  it('un supervisor o un admin tampoco entran a la vista de seguimiento por su rol', async () => {
    for (const role of ['supervisor', 'admin']) {
      const m = montar({ role, apps: ['traslado'] })
      await entrar()
      await screen.findByText('Hola, OPERARIO PRUEBA')
      expect(screen.queryByRole('heading', { level: 1, name: 'Mis vehículos' })).not.toBeInTheDocument()
      m.unmount()
    }
  })

  it('un rol que solo se parece a «coordinador» no cuenta (la comparación es exacta, como en el backend)', async () => {
    for (const role of ['Coordinador', 'coordinadores', 'coordinador ']) {
      const m = montar({ role, apps: [] })
      await entrar()
      expect(await screen.findByRole('heading', { name: 'Sin acceso a Traslado' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 1, name: 'Mis vehículos' })).not.toBeInTheDocument()
      m.unmount()
    }
  })
})
