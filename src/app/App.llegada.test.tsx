/** La marcación de llegada llega hasta la home del operario y no a la vista del coordinador. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AuthCookie } from '@/core/auth'
import { AlmacenMemoria, crearServidorFalso } from '@/core/auth/testing/servidorFalso'
import { LlegadaApiFalsa, UbicacionFalsa } from '@/features/llegada/data/testing/fakes'
import { crearListaSeguimientoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaDePrueba } from '@/features/traslado/data/testing/fakes'
import { App } from './App'

function montar(role: string, apps: string[], conLlegada = true) {
  const servidor = crearServidorFalso()
  servidor.perfil = { role, area: '', apps }
  const auth = new AuthCookie({ solicitar: servidor.solicitar, almacen: new AlmacenMemoria(), candado: (tarea) => tarea() })
  render(
    <App
      auth={auth}
      lista={crearListaDePrueba().lista}
      catalogo={crearCatalogoDePrueba().catalogo}
      identificador={crearIdentificadorDePrueba().identificador}
      seguimiento={crearListaSeguimientoDePrueba().lista}
      llegada={conLlegada ? { api: new LlegadaApiFalsa(), ubicacion: new UbicacionFalsa() } : undefined}
    />,
  )
}

async function entrar() {
  await userEvent.type(await screen.findByLabelText('Usuario'), 'usuario.prueba')
  await userEvent.type(screen.getByLabelText('Contraseña'), 'buena')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('«Marcar llegada» en la app', () => {
  it('el operario la ve en su home y puede abrirla', async () => {
    montar('operario', ['traslado'])
    await entrar()

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar llegada' }))

    expect(screen.getByText('Necesitamos la cámara y tu ubicación')).toBeInTheDocument()
  })

  it('si la app no la configura, la home no la ofrece', async () => {
    montar('operario', ['traslado'], false)
    await entrar()
    await screen.findByRole('heading', { level: 1, name: 'Traslado' })
    expect(screen.queryByRole('button', { name: 'Marcar llegada' })).not.toBeInTheDocument()
  })

  it('el coordinador, que solo mira el seguimiento, no la tiene', async () => {
    montar('coordinador', [])
    await entrar()
    await screen.findByRole('heading', { level: 1, name: 'Mis vehículos' })
    expect(screen.queryByRole('button', { name: 'Marcar llegada' })).not.toBeInTheDocument()
  })
})
