/** O-02 en la home: «Comenzar despacho», «Soltar» y lo que ve el operario en cada caso. */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaConServidor, ordenRemota, sinFotos } from '@/features/traslado/data/testing/fakes'
import type { OrdenRemota } from '@/features/traslado/domain'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }

afterEach(() => vi.restoreAllMocks())

async function montar(inicial: OrdenRemota[] = [ordenRemota(1, { vin: 'VIN-UNO' }), ordenRemota(2, { vin: 'VIN-DOS' })]) {
  const m = crearListaConServidor(inicial)
  const vista = render(<HomePage sesion={sesion} lista={m.lista} catalogo={crearCatalogoDePrueba().catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
  await screen.findByText(inicial[0]?.vin ?? '')
  return { ...m, ...vista }
}

const seccion = (nombre: RegExp) => within(screen.getByRole('heading', { name: nombre }).closest('section') as HTMLElement)
const tarjetaDe = (vin: string) => screen.getByText(vin).closest('li') as HTMLElement

describe('AC1 · tomar del pool solo con el botón', () => {
  it('cada tarjeta del pool tiene «Comenzar despacho», con el VIN en su nombre accesible', async () => {
    await montar()
    expect(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comenzar despacho VIN-DOS' })).toBeInTheDocument()
  })

  it('tocar el resto de la tarjeta no la toma', async () => {
    const m = await montar()
    await userEvent.click(screen.getByText('VIN-UNO'))
    await userEvent.click(tarjetaDe('VIN-UNO'))
    expect(m.servidor.api.tomarOrden).not.toHaveBeenCalled()
  })

  it('con el botón, la orden pasa a «Mis traslados» y se avisa en verde', async () => {
    await montar()

    await userEvent.click(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' }))

    expect(await seccion(/Mis traslados/).findByText('VIN-UNO')).toBeInTheDocument()
    expect(seccion(/Disponibles hoy/).queryByText('VIN-UNO')).not.toBeInTheDocument()
    expect(screen.getByText('La orden es tuya.').closest('[role="status"]')).toHaveClass('bg-success-soft')
  })

  it('una orden propia no tiene «Comenzar despacho»', async () => {
    await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' }))
    await seccion(/Mis traslados/).findByText('VIN-UNO')
    expect(screen.queryByRole('button', { name: 'Comenzar despacho VIN-UNO' })).not.toBeInTheDocument()
  })

  it('mientras se toma, los botones de esa tarjeta se deshabilitan', async () => {
    const m = await montar()
    let soltarRespuesta: () => void = () => undefined
    const original = m.servidor.api.tomarOrden
    m.servidor.api.tomarOrden = async (id) => {
      await new Promise<void>((r) => (soltarRespuesta = r))
      return original(id)
    }

    await userEvent.click(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' }))
    expect(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Comenzar despacho VIN-DOS' })).toBeEnabled()

    soltarRespuesta()
    expect(await seccion(/Mis traslados/).findByText('VIN-UNO')).toBeInTheDocument()
  })
})

describe('AC2 · otra persona se adelantó', () => {
  it('se dice quién, en rojo, y la orden sale del pool', async () => {
    const m = await montar()
    m.servidor.tomarPorOtro(1, 'Ana Pérez')

    await userEvent.click(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La tomó Ana Pérez')
    await waitFor(() => expect(screen.queryByText('VIN-UNO')).not.toBeInTheDocument())
  })
})

describe('AC4 · tomar sin señal', () => {
  it('queda en «Mis traslados» con el aviso en la tarjeta y un mensaje en ámbar', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true

    await userEvent.click(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' }))

    const mia = await seccion(/Mis traslados/).findByText('VIN-UNO')
    expect(within(mia.closest('li') as HTMLElement).getByText('Tomada sin señal: se registra cuando haya conexión.')).toBeInTheDocument()
    const mensaje = screen.getAllByText('Tomada sin señal: se registra cuando haya conexión.').find((el) => el.closest('[role="status"]'))
    expect(mensaje?.closest('[role="status"]')).toHaveClass('bg-warning-soft')
  })
})

describe('soltar', () => {
  async function conUnaTomada(fotos = 0) {
    const m = await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' }))
    await seccion(/Mis traslados/).findByText('VIN-UNO')
    if (fotos > 0) {
      m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: fotos, subidas: 0 } })
      await m.lista.recalcular()
      await screen.findByText(`Cargando fotos (${fotos}/6)`)
    }
    return m
  }

  it('sin fotos, no pregunta: vuelve al pool y se avisa', async () => {
    const m = await conUnaTomada()
    const confirmar = vi.spyOn(window, 'confirm')

    await userEvent.click(screen.getByRole('button', { name: 'Soltar VIN-UNO' }))

    expect(await seccion(/Disponibles hoy/).findByText('VIN-UNO')).toBeInTheDocument()
    expect(screen.getByText('Devuelta al pool.')).toBeInTheDocument()
    expect(confirmar).not.toHaveBeenCalled()
    expect(m.servidor.ordenes.get(1)?.conductorAsignado).toBeNull()
  })

  it('AC6 · con fotos, pregunta cuántas son; si cancela, no pasa nada', async () => {
    const m = await conUnaTomada(3)
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await userEvent.click(screen.getByRole('button', { name: 'Soltar VIN-UNO' }))

    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('Ya tomaste 3 fotos de este auto'))
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('se borran de este teléfono'))
    expect(m.servidor.api.soltarOrden).not.toHaveBeenCalled()
    expect(m.fotos.borradas).toEqual([])
    expect(seccion(/Mis traslados/).getByText('VIN-UNO')).toBeInTheDocument()
  })

  it('AC6 · con fotos y confirmando, se suelta y las fotos se borran', async () => {
    const m = await conUnaTomada(1)
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)

    await userEvent.click(screen.getByRole('button', { name: 'Soltar VIN-UNO' }))

    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('Ya tomaste 1 foto de este auto'))
    expect(await seccion(/Disponibles hoy/).findByText('VIN-UNO')).toBeInTheDocument()
    expect(m.fotos.borradas).toEqual([1])
  })

  it('AC5 · sin red, se avisa en rojo y la orden sigue siendo propia', async () => {
    const m = await conUnaTomada()
    m.servidor.estado.sinRed = true

    await userEvent.click(screen.getByRole('button', { name: 'Soltar VIN-UNO' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión: no se pudo devolver al pool.')
    expect(seccion(/Mis traslados/).getByText('VIN-UNO')).toBeInTheDocument()
  })

  it('AC7 · una orden asignada por el supervisor no tiene «Soltar»', async () => {
    await montar([ordenRemota(5, { vin: 'VIN-ASIGNADA', conductorAsignado: { id: 7, username: 'usuario.prueba', nombreCompleto: null } })])
    expect(seccion(/Mis traslados/).getByText('VIN-ASIGNADA')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Soltar/ })).not.toBeInTheDocument()
  })
})

describe('accesibilidad', () => {
  it('sin violaciones con tarjetas con botones, una toma pendiente y un mensaje', async () => {
    const m = await montar()
    m.servidor.estado.sinRed = true
    await userEvent.click(screen.getByRole('button', { name: 'Comenzar despacho VIN-UNO' }))
    await seccion(/Mis traslados/).findByText('VIN-UNO')

    expect(await axe(m.container)).toHaveNoViolations()
  })
})
