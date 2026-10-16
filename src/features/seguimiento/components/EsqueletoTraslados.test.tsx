import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { EsqueletoTraslados } from './EsqueletoTraslados'

describe('EsqueletoTraslados', () => {
  it('avisa con un mensaje de estado, que es lo único que oye el lector de pantalla', () => {
    render(<EsqueletoTraslados mensaje="Cargando los traslados…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando los traslados…')
    expect(screen.getAllByText('Cargando los traslados…')).toHaveLength(1)
  })

  it('el dibujo está oculto para el lector de pantalla y no tiene nada que se pueda enfocar o tocar', () => {
    const { container } = render(<EsqueletoTraslados mensaje="Cargando…" />)
    const dibujo = container.querySelector('[aria-hidden="true"]')
    expect(dibujo).not.toBeNull()
    // Todo lo que dibuja está dentro de lo oculto: fuera de él solo está el mensaje.
    expect(container.querySelectorAll('[role="status"] > *:not([aria-hidden="true"]):not(.sr-only)')).toHaveLength(0)
    expect(dibujo!.querySelectorAll('button, a, input, select, textarea, [tabindex]')).toHaveLength(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument() // no se confunde con la tabla de verdad
  })

  it('late (animate-pulse) pero no se anima si la persona pidió menos movimiento', () => {
    const { container } = render(<EsqueletoTraslados mensaje="Cargando…" />)
    const animado = container.querySelector('.animate-pulse')
    expect(animado).not.toBeNull()
    expect(animado).toHaveClass('motion-reduce:animate-none')
  })

  it('dibuja tantos vehículos como se pida (seis por omisión) en la lista del teléfono', () => {
    const { container, rerender } = render(<EsqueletoTraslados mensaje="Cargando…" />)
    expect(container.querySelectorAll('ul > li')).toHaveLength(6)
    rerender(<EsqueletoTraslados mensaje="Cargando…" filas={3} />)
    expect(container.querySelectorAll('ul > li')).toHaveLength(3)
  })

  it('la barra de pestañas solo se dibuja si se pide', () => {
    const { container, rerender } = render(<EsqueletoTraslados mensaje="Cargando…" />)
    const sinPestanas = container.querySelectorAll('.h-11').length
    rerender(<EsqueletoTraslados mensaje="Cargando…" conPestanas />)
    expect(container.querySelectorAll('.h-11').length).toBe(sinPestanas + 1)
  })

  it('solo usa los colores de la paleta (nada de colores sueltos)', () => {
    const { container } = render(<EsqueletoTraslados mensaje="Cargando…" conPestanas />)
    const clases = [...container.querySelectorAll('[class]')].map((el) => el.getAttribute('class')).join(' ')
    expect(clases).not.toMatch(/\b(bg|border|text)-(?:\[|gray|slate|zinc|neutral|stone|red|blue|green|black|white)/)
    expect(clases).toContain('bg-line')
  })

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<EsqueletoTraslados mensaje="Cargando los traslados…" conPestanas />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
