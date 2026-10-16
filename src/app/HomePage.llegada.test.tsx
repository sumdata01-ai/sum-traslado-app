/** «Marcar llegada» en la home de Traslado: el botón, la pantalla y el regreso. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { LlegadaApiFalsa, UbicacionFalsa } from '@/features/llegada/data/testing/fakes'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaConServidor, ordenRemota } from '@/features/traslado/data/testing/fakes'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }

async function montar({ conLlegada = true }: { conLlegada?: boolean } = {}) {
  const m = crearListaConServidor([ordenRemota(1, { vin: 'LSCABN3E2VE840638' })])
  const ubicacion = new UbicacionFalsa()
  const vista = render(
    <HomePage
      sesion={sesion}
      lista={m.lista}
      catalogo={crearCatalogoDePrueba().catalogo}
      identificador={crearIdentificadorDePrueba().identificador}
      llegada={conLlegada ? { api: new LlegadaApiFalsa(), ubicacion } : undefined}
      onCerrarSesion={() => undefined}
    />,
  )
  await screen.findByText('LSCABN3E2VE840638')
  return { ...m, ...vista, ubicacion }
}

describe('el botón «Marcar llegada»', () => {
  it('está en la home, con la lista de traslados', async () => {
    await montar()
    expect(screen.getByRole('button', { name: 'Marcar llegada' })).toBeEnabled()
    expect(screen.getByRole('heading', { level: 1, name: 'Traslado' })).toBeInTheDocument()
  })

  it('no se ofrece si la app no tiene la marcación de llegada', async () => {
    await montar({ conLlegada: false })
    expect(screen.queryByRole('button', { name: 'Marcar llegada' })).not.toBeInTheDocument()
  })

  it('abre la pantalla de llegada, que reemplaza a la home', async () => {
    await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Marcar llegada' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Marcar llegada' })).toBeInTheDocument()
    expect(screen.getByText('Necesitamos la cámara y tu ubicación')).toBeInTheDocument()
    expect(screen.queryByText('LSCABN3E2VE840638')).not.toBeInTheDocument()
  })

  it('«Volver» regresa a la home con sus traslados', async () => {
    await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Marcar llegada' }))
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Traslado' })).toBeInTheDocument()
    expect(screen.getByText('LSCABN3E2VE840638')).toBeInTheDocument()
  })

  it('al volver no queda el GPS escuchando', async () => {
    const m = await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Marcar llegada' }))
    await userEvent.click(screen.getByRole('button', { name: 'Permitir cámara y ubicación' }))
    expect(m.ubicacion.escuchando).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))

    expect(m.ubicacion.escuchando).toBe(false)
  })

  it('la home con el botón no tiene fallos de accesibilidad', async () => {
    const m = await montar()
    expect(await axe(m.container)).toHaveNoViolations()
  })
})
