/** O-03 · una orden del VIN que ya no está pendiente: se dice qué le pasó y de quién es. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { OtraOrdenEncontrada, ResultadoBusqueda } from '../data/identificadorVin'
import type { OtraOrdenDeVin, RelacionConLaOrden } from '../domain'
import { BuscarEnElSistema } from './BuscarEnElSistema'

const VIN = 'LVTDD24B6VDC81445'
const frank = { id: 303, username: 'frank', nombreCompleto: 'Frank Xavier Cavero Ruiz' }

const otra = (extra: Partial<OtraOrdenDeVin> = {}, relacion: RelacionConLaOrden = 'deOtro'): OtraOrdenEncontrada => ({
  orden: { idOrden: 9001, estado: 'en_transito', conductorAsignado: frank, fechaSalida: '2026-10-13T12:00:00Z', fechaEntrega: null, ...extra },
  relacion,
})

function montar(otras: OtraOrdenEncontrada[]) {
  const onMostrar = vi.fn()
  const resultado: ResultadoBusqueda = { tipo: 'yaTomada', vin: VIN, otras }
  const vista = render(
    <BuscarEnElSistema texto={VIN} resultado={resultado} onBuscar={() => undefined} onElegirCandidato={() => undefined} onTomar={() => undefined} onMostrar={onMostrar} />,
  )
  return { ...vista, onMostrar }
}

describe('en tránsito, de otra persona', () => {
  it('dice solo «Orden ya tomada el <fecha, hora>» y nada más', () => {
    montar([otra()])
    expect(screen.getByRole('status').textContent).toMatch(/^Orden ya tomada el \d{2}\/\d{2}, \d{2}:\d{2}$/)
  })

  it('no dice quién la tiene, ni el VIN, ni «no es tuya», ni «en tránsito»', () => {
    montar([otra()])
    const aviso = screen.getByRole('status')
    expect(aviso).not.toHaveTextContent('Frank')
    expect(aviso).not.toHaveTextContent(VIN)
    expect(aviso).not.toHaveTextContent('No es tuya')
    expect(aviso).not.toHaveTextContent('en tránsito')
  })

  it('NO manda a esperar al supervisor ni dice que no hay orden', () => {
    montar([otra()])
    expect(screen.queryByText(/Espera a que el supervisor/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Sin orden pendiente/)).not.toBeInTheDocument()
  })

  it('no muestra el DNI (el usuario) de quien la tiene, aunque no tenga nombre', () => {
    montar([otra({ conductorAsignado: { id: 5, username: '46906952', nombreCompleto: null } })])
    expect(screen.getByRole('status')).not.toHaveTextContent('46906952')
  })

  it('sin fecha de salida dice solo «Orden ya tomada» y no inventa una', () => {
    montar([otra({ fechaSalida: null })])
    expect(screen.getByRole('status').textContent).toBe('Orden ya tomada')
  })

  it('con una fecha ilegible también dice solo «Orden ya tomada»', () => {
    montar([otra({ fechaSalida: 'no-es-una-fecha' })])
    expect(screen.getByRole('status').textContent).toBe('Orden ya tomada')
  })

  it('sin conductor asignado dice lo mismo: solo «Orden ya tomada el <fecha, hora>»', () => {
    montar([otra({ conductorAsignado: null }, 'delPool')])
    expect(screen.getByRole('status').textContent).toMatch(/^Orden ya tomada el \d{2}\/\d{2}, \d{2}:\d{2}$/)
  })
})

describe('en tránsito, y es de quien busca', () => {
  it('dice que ya es suya y ofrece «Ver en mis traslados»', async () => {
    const m = montar([otra({ conductorAsignado: { id: 7, username: 'yo', nombreCompleto: 'Yo' } }, 'mia')])
    expect(screen.getByRole('status')).toHaveTextContent('Ya es tuya y está en tránsito.')
    expect(screen.queryByText(/No es tuya/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: `Ver ${VIN} en mis traslados` }))

    expect(m.onMostrar).toHaveBeenCalledWith(VIN)
  })
})

describe('entregada, cancelada y otros estados', () => {
  it.each(['realizado', 'cerrada'])('«%s» → «Orden ya entregada», con la fecha y a quién se asignó', (estado) => {
    montar([otra({ estado, fechaEntrega: '2026-10-13T12:00:00Z' })])
    const aviso = screen.getByRole('status')
    expect(aviso).toHaveTextContent('Orden ya entregada.')
    expect(aviso).toHaveTextContent('se entregó el 13/10')
    expect(aviso).toHaveTextContent('(asignada a Frank Xavier Cavero Ruiz)')
  })

  it('cancelada → «Orden cancelada» y manda a avisar si debería seguir', () => {
    montar([otra({ estado: 'cancelada' })])
    const aviso = screen.getByRole('status')
    expect(aviso).toHaveTextContent('Orden cancelada.')
    expect(aviso).toHaveTextContent('avisa a tu supervisor')
  })

  it('un estado nuevo que la página no conoce se muestra tal cual, sin romperse', () => {
    montar([otra({ estado: 'en_revision' })])
    expect(screen.getByRole('status')).toHaveTextContent('tiene una orden en estado «en_revision»')
  })
})

describe('varias órdenes y accesibilidad', () => {
  it('muestra un aviso por cada orden', () => {
    montar([otra({ idOrden: 1, estado: 'realizado' }), otra({ idOrden: 2 })])
    expect(screen.getAllByRole('status')).toHaveLength(2)
  })

  it('sin violaciones de accesibilidad en tránsito, entregada y mía', async () => {
    const { container } = montar([otra(), otra({ idOrden: 2, estado: 'realizado' }), otra({ idOrden: 3 }, 'mia')])
    expect(await axe(container)).toHaveNoViolations()
  })
})
