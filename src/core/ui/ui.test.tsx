import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { Banner, Button, Card, ProgressCounter, SectionHeader } from './index'

// jsdom no calcula estilos: estas pruebas comprueban que cada componente aplica las clases que
// mapean a los tokens (la equivalencia clase → valor la cubre tokens.test.ts y el build) y que
// el HTML es accesible. NO prueban la maquetación: ver «ancho de 360 px» al final.

describe('Button', () => {
  it('es type="button" por defecto, para no enviar formularios sin querer', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button')
  })

  it('usa peso 700, 15 px y radio de control (14)', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button')).toHaveClass('font-bold', 'text-[15px]', 'rounded-control', 'whitespace-nowrap')
  })

  it.each([
    ['primario', 'bg-primary'],
    ['secundario', 'border-line-strong'],
    ['peligro', 'bg-danger'],
  ] as const)('la variante %s usa %s', (variante, clase) => {
    render(<Button variante={variante}>x</Button>)
    expect(screen.getByRole('button')).toHaveClass(clase)
  })

  it('el tamaño compacto mide 32 px (h-8); el normal, al menos 44 px', () => {
    const { rerender } = render(<Button tamano="compacto">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-8')
    rerender(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveClass('min-h-11')
  })

  it('dispara onClick, y no si está deshabilitado', async () => {
    const alTocar = vi.fn()
    const { rerender } = render(<Button onClick={alTocar}>Enviar</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(alTocar).toHaveBeenCalledTimes(1)

    rerender(
      <Button onClick={alTocar} disabled>
        Enviar
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(alTocar).toHaveBeenCalledTimes(1)
  })

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(
      <>
        <Button>Primario</Button>
        <Button variante="secundario">Secundario</Button>
        <Button variante="peligro" tamano="compacto" disabled>
          Peligro
        </Button>
      </>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('Banner', () => {
  it.each([
    ['warning', 'bg-warning-soft', 'text-warning-ink', 'status'],
    ['success', 'bg-success-soft', 'text-success-ink', 'status'],
    ['danger', 'bg-danger-soft', 'text-danger-ink', 'alert'],
    ['info', 'bg-info-soft', 'text-info', 'status'],
  ] as const)('el tono %s usa %s y %s, y se anuncia como «%s»', (tono, fondo, texto, rol) => {
    render(<Banner tono={tono}>Mensaje</Banner>)
    const banner = screen.getByRole(rol)
    expect(banner).toHaveTextContent('Mensaje')
    expect(banner).toHaveClass(fondo, texto)
  })

  it('no es un modal: no bloquea ni toma el foco', () => {
    render(<Banner tono="warning">Sin conexión</Banner>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-modal')
  })

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(
      <>
        <Banner tono="warning">Sin conexión</Banner>
        <Banner tono="success">Listo para enviar</Banner>
        <Banner tono="danger">No se pudo guardar</Banner>
      </>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('Card', () => {
  it('lleva borde y no lleva sombra', () => {
    render(<Card data-testid="tarjeta">Orden</Card>)
    const tarjeta = screen.getByTestId('tarjeta')
    expect(tarjeta).toHaveClass('border', 'border-line', 'rounded-ficha', 'bg-surface')
    expect([...tarjeta.classList].filter((c) => c.startsWith('shadow'))).toEqual([])
  })

  it('acepta clases adicionales sin perder las base', () => {
    render(
      <Card data-testid="tarjeta" className="mt-2">
        x
      </Card>,
    )
    expect(screen.getByTestId('tarjeta')).toHaveClass('mt-2', 'border-line')
  })
})

describe('SectionHeader', () => {
  it('va en mayúsculas, 12 px y peso 800; el texto real no cambia', () => {
    render(<SectionHeader>Mis traslados</SectionHeader>)
    const encabezado = screen.getByRole('heading', { name: 'Mis traslados' })
    expect(encabezado).toHaveClass('uppercase', 'text-[12px]', 'font-extrabold', 'text-ink-2')
    expect(encabezado.textContent).toBe('Mis traslados')
  })

  it('muestra el contador en una píldora, también cuando es 0', () => {
    const { rerender } = render(<SectionHeader contador={3}>Disponibles hoy</SectionHeader>)
    expect(screen.getByText('3')).toHaveClass('rounded-chip')
    rerender(<SectionHeader contador={0}>Disponibles hoy</SectionHeader>)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('sin contador no dibuja la píldora', () => {
    render(<SectionHeader>Mis traslados</SectionHeader>)
    expect(screen.getByRole('heading').querySelector('.rounded-chip')).toBeNull()
  })

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<SectionHeader contador={2}>Mis traslados</SectionHeader>)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('ProgressCounter', () => {
  it('muestra solo los grupos con valor', () => {
    render(<ProgressCounter enviados={2} porEnviar={0} sinEmpezar={3} />)
    expect(screen.getByText('enviados')).toBeInTheDocument()
    expect(screen.getByText('sin empezar')).toBeInTheDocument()
    expect(screen.queryByText('por enviar')).not.toBeInTheDocument()
  })

  it('usa el singular con un solo enviado', () => {
    render(<ProgressCounter enviados={1} porEnviar={0} sinEmpezar={2} />)
    expect(screen.getByText('enviado')).toBeInTheDocument()
    expect(screen.queryByText('enviados')).not.toBeInTheDocument()
  })

  it('no dibuja nada si los tres grupos están en cero', () => {
    const { container } = render(<ProgressCounter enviados={0} porEnviar={0} sinEmpezar={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('cada cuadro mide 92 px, con el número a 28 px y la etiqueta a 11 px', () => {
    render(<ProgressCounter enviados={2} porEnviar={3} sinEmpezar={1} />)
    for (const numero of ['2', '3', '1']) {
      const cuadro = screen.getByText(numero).parentElement
      expect(cuadro).toHaveClass('h-[92px]', 'border-line', 'bg-surface', 'rounded-ficha')
      expect(screen.getByText(numero)).toHaveClass('text-[28px]', 'font-extrabold')
    }
    expect(screen.getByText('por enviar')).toHaveClass('text-[11px]')
  })

  it('el color de cada número sigue a la app: enviados success, por enviar warning-ink, sin empezar ink-3', () => {
    render(<ProgressCounter enviados={2} porEnviar={3} sinEmpezar={1} />)
    expect(screen.getByText('2')).toHaveClass('text-success')
    expect(screen.getByText('3')).toHaveClass('text-warning-ink')
    expect(screen.getByText('1')).toHaveClass('text-ink-3')
  })

  it('se anuncia como un grupo con nombre', () => {
    render(<ProgressCounter enviados={1} porEnviar={1} sinEmpezar={1} />)
    expect(screen.getByRole('group', { name: 'Avance de traslados' })).toBeInTheDocument()
  })

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<ProgressCounter enviados={2} porEnviar={3} sinEmpezar={1} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('ancho de 360 px (sin desborde)', () => {
  // jsdom no calcula la maquetación. Esto solo comprueba que los componentes no fijan anchos y
  // que permiten encoger; el desborde real se verifica en un teléfono (ver README).
  it('el contador reparte el ancho y permite encoger, sin anchos fijos', () => {
    render(<ProgressCounter enviados={2} porEnviar={3} sinEmpezar={1} />)
    const grupo = screen.getByRole('group')
    expect(grupo).toHaveClass('w-full')
    for (const cuadro of Array.from(grupo.children)) {
      expect(cuadro).toHaveClass('flex-1', 'min-w-0')
      expect([...cuadro.classList].filter((c) => /^w-\[/.test(c))).toEqual([])
    }
  })

  it('el banner y la tarjeta no fijan un ancho', () => {
    render(
      <>
        <Banner tono="warning">x</Banner>
        <Card data-testid="tarjeta">x</Card>
      </>,
    )
    expect(screen.getByRole('status')).toHaveClass('w-full')
    expect([...screen.getByTestId('tarjeta').classList].filter((c) => /^w-/.test(c))).toEqual([])
  })
})
