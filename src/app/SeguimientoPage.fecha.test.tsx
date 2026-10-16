import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { crearListaSeguimientoDePrueba, trasladoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import type { TrasladoSeguimiento } from '@/features/seguimiento/domain'
import { SeguimientoPage } from './SeguimientoPage'

const SESION: Sesion = { idUsuario: 7, usuario: 'coord.prueba', nombre: 'COORDINADOR PRUEBA', role: 'coordinador', area: null, allowedApps: [] }

// 15 oct 2026, 12:03 UTC = 07:03 en Lima: hoy es 2026-10-15 y ayer, 2026-10-14.
const HOY = { desde: '2026-10-15', hasta: '2026-10-15' }
const AYER = { desde: '2026-10-14', hasta: '2026-10-14' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:03:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

const delHoy = (): TrasladoSeguimiento[] => [
  trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000H00001', etapa: 'en_camino', salidaRegistrada: '2026-10-15T11:00:00Z' }),
  trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000H00002', etapa: 'entregado', salidaRegistrada: '2026-10-15T09:00:00Z', entregadoEn: '2026-10-15T11:30:00Z' }),
]
const deAyer = (): TrasladoSeguimiento[] => [
  trasladoDePrueba({ idOrden: 3, vin: 'TESTVIN0000A00003', etapa: 'entregado', salidaRegistrada: '2026-10-14T13:00:00Z', entregadoEn: '2026-10-14T16:00:00Z' }),
]

async function montar(traslados: readonly TrasladoSeguimiento[] = delHoy()) {
  const m = crearListaSeguimientoDePrueba(traslados)
  render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
  await screen.findByRole('region', { name: 'Tabla de vehículos' })
  return {
    ...m,
    botonFecha: () => screen.getByRole('button', { name: /^Fecha:/ }),
    /** Los VIN (últimos 6) de la tabla, en el orden en que se ven. */
    filas: () =>
      within(screen.getByRole('region', { name: 'Tabla de vehículos' }))
        .getAllByRole('rowgroup')
        .filter((g) => g.tagName === 'TBODY')
        .map((g) => /VIN (\w{17})/.exec(g.textContent ?? '')?.[1]?.slice(-6)),
    /** Abre el filtro, elige la opción y pulsa «Aplicar». */
    aplicar: async (opcion: string) => {
      await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }))
      await userEvent.click(screen.getByRole('radio', { name: opcion }))
      await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    },
  }
}

describe('al abrir', () => {
  it('muestra lo de HOY: pide el rango de hoy (día de Lima) y rotula «Fecha: Hoy»', async () => {
    const m = await montar()
    expect(m.estado.rangos).toEqual([HOY])
    expect(m.botonFecha()).toHaveAccessibleName('Fecha: Hoy')
    expect(m.filas()).toEqual(['H00001', 'H00002']) // en camino arriba, entregado después
  })

  it('el filtro por fecha está a la vista junto al buscador', async () => {
    await montar()
    expect(screen.getByRole('searchbox', { name: 'Buscar vehículo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Fecha:/ })).toBeInTheDocument()
  })
})

describe('aplicar otra fecha', () => {
  it('elegir «Ayer» no pide nada; «Aplicar» pide el rango de ayer y muestra lo que llegue', async () => {
    const m = await montar()
    m.estado.traslados = deAyer()

    await userEvent.click(m.botonFecha())
    await userEvent.click(screen.getByRole('radio', { name: 'Ayer' }))
    expect(m.estado.rangos).toEqual([HOY]) // todavía nada

    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(m.filas()).toEqual(['A00003']))
    expect(m.estado.rangos).toEqual([HOY, AYER])
    expect(m.botonFecha()).toHaveAccessibleName('Fecha: Ayer')
    expect(screen.queryByRole('dialog', { name: 'Filtrar por fecha' })).not.toBeInTheDocument()
  })

  it('mientras llega el rango nuevo dice que carga, conserva el filtro y no muestra lo del día anterior', async () => {
    const m = await montar()
    let abrirPuerta: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrirPuerta = r))
    m.estado.traslados = deAyer()

    await m.aplicar('Ayer')

    expect(screen.getByText('Cargando los traslados…')).toBeInTheDocument()
    expect(m.botonFecha()).toHaveAccessibleName('Fecha: Ayer')
    expect(screen.queryByRole('region', { name: 'Tabla de vehículos' })).not.toBeInTheDocument()

    abrirPuerta()
    await waitFor(() => expect(m.filas()).toEqual(['A00003']))
    expect(screen.queryByText('Cargando los traslados…')).not.toBeInTheDocument()
  })

  it('con un rango propio rotula las fechas y pide justo ese rango', async () => {
    const m = await montar()
    await userEvent.click(m.botonFecha())
    await userEvent.click(screen.getByRole('radio', { name: 'Rango personalizado' }))
    await userEvent.clear(screen.getByLabelText('Desde'))
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-10')
    await userEvent.clear(screen.getByLabelText('Hasta'))
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-12')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(m.estado.rangos.at(-1)).toEqual({ desde: '2026-10-10', hasta: '2026-10-12' }))
    expect(m.botonFecha()).toHaveAccessibleName('Fecha: 10–12 oct 2026')
  })

  it('«Cancelar» no cambia nada ni pide nada', async () => {
    const m = await montar()
    await userEvent.click(m.botonFecha())
    await userEvent.click(screen.getByRole('radio', { name: 'Ayer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(m.estado.rangos).toEqual([HOY])
    expect(m.botonFecha()).toHaveAccessibleName('Fecha: Hoy')
    expect(m.filas()).toHaveLength(2)
  })

  it('«Actualizar» vuelve a pedir el rango elegido, no el de hoy', async () => {
    const m = await montar()
    m.estado.traslados = deAyer()
    await m.aplicar('Ayer')
    await waitFor(() => expect(m.filas()).toEqual(['A00003']))

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    await waitFor(() => expect(m.estado.rangos).toEqual([HOY, AYER, AYER]))
  })
})

describe('un día sin traslados', () => {
  it('lo dice con el día elegido, en vez de dejar una tabla vacía', async () => {
    const m = await montar()
    m.estado.traslados = []

    await m.aplicar('Ayer')

    expect(await screen.findByText('No hay traslados en camino ni entregados en esta fecha: Ayer.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tabla de vehículos' })).not.toBeInTheDocument()
    // El filtro sigue ahí para probar otro día.
    expect(m.botonFecha()).toBeInTheDocument()
  })
})

describe('consulta masiva de VIN', () => {
  it('no usa el filtro por fecha (es de cualquier fecha) y al volver a la lista conserva el rango', async () => {
    const m = await montar()
    m.estado.traslados = deAyer()
    await m.aplicar('Ayer')
    await waitFor(() => expect(m.filas()).toEqual(['A00003']))

    await userEvent.click(screen.getByRole('button', { name: 'Consulta masiva de VIN' }))
    expect(screen.queryByRole('button', { name: /^Fecha:/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Volver a mis vehículos' }))
    expect(m.botonFecha()).toHaveAccessibleName('Fecha: Ayer')
    expect(m.filas()).toEqual(['A00003'])
  })
})

describe('accesibilidad', () => {
  it('con el filtro abierto no tiene violaciones', async () => {
    const m = await montar()
    await userEvent.click(m.botonFecha())
    expect(await axe(document.body)).toHaveNoViolations()
  })
})
