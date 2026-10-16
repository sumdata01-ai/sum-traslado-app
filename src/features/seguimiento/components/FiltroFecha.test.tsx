import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { RangoFechas } from '../domain'
import { FiltroFecha } from './FiltroFecha'

const HOY = '2026-10-16'
const RANGO_HOY: RangoFechas = { desde: HOY, hasta: HOY }

function montar(opciones: { rango?: RangoFechas; resultado?: string | null } = {}) {
  const onAplicar = vi.fn<(rango: RangoFechas) => Promise<string | null>>(async () => opciones.resultado ?? null)
  const vista = render(
    <>
      <button type="button">Otro botón</button>
      <FiltroFecha rango={opciones.rango ?? RANGO_HOY} hoy={HOY} onAplicar={onAplicar} />
    </>,
  )
  return {
    onAplicar,
    ...vista,
    boton: () => screen.getByRole('button', { name: /^Fecha:/ }),
    panel: () => screen.getByRole('dialog', { name: 'Filtrar por fecha' }),
    opcion: (nombre: string) => within(screen.getByRole('dialog', { name: 'Filtrar por fecha' })).getByRole('radio', { name: nombre }),
    abrir: async () => userEvent.click(screen.getByRole('button', { name: /^Fecha:/ })),
  }
}

describe('el botón', () => {
  it('dice la fecha elegida: «Hoy» al abrir', () => {
    const m = montar()
    expect(m.boton()).toHaveAccessibleName('Fecha: Hoy')
  })

  it.each([
    [{ desde: '2026-10-15', hasta: '2026-10-15' }, 'Fecha: Ayer'],
    [{ desde: '2026-10-10', hasta: '2026-10-16' }, 'Fecha: Últimos 7 días'],
    [{ desde: '2026-09-17', hasta: '2026-10-16' }, 'Fecha: Últimos 30 días'],
    [{ desde: '2026-10-12', hasta: '2026-10-14' }, 'Fecha: 12–14 oct 2026'],
  ])('con %j dice «%s»', (rango, nombre) => {
    const m = montar({ rango })
    expect(m.boton()).toHaveAccessibleName(nombre)
  })

  it('está cerrado al empezar y avisa que abre un diálogo', () => {
    const m = montar()
    expect(m.boton()).toHaveAttribute('aria-expanded', 'false')
    expect(m.boton()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('el panel', () => {
  it('se abre con las cinco opciones y marca la que está aplicada, con el foco en ella', async () => {
    const m = montar()
    await m.abrir()

    expect(m.boton()).toHaveAttribute('aria-expanded', 'true')
    const nombres = within(m.panel()).getAllByRole('radio').map((r) => r.closest('label')?.textContent)
    expect(nombres).toEqual(['Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 30 días', 'Rango personalizado'])
    expect(m.opcion('Hoy')).toBeChecked()
    expect(m.opcion('Hoy')).toHaveFocus()
  })

  it('no ofrece «Todas las fechas»: el servidor acota lo que devuelve', async () => {
    const m = montar()
    await m.abrir()
    expect(within(m.panel()).queryByText('Todas las fechas')).not.toBeInTheDocument()
  })

  it('con un rango propio abre en «Rango personalizado» con sus fechas', async () => {
    const m = montar({ rango: { desde: '2026-10-12', hasta: '2026-10-14' } })
    await m.abrir()

    expect(m.opcion('Rango personalizado')).toBeChecked()
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-12')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-14')
  })

  it('las fechas solo aparecen con «Rango personalizado» y no dejan elegir días futuros', async () => {
    const m = montar()
    await m.abrir()
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument()

    await userEvent.click(m.opcion('Rango personalizado'))

    expect(screen.getByLabelText('Desde')).toHaveAttribute('max', HOY)
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('max', HOY)
  })
})

describe('Aplicar', () => {
  it('elegir una opción NO pide nada: solo Aplicar lo hace', async () => {
    const m = montar()
    await m.abrir()

    await userEvent.click(m.opcion('Ayer'))

    expect(m.onAplicar).not.toHaveBeenCalled()
  })

  it.each([
    ['Hoy', { desde: '2026-10-16', hasta: '2026-10-16' }],
    ['Ayer', { desde: '2026-10-15', hasta: '2026-10-15' }],
    ['Últimos 7 días', { desde: '2026-10-10', hasta: '2026-10-16' }],
    ['Últimos 30 días', { desde: '2026-09-17', hasta: '2026-10-16' }],
  ])('con «%s» pide ese rango y cierra, devolviendo el foco al botón', async (nombre, esperado) => {
    const m = montar({ rango: { desde: '2026-10-01', hasta: '2026-10-03' } })
    await m.abrir()

    await userEvent.click(m.opcion(nombre))
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(m.onAplicar).toHaveBeenCalledOnce()
    expect(m.onAplicar).toHaveBeenCalledWith(esperado)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(m.boton()).toHaveFocus()
  })

  it('con un rango personalizado pide justo las fechas escritas', async () => {
    const m = montar()
    await m.abrir()

    await userEvent.click(m.opcion('Rango personalizado'))
    await userEvent.clear(screen.getByLabelText('Desde'))
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-12')
    await userEvent.clear(screen.getByLabelText('Hasta'))
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-14')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(m.onAplicar).toHaveBeenCalledWith({ desde: '2026-10-12', hasta: '2026-10-14' })
  })

  it.each([
    ['con el inicio después del fin', '2026-10-14', '2026-10-12', 'La fecha de inicio no puede ser posterior a la de fin.'],
    ['con una fecha de fin futura', '2026-10-14', '2026-10-17', 'La fecha de fin no puede ser futura.'],
    ['de más de 90 días', '2026-07-01', '2026-10-16', 'El rango no puede pasar de 90 días.'],
  ])('un rango %s no se pide: lo dice y el panel sigue abierto', async (_caso, desde, hasta, mensaje) => {
    const m = montar()
    await m.abrir()
    await userEvent.click(m.opcion('Rango personalizado'))
    // `userEvent.type` no escribe en un campo `date` con una fecha fuera de `max`: se cambia el valor directamente.
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: desde } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: hasta } })

    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(m.onAplicar).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(mensaje)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('si el controlador la rechaza (el servidor diría 422), muestra el motivo y no cierra', async () => {
    const m = montar({ resultado: 'La fecha de fin no puede ser futura.' })
    await m.abrir()

    await userEvent.click(m.opcion('Ayer'))
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('La fecha de fin no puede ser futura.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('mientras espera la respuesta, Aplicar no se puede volver a tocar: no pide dos veces', async () => {
    let responder: (motivo: string | null) => void = () => undefined
    const onAplicar = vi.fn<(rango: RangoFechas) => Promise<string | null>>(() => new Promise((resolver) => (responder = resolver)))
    render(<FiltroFecha rango={RANGO_HOY} hoy={HOY} onAplicar={onAplicar} />)
    await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Ayer' }))

    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(onAplicar).toHaveBeenCalledOnce()
    responder(null)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('al elegir otra opción desaparece el aviso de error', async () => {
    const m = montar()
    await m.abrir()
    await userEvent.click(m.opcion('Rango personalizado'))
    await userEvent.clear(screen.getByLabelText('Desde'))
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await userEvent.click(m.opcion('Hoy'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('cerrar sin aplicar', () => {
  it('Cancelar cierra, no pide nada y devuelve el foco al botón', async () => {
    const m = montar()
    await m.abrir()
    await userEvent.click(m.opcion('Ayer'))

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(m.onAplicar).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(m.boton()).toHaveFocus()
  })

  it('Escape cierra, no pide nada y devuelve el foco al botón', async () => {
    const m = montar()
    await m.abrir()
    await userEvent.click(m.opcion('Ayer'))

    await userEvent.keyboard('{Escape}')

    expect(m.onAplicar).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(m.boton()).toHaveFocus()
  })

  it('tocar fuera cierra y no pide nada', async () => {
    const m = montar()
    await m.abrir()
    await userEvent.click(m.opcion('Ayer'))

    await userEvent.click(screen.getByRole('button', { name: 'Otro botón' }))

    expect(m.onAplicar).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('tocar dentro del panel NO lo cierra', async () => {
    const m = montar()
    await m.abrir()

    await userEvent.click(m.opcion('Ayer'))
    await userEvent.click(within(m.panel()).getByText('Fecha de registro'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('tocar el botón con el panel abierto lo cierra', async () => {
    const m = montar()
    await m.abrir()
    await userEvent.click(m.boton())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lo elegido y no aplicado se olvida: al volver a abrir muestra lo que está aplicado', async () => {
    const m = montar()
    await m.abrir()
    await userEvent.click(m.opcion('Últimos 30 días'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await m.abrir()

    expect(m.opcion('Hoy')).toBeChecked()
    expect(m.opcion('Últimos 30 días')).not.toBeChecked()
  })
})

describe('con el rango que cambia por fuera', () => {
  it('el botón sigue al rango aplicado y al volver a abrir muestra el nuevo', async () => {
    function Envoltorio() {
      const [rango, setRango] = useState<RangoFechas>(RANGO_HOY)
      return <FiltroFecha rango={rango} hoy={HOY} onAplicar={async (nuevo) => (setRango(nuevo), null)} />
    }
    render(<Envoltorio />)
    await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Ayer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(screen.getByRole('button', { name: /^Fecha:/ })).toHaveAccessibleName('Fecha: Ayer')

    await userEvent.click(screen.getByRole('button', { name: /^Fecha:/ }))
    expect(screen.getByRole('radio', { name: 'Ayer' })).toBeChecked()
  })
})

describe('accesibilidad', () => {
  it('abierto y con el rango personalizado no tiene violaciones', async () => {
    const m = montar({ rango: { desde: '2026-10-12', hasta: '2026-10-14' } })
    await m.abrir()
    expect(await axe(m.container)).toHaveNoViolations()
  })
})
