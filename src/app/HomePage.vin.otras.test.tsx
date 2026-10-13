/** O-03 en la home: escanear o buscar el VIN de una orden que otra persona ya sacó. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Sesion } from '@/core/auth'
import type { TrasladoApi, VinIdentificado } from '@/features/traslado/api/trasladoApi'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaConServidor, ordenRemota } from '@/features/traslado/data/testing/fakes'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }
const VIN = 'LVTDD24B6VDC81445'
const frank = { id: 303, username: 'frank', nombre_completo: 'Frank Xavier Cavero Ruiz' }

async function buscar(identificar: TrasladoApi['identificarVin']) {
  const m = crearListaConServidor([ordenRemota(1, { vin: 'ZZZ00000000000001' })])
  const id = crearIdentificadorDePrueba({ identificarVin: identificar })
  render(<HomePage sesion={sesion} lista={m.lista} catalogo={crearCatalogoDePrueba().catalogo} identificador={id.identificador} onCerrarSesion={() => undefined} />)
  await screen.findByText('ZZZ00000000000001')
  await userEvent.type(screen.getByLabelText('Filtrar por VIN'), VIN)
  await userEvent.click(screen.getByRole('button', { name: 'Buscar en el sistema' }))
}

const respuesta = (extra: Partial<VinIdentificado>): VinIdentificado => ({ vin: VIN, ordenes: [], descartadas: 0, ...extra })

describe('un VIN cuya orden ya salió (otra persona)', () => {
  it('dice que la orden ya está tomada y quién la tiene, en vez de «sin orden pendiente»', async () => {
    await buscar(async () =>
      respuesta({
        otras: [{ idOrden: 9001, estado: 'en_transito', conductorAsignado: { id: frank.id, username: frank.username, nombreCompleto: frank.nombre_completo }, fechaSalida: '2026-10-13T12:00:00Z', fechaEntrega: null }],
      }),
    )

    const aviso = await screen.findByText('Orden ya tomada')
    expect(aviso.closest('[role="status"]')?.textContent).toMatch(/^Orden ya tomada el \d{2}\/\d{2}, \d{2}:\d{2}$/)
    expect(screen.queryByText(/Frank/)).not.toBeInTheDocument()
    expect(screen.queryByText('Sin orden pendiente.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Comenzar despacho/ })).not.toBeInTheDocument()
  })

  it('con el servidor de hoy (sin el campo nuevo) todo sigue como antes: «Sin orden pendiente»', async () => {
    await buscar(async () => respuesta({}))
    expect(await screen.findByText('Sin orden pendiente.')).toBeInTheDocument()
    expect(screen.queryByText('Orden ya tomada')).not.toBeInTheDocument()
  })

  it('una orden ya entregada se dice como entregada', async () => {
    await buscar(async () =>
      respuesta({ otras: [{ idOrden: 9002, estado: 'realizado', conductorAsignado: null, fechaSalida: null, fechaEntrega: '2026-10-13T12:00:00Z' }] }),
    )
    expect(await screen.findByText('Orden ya entregada.')).toBeInTheDocument()
  })
})
