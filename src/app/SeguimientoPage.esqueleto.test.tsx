import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { crearListaSeguimientoDePrueba, trasladoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import { SeguimientoPage } from './SeguimientoPage'

const SESION: Sesion = { idUsuario: 7, usuario: 'coord.prueba', nombre: 'COORDINADOR PRUEBA', role: 'coordinador', area: null, allowedApps: [] }
const VIN = 'LVTDD24B6VDX00231'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:03:00Z'))
})
afterEach(() => vi.useRealTimers())

const traslado = () => trasladoDePrueba({ idOrden: 1, vin: VIN, etapa: 'en_camino', salidaRegistrada: '2026-10-15T12:40:00Z' })
/** Una puerta que se abre a mano para controlar cuándo contesta el servidor falso. */
function puerta() {
  let abrir: () => void = () => undefined
  const espera = new Promise<void>((resolver) => (abrir = resolver))
  return { espera, abrir }
}
const esqueleto = () => screen.queryByText('Cargando los traslados…')
/** El dibujo del esqueleto (barras que laten), no solo el aviso de texto. */
const hayDibujo = () => document.querySelector('.animate-pulse') !== null
/** La barra de pestañas dibujada (mide 44 px de alto, `h-11`; los campos de arriba usan `min-h-11`). */
const pestanasDibujadas = () => document.querySelectorAll('.h-11').length
/** El lugar reservado para el selector de destino, que solo existe cuando ya llegaron los traslados. */
const lugarDelDestino = () => document.querySelector('.animate-pulse[class~="md:w-[360px]"]')
const tabla = () => screen.queryByRole('region', { name: 'Tabla de vehículos' })

describe('esqueleto de la lista', () => {
  it('en la primera carga se ve el esqueleto, con el filtro por fecha y el buscador a la vista, y ninguna tabla ni pestañas', () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    m.estado.puerta = puerta().espera
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)

    expect(esqueleto()).toBeInTheDocument()
    expect(hayDibujo()).toBe(true) // es el dibujo, no solo un texto
    expect(pestanasDibujadas()).toBe(1) // y ya reserva la barra de pestañas
    expect(lugarDelDestino()).not.toBeNull() // y el lugar del selector de destino
    // Es un aviso de estado (junto al «Actualizando…» de arriba), para quien usa un lector de pantalla.
    expect(screen.getAllByRole('status').map((aviso) => aviso.textContent)).toContain('Cargando los traslados…')
    expect(tabla()).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtrar por etapa' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Fecha:/ })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar vehículo' })).toBeInTheDocument()
  })

  it('al llegar la lista el esqueleto desaparece y aparece la tabla', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    const p = puerta()
    m.estado.puerta = p.espera
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    expect(esqueleto()).toBeInTheDocument()

    p.abrir()

    expect(await screen.findByRole('region', { name: 'Tabla de vehículos' })).toBeInTheDocument()
    expect(esqueleto()).not.toBeInTheDocument()
    expect(hayDibujo()).toBe(false) // no queda ninguna barra: ni el esqueleto ni el lugar del destino
    expect(lugarDelDestino()).toBeNull()
    expect(screen.getByRole('group', { name: 'Filtrar por etapa' })).toBeInTheDocument()
  })

  it('si la primera carga falla, el esqueleto se va y queda el aviso (no se queda cargando para siempre)', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    m.estado.fallo = new Error('boom')
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)

    await waitFor(() => expect(esqueleto()).not.toBeInTheDocument())
    expect(screen.getByText('No se pudieron traer los traslados.')).toBeInTheDocument()
  })

  it('al aplicar otra fecha vuelve el esqueleto (en vez de dejar los traslados de la fecha anterior) y se va al llegar', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    await screen.findByRole('region', { name: 'Tabla de vehículos' })
    expect(esqueleto()).not.toBeInTheDocument()

    const p = puerta()
    m.estado.puerta = p.espera
    await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Ayer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(esqueleto()).toBeInTheDocument()
    expect(tabla()).not.toBeInTheDocument()

    p.abrir()
    await waitFor(() => expect(esqueleto()).not.toBeInTheDocument())
  })

  it('«Actualizar» NO vuelve al esqueleto: sigue mostrando lo que había mientras llega lo nuevo', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    await screen.findByRole('region', { name: 'Tabla de vehículos' })

    const p = puerta()
    m.estado.puerta = p.espera
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled()
    expect(esqueleto()).not.toBeInTheDocument()
    expect(tabla()).toBeInTheDocument()
    p.abrir()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualizar' })).toBeEnabled())
  })

  it('un día sin traslados no deja el esqueleto: dice que no hay', async () => {
    const m = crearListaSeguimientoDePrueba([])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)

    expect(await screen.findByText(/No hay traslados en camino ni entregados en esta fecha/)).toBeInTheDocument()
    expect(esqueleto()).not.toBeInTheDocument()
  })

  it('cargando no tiene violaciones de accesibilidad', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    m.estado.puerta = puerta().espera
    const { container } = render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('esqueleto de la consulta masiva', () => {
  const consultar = async (texto: string) => {
    await userEvent.click(screen.getByRole('textbox', { name: 'VIN a consultar' }))
    await userEvent.paste(texto)
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }))
  }

  it('mientras llega el primer resultado se ve el esqueleto y se va al llegar', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    await screen.findByRole('region', { name: 'Tabla de vehículos' })
    await userEvent.click(screen.getByRole('button', { name: 'Consulta masiva de VIN' }))
    expect(screen.queryByText('Consultando los VIN…')).not.toBeInTheDocument() // antes de consultar, nada

    const p = puerta()
    m.estado.puertaConsulta = p.espera
    await consultar(VIN)

    expect(screen.getByText('Consultando los VIN…')).toBeInTheDocument()
    p.abrir()
    expect(await screen.findByText(/1 VIN consultado/)).toBeInTheDocument()
    expect(screen.queryByText('Consultando los VIN…')).not.toBeInTheDocument()
  })

  it('con un resultado anterior a la vista, una consulta nueva lo conserva hasta que llegue el nuevo (sin esqueleto)', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    await screen.findByRole('region', { name: 'Tabla de vehículos' })
    await userEvent.click(screen.getByRole('button', { name: 'Consulta masiva de VIN' }))
    await consultar(VIN)
    await screen.findByText(/1 VIN consultado/)

    const p = puerta()
    m.estado.puertaConsulta = p.espera
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(screen.getByRole('button', { name: 'Consultando…' })).toBeDisabled()
    expect(screen.queryByText('Consultando los VIN…')).not.toBeInTheDocument()
    expect(screen.getByText(/1 VIN consultado/)).toBeInTheDocument()
    p.abrir()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Consultar' })).toBeEnabled())
  })

  it('si la consulta falla, el esqueleto se va y queda el aviso', async () => {
    const m = crearListaSeguimientoDePrueba([traslado()])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    await screen.findByRole('region', { name: 'Tabla de vehículos' })
    await userEvent.click(screen.getByRole('button', { name: 'Consulta masiva de VIN' }))
    m.estado.falloConsulta = new Error('boom')

    await consultar(VIN)

    await waitFor(() => expect(screen.queryByText('Consultando los VIN…')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeEnabled()
  })
})
