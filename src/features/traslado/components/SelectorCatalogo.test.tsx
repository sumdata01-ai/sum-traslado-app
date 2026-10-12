import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { OpcionCatalogo } from '../domain'
import { SelectorCatalogo } from './SelectorCatalogo'

const placas: OpcionCatalogo[] = [
  { id: 1, nombre: 'EEB577', estado: 'en_uso' },
  { id: 2, nombre: 'EEB578', estado: 'disponible' },
  { id: 3, nombre: 'EEB579', estado: 'disponible' },
  { id: 4, nombre: 'PR-045', estado: 'disponible' },
  { id: 5, nombre: 'ZZZ900', estado: 'en_reparacion' },
]

function montar(extra: Partial<React.ComponentProps<typeof SelectorCatalogo>> = {}) {
  const onElegir = vi.fn()
  const vista = render(<SelectorCatalogo etiqueta="Placa rotativa" opciones={placas} valor={null} onElegir={onElegir} {...extra} />)
  return { onElegir, ...vista, campo: () => screen.getByRole('combobox', { name: 'Placa rotativa' }) }
}

/** Un selector que recuerda lo elegido, como en la home. */
function ConEstado({ inicial = null }: { inicial?: number | null }) {
  const [valor, setValor] = useState<number | null>(inicial)
  return <SelectorCatalogo etiqueta="Placa rotativa" opciones={placas} valor={valor} onElegir={(o) => setValor(o.id)} />
}

describe('AC1 · filtrar por código con una lista de 224 px como máximo', () => {
  it('al tocar el campo se abre la lista con todas las opciones', async () => {
    const m = montar()
    await userEvent.click(m.campo())
    expect(screen.getAllByRole('option')).toHaveLength(5)
    expect(m.campo()).toHaveAttribute('aria-expanded', 'true')
  })

  it('escribir filtra por el código, sin importar mayúsculas ni separadores', async () => {
    const m = montar()
    await userEvent.type(m.campo(), 'eeb57')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['EEB577 · afuera', 'EEB578', 'EEB579'])

    await userEvent.clear(m.campo())
    await userEvent.type(m.campo(), 'pr045')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['PR-045'])
  })

  it('escribir «afuera» NO lista media flota: se filtra por el código, no por el rótulo', async () => {
    const m = montar()
    await userEvent.type(m.campo(), 'afuera')
    expect(screen.queryByRole('option', { name: /EEB577/ })).not.toBeInTheDocument()
    expect(screen.getByText('Ninguna coincide con «afuera».')).toBeInTheDocument()
  })

  it('la lista tiene una altura máxima de 224 px (max-h-56) y se desliza', async () => {
    const m = montar()
    await userEvent.click(m.campo())
    const lista = screen.getByRole('listbox')
    expect(lista).toHaveClass('max-h-56', 'overflow-y-auto')
  })

  it('sin coincidencias dice qué se buscó, con una fila que no se puede elegir', async () => {
    const m = montar()
    await userEvent.type(m.campo(), 'NOEXISTE')
    const fila = screen.getByRole('option')
    expect(fila).toHaveTextContent('Ninguna coincide con «NOEXISTE».')
    expect(fila).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(fila)
    expect(m.onElegir).not.toHaveBeenCalled()
  })

  it('el campo mide 16 px y pide mayúsculas sin autocorrección: Safari no amplía la página y un código no es una palabra', () => {
    const m = montar()
    expect(m.campo()).toHaveClass('text-base')
    expect(m.campo()).toHaveAttribute('autocapitalize', 'characters')
    expect(m.campo()).toHaveAttribute('autocorrect', 'off')
    expect(m.campo()).toHaveAttribute('spellcheck', 'false')
  })
})

describe('AC2 · el estado es texto, no color', () => {
  it('una placa en uso dice «afuera»; una disponible, nada; otro estado, tal cual', async () => {
    const m = montar()
    await userEvent.click(m.campo())
    const textos = screen.getAllByRole('option').map((o) => o.textContent)
    expect(textos).toContain('EEB577 · afuera')
    expect(textos).toContain('EEB578')
    expect(textos).toContain('ZZZ900 · en_reparacion')
  })

  it('las opciones no dependen del color para decir el estado', async () => {
    const m = montar()
    await userEvent.click(m.campo())
    const enUso = screen.getByRole('option', { name: 'EEB577 · afuera' })
    expect(enUso.className).not.toMatch(/danger|warning|success/)
  })
})

describe('elegir', () => {
  it('tocar una opción la elige y cierra la lista', async () => {
    const m = montar()
    await userEvent.click(m.campo())
    await userEvent.click(screen.getByRole('option', { name: 'EEB578' }))
    expect(m.onElegir).toHaveBeenCalledWith(placas[1])
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('al elegir, el campo pasa a mostrar la opción en solo lectura', async () => {
    render(<ConEstado />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'EEB579' }))
    expect(screen.getByText('EEB579')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('la opción elegida queda marcada al volver a abrir con el lápiz', async () => {
    render(<ConEstado inicial={2} />)
    await userEvent.click(screen.getByRole('button', { name: 'Editar Placa rotativa' }))
    expect(screen.getByRole('option', { name: 'EEB578' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'EEB579' })).toHaveAttribute('aria-selected', 'false')
  })

  it('con el teclado: flechas para moverse, Intro para elegir y Escape para cerrar', async () => {
    const m = montar()
    await userEvent.click(m.campo())
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(m.onElegir).toHaveBeenCalledWith(placas[2])

    await userEvent.click(m.campo())
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('Intro con el filtro puesto elige la primera que coincide', async () => {
    const m = montar()
    await userEvent.type(m.campo(), '579{Enter}')
    expect(m.onElegir).toHaveBeenCalledWith(placas[2])
  })

  it('al salir del campo sin elegir, la lista se cierra y no se elige nada', async () => {
    const m = montar()
    await userEvent.click(m.campo())
    await userEvent.tab()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(m.onElegir).not.toHaveBeenCalled()
  })

  it('deshabilitado no abre', async () => {
    const m = montar({ disabled: true })
    await userEvent.click(m.campo())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('O-04b · el lápiz para corregir', () => {
  const lapiz = () => screen.getByRole('button', { name: 'Editar Placa rotativa' })

  it('AC1 · sin elegir no hay lápiz: es el selector', () => {
    render(<ConEstado />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('AC2 · elegida una opción, el campo es de solo lectura con la elección y su estado en texto, y un lápiz al costado', () => {
    render(<ConEstado inicial={1} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    const grupo = screen.getByRole('group', { name: 'Placa rotativa' })
    expect(within(grupo).getByText('EEB577 · afuera')).toBeInTheDocument()
    expect(within(grupo).getByRole('button', { name: 'Editar Placa rotativa' })).toBeInTheDocument()
  })

  it('AC2 · al elegir, el foco pasa al lápiz (quien navega con teclado o lector no se pierde)', async () => {
    render(<ConEstado />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'EEB578' }))
    expect(lapiz()).toHaveFocus()
  })

  it('AC3 · tocar el lápiz abre el selector con el foco puesto y la lista abierta', async () => {
    render(<ConEstado inicial={1} />)
    await userEvent.click(lapiz())

    const campo = screen.getByRole('combobox', { name: 'Placa rotativa' })
    expect(campo).toHaveFocus()
    expect(campo).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('option')).toHaveLength(5)
    expect(campo).toHaveAttribute('placeholder', 'Ahora: EEB577 · afuera') // dice qué había, sin pisarlo
    expect(screen.queryByRole('button', { name: 'Editar Placa rotativa' })).not.toBeInTheDocument()
  })

  it('AC4 · elegir otra deja la nueva en solo lectura y el lápiz sigue ahí, las veces que haga falta', async () => {
    render(<ConEstado inicial={1} />)
    for (const [nombre, texto] of [
      ['EEB578', 'EEB578'],
      ['PR-045', 'PR-045'],
      ['ZZZ900 · en_reparacion', 'ZZZ900 · en_reparacion'],
    ] as const) {
      await userEvent.click(lapiz())
      await userEvent.click(screen.getByRole('option', { name: nombre }))
      expect(screen.getByText(texto)).toBeInTheDocument()
      expect(lapiz()).toBeInTheDocument()
    }
  })

  it('AC5 · salir con Escape sin elegir conserva lo anterior, y el foco vuelve al lápiz', async () => {
    render(<ConEstado inicial={2} />)
    await userEvent.click(lapiz())
    await userEvent.keyboard('{Escape}')

    expect(screen.getByText('EEB578')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(lapiz()).toHaveFocus()
  })

  it('AC5 · salir tocando fuera sin elegir conserva lo anterior y NO le roba el foco al campo tocado', async () => {
    render(
      <>
        <ConEstado inicial={2} />
        <input aria-label="Otro campo" />
      </>,
    )
    await userEvent.click(lapiz())
    await userEvent.click(screen.getByLabelText('Otro campo'))

    expect(screen.getByText('EEB578')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Otro campo')).toHaveFocus()
  })

  it('escribir un filtro y salir sin elegir tampoco cambia lo elegido', async () => {
    render(<ConEstado inicial={2} />)
    await userEvent.click(lapiz())
    await userEvent.type(screen.getByRole('combobox'), 'zzz')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('EEB578')).toBeInTheDocument()
  })

  it('el lápiz es un botón de al menos 44 px, alcanzable con Tab, que se activa con Intro', async () => {
    render(<ConEstado inicial={1} />)
    expect(lapiz()).toHaveClass('h-11', 'w-11')
    await userEvent.tab()
    expect(lapiz()).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('dentro de un formulario, tocar el lápiz NO lo envía (es un botón, no un «submit»)', async () => {
    const alEnviar = vi.fn((evento: React.FormEvent) => evento.preventDefault())
    render(
      <form onSubmit={alEnviar}>
        <ConEstado inicial={1} />
      </form>,
    )
    await userEvent.click(lapiz())
    expect(alEnviar).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('el icono no se anuncia: el botón se llama por su nombre', () => {
    render(<ConEstado inicial={1} />)
    expect(lapiz().querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('si lo elegido no está en las opciones (catálogo sin descargar), se muestra con el texto que se pasa y sigue pudiendo corregirse', async () => {
    render(<SelectorCatalogo etiqueta="Placa rotativa" opciones={[]} valor={99} textoValor="OLD123" onElegir={() => undefined} />)
    expect(screen.getByText('OLD123')).toBeInTheDocument()
    await userEvent.click(lapiz())
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('un campo deshabilitado no se puede corregir', () => {
    render(<SelectorCatalogo etiqueta="Placa rotativa" opciones={placas} valor={1} onElegir={() => undefined} disabled />)
    expect(lapiz()).toBeDisabled()
  })

  it('AC8 · sin violaciones de accesibilidad en lectura y corrigiendo', async () => {
    const vista = render(<ConEstado inicial={1} />)
    expect(await axe(vista.container)).toHaveNoViolations()
    await userEvent.click(lapiz())
    expect(await axe(vista.container)).toHaveNoViolations()
  })
})

describe('sin opciones', () => {
  it('explica por qué, en vez de mostrar una lista muda', async () => {
    const m = montar({ opciones: [], textoSinOpciones: 'Las placas todavía no se descargaron. Conéctate una vez.' })
    expect(screen.getByText('Las placas todavía no se descargaron. Conéctate una vez.')).toBeInTheDocument()
    await userEvent.click(m.campo())
    const lista = screen.getByRole('listbox')
    expect(within(lista).getByRole('option')).toHaveTextContent('Las placas todavía no se descargaron')
  })
})

describe('accesibilidad', () => {
  it('sin violaciones: cerrado, abierto, filtrado y sin coincidencias', async () => {
    const m = montar()
    expect(await axe(m.container)).toHaveNoViolations()
    await userEvent.click(m.campo())
    expect(await axe(m.container)).toHaveNoViolations()
    await userEvent.type(m.campo(), 'eeb57')
    expect(await axe(m.container)).toHaveNoViolations()
    await userEvent.clear(m.campo())
    await userEvent.type(m.campo(), 'NOEXISTE')
    expect(await axe(m.container)).toHaveNoViolations()
  })
})
