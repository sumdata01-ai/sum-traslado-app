import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sesion } from '@/core/auth'
import { crearListaSeguimientoDePrueba, trasladoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import type { TrasladoSeguimiento } from '@/features/seguimiento/domain'
import { SeguimientoPage } from './SeguimientoPage'

const SESION: Sesion = { idUsuario: 7, usuario: 'coord.prueba', nombre: 'COORDINADOR PRUEBA', role: 'coordinador', area: null, allowedApps: [] }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:03:00Z'))
})
afterEach(() => vi.useRealTimers())

const hoy = '2026-10-15T12:40:00Z'
/** Dos vehículos a la vista (Sede Norte y Sede Sur) y tres de destinos que no se muestran, de distintas etapas. */
const traslados = (): TrasladoSeguimiento[] => [
  trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000N00001', destino: 'Sede Norte', etapa: 'en_camino', salidaRegistrada: hoy }),
  trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000S00002', destino: 'Sede Sur', etapa: 'entregado', salidaRegistrada: hoy, entregadoEn: '2026-10-15T15:00:00Z' }),
  trasladoDePrueba({ idOrden: 3, vin: 'TESTVIN0000P00003', destino: 'PLANETA', etapa: 'en_camino', salidaRegistrada: hoy }),
  trasladoDePrueba({ idOrden: 4, vin: 'TESTVIN0000T00004', destino: 'Satelital', etapa: 'en_camino', salidaRegistrada: hoy }),
  trasladoDePrueba({ idOrden: 5, vin: 'TESTVIN0000T00005', destino: 'SATELITAL', etapa: 'entregado', salidaRegistrada: hoy, entregadoEn: '2026-10-15T15:00:00Z' }),
]

async function montar(lista: readonly TrasladoSeguimiento[] = traslados()) {
  const m = crearListaSeguimientoDePrueba(lista)
  render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
  await screen.findByRole('region', { name: /Tabla de vehículos/ }).catch(() => undefined)
  return m
}

/** Los últimos 6 caracteres del VIN de cada vehículo de la tabla, en el orden en que se ven. */
const filas = () =>
  within(screen.getByRole('region', { name: 'Tabla de vehículos' }))
    .getAllByRole('rowgroup')
    .filter((g) => g.tagName === 'TBODY')
    .map((g) => /VIN (\w{17})/.exec(g.textContent ?? '')?.[1]?.slice(-6))
const pestanas = () => within(screen.getByRole('group', { name: 'Filtrar por etapa' })).getAllByRole('button').map((b) => b.textContent)

describe('destinos que no se muestran (PLANETA y SATELITAL)', () => {
  it('sus vehículos no aparecen en la lista, sea cual sea su etapa', async () => {
    await montar()
    expect(filas()).toEqual(['N00001', 'S00002'])
    expect(screen.queryByText(/P00003|T00004|T00005/)).not.toBeInTheDocument()
    expect(screen.queryByText('PLANETA')).not.toBeInTheDocument()
    expect(screen.queryByText(/satelital/i)).not.toBeInTheDocument()
  })

  it('tampoco cuentan en las pestañas: los números son los de lo que se ve', async () => {
    await montar()
    expect(pestanas()).toEqual(['Todos (2)', 'En camino (1)', 'Entregados (1)'])
  })

  it('tampoco están en la lista del teléfono', async () => {
    await montar()
    const movil = screen.getByRole('list', { name: 'Lista de vehículos' })
    expect(within(movil).getAllByRole('listitem')).toHaveLength(2)
    expect(movil).not.toHaveTextContent(/PLANETA|satelital/i)
  })

  it('no figuran en el selector de destino', async () => {
    await montar()
    const selector = screen.getByRole('combobox', { name: 'Destino' })
    const opciones = within(selector).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Todos los destinos', 'Sede Norte', 'Sede Sur'])
  })

  it('si solo queda un destino a la vista, el selector no se ofrece', async () => {
    await montar([
      trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000N00001', destino: 'Sede Norte', etapa: 'en_camino', salidaRegistrada: hoy }),
      trasladoDePrueba({ idOrden: 3, vin: 'TESTVIN0000P00003', destino: 'PLANETA', etapa: 'en_camino', salidaRegistrada: hoy }),
    ])
    expect(screen.queryByRole('combobox', { name: 'Destino' })).not.toBeInTheDocument()
    expect(filas()).toEqual(['N00001'])
  })

  it('el buscador no los encuentra: buscar «planeta» o «satelital» no trae nada', async () => {
    await montar()
    const buscador = screen.getByRole('searchbox', { name: 'Buscar vehículo' })

    await userEvent.type(buscador, 'planeta')
    expect(screen.getByText('Ningún vehículo coincide con lo que buscas.')).toBeInTheDocument()

    await userEvent.clear(buscador)
    await userEvent.type(buscador, 'satelital')
    expect(screen.getByText('Ningún vehículo coincide con lo que buscas.')).toBeInTheDocument()
  })

  it('buscar por el VIN de uno de ellos tampoco lo muestra', async () => {
    await montar()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar vehículo' }), 'P00003')
    expect(screen.getByText('Ningún vehículo coincide con lo que buscas.')).toBeInTheDocument()
  })

  it('si todo lo que llega es de esos destinos, dice que no hay traslados (no deja una tabla vacía ni se queda cargando)', async () => {
    const m = crearListaSeguimientoDePrueba([
      trasladoDePrueba({ idOrden: 3, vin: 'TESTVIN0000P00003', destino: 'PLANETA', etapa: 'en_camino', salidaRegistrada: hoy }),
      trasladoDePrueba({ idOrden: 4, vin: 'TESTVIN0000T00004', destino: 'Satelital', etapa: 'entregado', salidaRegistrada: hoy, entregadoEn: hoy }),
    ])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)

    expect(await screen.findByText('No hay traslados en camino ni entregados en esta fecha: Hoy.')).toBeInTheDocument()
    expect(screen.queryByText('Cargando los traslados…')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tabla de vehículos' })).not.toBeInTheDocument()
  })

  it('los destinos parecidos pero distintos sí se muestran (se compara el nombre entero)', async () => {
    await montar([
      trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000N00001', destino: 'Sede Norte', etapa: 'en_camino', salidaRegistrada: hoy }),
      trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000X00002', destino: 'Sede Satelital Norte', etapa: 'en_camino', salidaRegistrada: hoy }),
      trasladoDePrueba({ idOrden: 3, vin: 'TESTVIN0000X00003', destino: 'Planeta Sur', etapa: 'en_camino', salidaRegistrada: hoy }),
    ])
    expect(filas()).toHaveLength(3)
  })

  it('un traslado sin destino sigue a la vista', async () => {
    await montar([trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000N00001', destino: null, etapa: 'en_camino', salidaRegistrada: hoy })])
    expect(filas()).toEqual(['N00001'])
  })
})
