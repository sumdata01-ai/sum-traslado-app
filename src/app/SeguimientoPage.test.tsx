import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { ApiError } from '@/core/http/ApiError'
import { crearListaSeguimientoDePrueba, trasladoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import type { TrasladoSeguimiento } from '@/features/seguimiento/domain'
import { SeguimientoPage } from './SeguimientoPage'

const SESION: Sesion = { idUsuario: 7, usuario: 'coord.prueba', nombre: 'COORDINADOR PRUEBA', role: 'coordinador', area: null, allowedApps: [] }

// 15 oct 2026, 12:03 UTC. La lista «llegó» a las 12:00 UTC, que son las 07:00 en Lima.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:03:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  document.body.style.overflow = ''
})

async function montar(traslados?: readonly TrasladoSeguimiento[]) {
  const m = crearListaSeguimientoDePrueba(traslados)
  const onCerrarSesion = vi.fn()
  const vista = render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={onCerrarSesion} />)
  await screen.findByRole('region', { name: 'Tabla de vehículos' })
  return {
    ...m,
    ...vista,
    onCerrarSesion,
    tabla: () => screen.getByRole('region', { name: 'Tabla de vehículos' }),
    listaMovil: () => screen.getByRole('list', { name: 'Lista de vehículos' }),
    /** El panel del detalle: un diálogo que solo existe mientras se muestra un vehículo. */
    panel: () => screen.getByRole('dialog', { name: 'Detalle del traslado' }),
    detalle: () => within(screen.getByRole('dialog', { name: 'Detalle del traslado' })).getByRole('region', { name: 'Detalle del vehículo' }),
    /** Los vehículos de la tabla, uno por `tbody` (cada uno con sus dos filas). */
    cuerpos: () => within(screen.getByRole('region', { name: 'Tabla de vehículos' })).getAllByRole('rowgroup').filter((g) => g.tagName === 'TBODY'),
    /** Los últimos 6 del VIN de cada vehículo de la tabla, en el orden en que se ven. */
    filas: () =>
      within(screen.getByRole('region', { name: 'Tabla de vehículos' }))
        .getAllByRole('rowgroup')
        .filter((g) => g.tagName === 'TBODY')
        .map((g) => /VIN (\w{17})/.exec(g.textContent ?? '')?.[1]?.slice(-6)),
    pestanas: () => within(screen.getByRole('group', { name: 'Filtrar por etapa' })).getAllByRole('button'),
  }
}
type Montaje = Awaited<ReturnType<typeof montar>>

/** El vehículo de la tabla cuyo VIN termina así. */
const cuerpoDe = (m: Montaje, fin: string) => m.cuerpos().find((g) => g.textContent?.includes(fin))!
/** Su botón «Ver detalle». */
const verDetalle = (m: Montaje, fin: string) => within(cuerpoDe(m, fin)).getByRole('button', { name: /Ver detalle/ })
const abrir = async (m: Montaje, fin: string) => userEvent.click(verDetalle(m, fin))

/** Cualquier mención de GPS: ubicación, en vivo, dispositivo, seguimiento satelital, «lleva/llevó GPS». */
const SIN_GPS = /gps|satelital|ubicaci[oó]n|en vivo|dispositivo|seguimiento por definir|se define al salir/i

// El orden de la lista de ejemplo: en camino (lo más reciente arriba), en planta y entregados. La orden anulada (X00064) no se muestra.
const ORDEN_DE_EJEMPLO = ['X00602', 'X00231', 'X00487', 'X00519', 'X00655', 'X00097']

describe('la pantalla', () => {
  it('muestra el portal, el título, la bajada y quién inició sesión', async () => {
    await montar()
    expect(screen.getByRole('img', { name: 'SUM Vehículos' })).toBeInTheDocument()
    expect(screen.getByText('Portal de destinos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Mis vehículos' })).toBeInTheDocument()
    expect(screen.getByText('Consulta el avance de los traslados.')).toBeInTheDocument()
    expect(screen.getByText('COORDINADOR PRUEBA')).toBeInTheDocument()
  })

  it('mientras llega la primera lista dice que carga, y no ofrece filtros', async () => {
    const m = crearListaSeguimientoDePrueba()
    let abrirPuerta: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrirPuerta = r))
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)

    expect(screen.getByText('Cargando los traslados…')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtrar por etapa' })).not.toBeInTheDocument()

    abrirPuerta()
    expect(await screen.findByRole('region', { name: 'Tabla de vehículos' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando los traslados…')).not.toBeInTheDocument()
  })

  it('ordena: en camino (lo más reciente arriba), en planta y entregados', async () => {
    const m = await montar()
    expect(m.filas()).toEqual(ORDEN_DE_EJEMPLO)
  })

  it('dice a qué hora (de Lima) se actualizó por última vez', async () => {
    await montar()
    expect(screen.getByText('Última actualización: 07:00')).toBeInTheDocument()
  })

  it('sin traslados lo dice, en vez de dejar una tabla vacía', async () => {
    const m = crearListaSeguimientoDePrueba([])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    expect(await screen.findByText('Todavía no hay traslados para mostrar.')).toBeInTheDocument()
  })

  it('«Cerrar sesión» avisa a quien lo pidió', async () => {
    const m = await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(m.onCerrarSesion).toHaveBeenCalledTimes(1)
  })

  it('no muestra datos que esta versión no ofrece: ni PDI, ni órdenes anuladas, ni conductor, velocidad o fotos', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    expect(document.body.textContent).not.toMatch(/PDI|anulad|Último punto|conductor|velocidad|km\/h|foto/i)
  })
})

describe('la tabla', () => {
  it('tiene tres columnas: vehículo, destino y etapa', async () => {
    const m = await montar()
    expect(within(m.tabla()).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Vehículo', 'Destino', 'Etapa'])
  })

  it('cada vehículo dice marca y modelo, el VIN completo, el color, el destino, la etapa y la fecha', async () => {
    const m = await montar()
    const fila = cuerpoDe(m, 'X00231')
    for (const texto of ['Toyota Corolla', 'VIN TESTVIN0000X00231', 'Blanco', 'Sede Norte', 'En camino', 'Salida registrada: 15 oct, 07:40', 'Ver detalle']) {
      expect(fila).toHaveTextContent(texto)
    }
  })

  it('NO muestra nada de GPS: ni ubicación, ni «en vivo», ni si lleva dispositivo, ni «seguimiento satelital»', async () => {
    const m = await montar()
    expect(document.body.textContent).not.toMatch(SIN_GPS)
    await abrir(m, 'X00231')
    expect(document.body.textContent).not.toMatch(SIN_GPS)
  })

  it('en planta: «—» en la salida y nada que prometa o niegue un GPS', async () => {
    const m = await montar()
    const fila = cuerpoDe(m, 'X00519')
    expect(fila).toHaveTextContent('En planta')
    expect(fila).toHaveTextContent('Salida registrada: —')
    expect(fila).not.toHaveTextContent(SIN_GPS)
  })

  it('un entregado dice cuándo; con hora estimada, solo la fecha', async () => {
    const m = await montar()
    expect(cuerpoDe(m, 'X00655')).toHaveTextContent('Entregado: 14 oct, 11:20')
    expect(cuerpoDe(m, 'X00097')).toHaveTextContent('Entregado: 13 oct')
    expect(cuerpoDe(m, 'X00097')).not.toHaveTextContent('Entregado: 13 oct,')
  })

  it('un vehículo sin marca ni modelo se llama «Vehículo»; sin color ni destino, no deja nada colgando', async () => {
    await montar([trasladoDePrueba({ marca: null, modelo: null, color: null, destino: null })])
    expect(document.body.textContent).not.toMatch(/undefined|null/)
    expect(screen.getAllByText('Vehículo').length).toBeGreaterThan(0)
    // En la tabla y en la lista del teléfono (jsdom pinta las dos), cada una por su lado.
    expect(within(screen.getByRole('region', { name: 'Tabla de vehículos' })).getAllByText('Sin destino').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('list', { name: 'Lista de vehículos' })).getAllByText('Sin destino').length).toBeGreaterThan(0)
  })

  it('muestra el logo de la marca cuando lo hay (también con las variantes de Volkswagen del catálogo) y la inicial cuando no', async () => {
    const m = await montar([
      trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000X00001', marca: 'JETOUR', modelo: 'X50', salidaRegistrada: '2026-10-15T13:00:00Z' }),
      trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000X00002', marca: 'VW PASAJEROS', modelo: 'Nivus', salidaRegistrada: '2026-10-15T12:00:00Z' }),
      trasladoDePrueba({ idOrden: 3, vin: 'TESTVIN0000X00003', marca: 'VWPASAJEROS', modelo: 'Taos', salidaRegistrada: '2026-10-15T11:00:00Z' }),
      trasladoDePrueba({ idOrden: 4, vin: 'TESTVIN0000X00004', marca: 'KYC', modelo: 'Kaiyi X3', salidaRegistrada: '2026-10-15T10:00:00Z' }),
    ])
    const logo = (fin: string) => cuerpoDe(m, fin).querySelector('img')?.getAttribute('src') ?? null
    expect(logo('X00001')).toMatch(/jetour/)
    expect(logo('X00002')).toMatch(/volkswagen/)
    expect(logo('X00003')).toMatch(/volkswagen/)
    // Decorativo: la marca ya está escrita al lado, así que el lector de pantalla no lo lee ni lo repite.
    const img = cuerpoDe(m, 'X00001').querySelector('img')!
    expect(img).toHaveAttribute('alt', '')
    expect(img.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(logo('X00004')).toBeNull() // sin logo: la inicial
    expect(within(cuerpoDe(m, 'X00004')).getByText('K')).toBeInTheDocument()
  })

  it('sin logo de la marca, muestra su inicial; el logo y la inicial no se leen en voz alta', async () => {
    const m = await montar()
    const marca = within(cuerpoDe(m, 'X00231')).getByText('T')
    expect(marca.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('pestañas', () => {
  it('son Todos, En camino y Entregados, cada una con su número: no hay pestañas de «En planta» ni de «Anulados»', async () => {
    const m = await montar()
    expect(m.pestanas().map((b) => b.textContent)).toEqual(['Todos (6)', 'En camino (3)', 'Entregados (2)'])
  })

  it('los números siguen al buscador y al destino', async () => {
    const m = await montar()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar vehículo' }), 'kia')
    expect(m.pestanas().map((b) => b.textContent)).toEqual(['Todos (2)', 'En camino (1)', 'Entregados (1)'])

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar vehículo' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Destino' }), 'Sede Sur')
    expect(m.pestanas().map((b) => b.textContent)).toEqual(['Todos (2)', 'En camino (1)', 'Entregados (1)'])
  })

  it('«Todos» muestra también lo que está en planta, con su etiqueta', async () => {
    const m = await montar()
    expect(within(m.tabla()).getByText('En planta')).toBeInTheDocument()
    expect(m.pestanas()[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('una orden anulada no se muestra: ni en la tabla, ni en la lista del teléfono, ni en el buscador, ni en los números', async () => {
    const m = await montar() // la lista de ejemplo trae la orden X00064, anulada
    expect(document.body).not.toHaveTextContent('X00064')
    expect(document.body).not.toHaveTextContent('Anulado')
    expect(m.tabla()).not.toHaveTextContent('Yaris')
    expect(within(m.listaMovil()).getAllByRole('listitem')).toHaveLength(6)
    expect(m.pestanas()[0]).toHaveTextContent('Todos (6)')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar vehículo' }), 'yaris')
    expect(screen.getByText('Ningún vehículo coincide con lo que buscas.')).toBeInTheDocument()
  })

  it('un destino que solo tiene órdenes anuladas no aparece en el selector', async () => {
    const m = await montar([
      trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000X00001', destino: 'Sede Norte', etapa: 'en_camino', salidaRegistrada: '2026-10-15T12:00:00Z' }),
      trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000X00002', destino: 'Sede Sur', etapa: 'anulado', salidaRegistrada: null }),
    ])
    expect(m.filas()).toEqual(['X00001'])
    expect(screen.queryByRole('combobox', { name: 'Destino' })).not.toBeInTheDocument() // queda un solo destino
  })

  it('si todo lo que hay está anulado, dice que no hay traslados (y no que cargan)', async () => {
    const m = crearListaSeguimientoDePrueba([trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000X00002', etapa: 'anulado', salidaRegistrada: null })])
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    expect(await screen.findByText('Todavía no hay traslados para mostrar.')).toBeInTheDocument()
    expect(screen.queryByText('Cargando los traslados…')).not.toBeInTheDocument()

    // Con un filtro puesto tampoco finge que hubo coincidencias: para el coordinador no hay ningún traslado.
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar vehículo' }), 'x')
    expect(screen.getByText('Todavía no hay traslados para mostrar.')).toBeInTheDocument()
  })

  it('«En camino» muestra solo los que van en camino', async () => {
    const m = await montar()
    await userEvent.click(m.pestanas()[1]!)
    expect(m.filas()).toEqual(['X00602', 'X00231', 'X00487'])
    expect(m.pestanas()[1]).toHaveAttribute('aria-pressed', 'true')
    expect(m.pestanas()[0]).toHaveAttribute('aria-pressed', 'false')
  })

  it('«Entregados» muestra solo los entregados', async () => {
    const m = await montar()
    await userEvent.click(m.pestanas()[2]!)
    expect(m.filas()).toEqual(['X00655', 'X00097'])
  })
})

describe('buscar y filtrar por destino', () => {
  it('el buscador encuentra por VIN, marca, modelo o color, sin mayúsculas', async () => {
    const m = await montar()
    const campo = screen.getByRole('searchbox', { name: 'Buscar vehículo' })
    expect(campo).toHaveClass('text-base') // 16 px: Safari no amplía la página al enfocar
    expect(campo).toHaveAttribute('placeholder', 'Buscar por VIN o vehículo...')

    await userEvent.type(campo, 'HILUX')
    expect(m.filas()).toEqual(['X00602'])

    await userEvent.clear(campo)
    await userEvent.type(campo, 'blanco')
    expect(m.filas()).toEqual(['X00231', 'X00097'])
  })

  it('sin coincidencias lo dice y quitar el texto devuelve la lista', async () => {
    const m = await montar()
    const campo = screen.getByRole('searchbox', { name: 'Buscar vehículo' })
    await userEvent.type(campo, 'zzzz')
    expect(screen.getByText('Ningún vehículo coincide con lo que buscas.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tabla de vehículos' })).not.toBeInTheDocument()

    await userEvent.clear(campo)
    expect(m.filas()).toEqual(ORDEN_DE_EJEMPLO)
  })

  it('con más de un destino ofrece el selector y filtra por el elegido', async () => {
    const m = await montar()
    const selector = screen.getByRole('combobox', { name: 'Destino' })
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos los destinos', 'Sede Norte', 'Sede Sur'])

    await userEvent.selectOptions(selector, 'Sede Sur')
    expect(m.filas()).toEqual(['X00487', 'X00655']) // la anulada (X00064, de Sede Sur) no cuenta
  })

  it('con un solo destino no ofrece el selector', async () => {
    await montar([trasladoDePrueba({ idOrden: 1, destino: 'Sede Norte' }), trasladoDePrueba({ idOrden: 2, destino: 'Sede Norte' })])
    expect(screen.queryByRole('combobox', { name: 'Destino' })).not.toBeInTheDocument()
  })

  it('un destino que deja de venir en la lista no sigue filtrando a ciegas', async () => {
    const m = await montar()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Destino' }), 'Sede Sur')
    m.estado.traslados = m.estado.traslados.filter((t) => t.destino !== 'Sede Sur')

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    // Volvió a «todos» (no queda una lista vacía) y, con un solo destino, ya no se ofrece el selector.
    await vi.waitFor(() => expect(m.filas()).toEqual(['X00602', 'X00231', 'X00519', 'X00097']))
    expect(screen.queryByRole('combobox', { name: 'Destino' })).not.toBeInTheDocument()
  })
})

describe('el detalle (un panel por encima de la lista)', () => {
  it('al entrar no hay detalle abierto: se elige con «Ver detalle»', async () => {
    await montar()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('«Ver detalle» lo abre con el vehículo elegido; su nombre dice de qué vehículo es', async () => {
    const m = await montar()
    expect(verDetalle(m, 'X00487')).toHaveAccessibleName('Ver detalle de TESTVIN0000X00487')

    await abrir(m, 'X00487')
    const detalle = within(m.detalle())
    expect(detalle.getByText('Kia Sportage')).toBeInTheDocument()
    expect(detalle.getByText('VIN TESTVIN0000X00487')).toBeInTheDocument()
    expect(detalle.getByText('Gris')).toBeInTheDocument()
    expect(detalle.getByText('Destino').nextElementSibling).toHaveTextContent('Sede Sur')
    expect(detalle.getByText('Etapa').nextElementSibling).toHaveTextContent('En camino')
  })

  it('tocar la fila (no el botón) también lo abre', async () => {
    const m = await montar()
    await userEvent.click(within(cuerpoDe(m, 'X00231')).getAllByRole('row')[0]!.querySelector('td:nth-child(2)')!)
    expect(within(m.detalle()).getByText('VIN TESTVIN0000X00231')).toBeInTheDocument()
  })

  it('el foco entra en «Cerrar» al abrir; Escape lo cierra y el foco vuelve a «Ver detalle»', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    expect(within(m.panel()).getByRole('button', { name: 'Cerrar' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(verDetalle(m, 'X00231')).toHaveFocus()
  })

  it('«Cerrar» y tocar fuera del panel lo cierran', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    await userEvent.click(within(m.panel()).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await abrir(m, 'X00231')
    await userEvent.click(m.panel().parentElement!.querySelector('[data-fondo]')!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el foco no sale del panel con Tab, ni con Mayús+Tab', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    const cerrar = within(m.panel()).getByRole('button', { name: 'Cerrar' }) // el único elemento enfocable del panel
    expect(cerrar).toHaveFocus()
    await userEvent.tab()
    expect(cerrar).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(cerrar).toHaveFocus()
  })

  it('la página de atrás no se desplaza mientras está abierto, y vuelve a hacerlo al cerrar', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })

  it('al abrir compensa el ancho de la barra de desplazamiento que desaparece, para que nada de atrás se corra; al cerrar lo quita', async () => {
    const m = await montar()
    // jsdom no tiene barras: se simula una de 15 px (ventana de 1280, área útil de 1265).
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1265 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    try {
      await abrir(m, 'X00231')
      expect(document.body.style.paddingRight).toBe('15px')
      await userEvent.keyboard('{Escape}')
      expect(document.body.style.paddingRight).toBe('')
    } finally {
      Reflect.deleteProperty(document.documentElement, 'clientWidth')
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    }
  })

  it('sin barra de desplazamiento (un teléfono) no agrega ningún margen', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    expect(document.body.style.paddingRight).toBe('')
  })

  it('muestra los hitos: la salida con su fecha y la entrega vacía («—», con texto para lector de pantalla)', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    const hitos = within(m.detalle()).getAllByRole('listitem')
    expect(hitos).toHaveLength(2)
    expect(hitos[0]).toHaveTextContent('Salida registrada15 oct, 07:40')
    expect(hitos[1]).toHaveTextContent('Entrega—')
    expect(hitos[1]).toHaveTextContent('Sin registro')
  })

  it('el detalle no dice nada de GPS en ninguna etapa (en camino, en planta, entregado)', async () => {
    const m = await montar()
    for (const vin of ['X00602', 'X00519', 'X00655', 'X00097']) {
      await abrir(m, vin)
      expect(within(m.panel()).queryByText(SIN_GPS)).not.toBeInTheDocument()
      expect(m.panel().textContent).not.toMatch(SIN_GPS)
      await userEvent.keyboard('{Escape}')
    }
  })

  it('una entrega con hora estimada muestra solo la fecha y avisa que no hay hora', async () => {
    const m = await montar()
    await abrir(m, 'X00097')
    const entrega = within(m.detalle()).getAllByRole('listitem')[1]!
    expect(entrega).toHaveTextContent('Entrega13 oct')
    expect(entrega).toHaveTextContent('Hora no disponible')
  })

  it('una entrega con hora medida la muestra con hora', async () => {
    const m = await montar()
    await abrir(m, 'X00655')
    expect(within(m.detalle()).getAllByRole('listitem')[1]).toHaveTextContent('Entrega14 oct, 11:20')
  })

  it('si el vehículo abierto desaparece de la lista, el panel se cierra y no muestra otro vehículo en su lugar', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    m.estado.traslados = m.estado.traslados.filter((t) => !t.vin.endsWith('X00231'))

    await act(async () => {
      await m.lista.actualizar()
    })

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(m.filas()).not.toContain('X00231')
  })

  it('una orden que pasa a estar anulada mientras está abierta también cierra el panel', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    m.estado.traslados = m.estado.traslados.map((t) => (t.vin.endsWith('X00231') ? { ...t, etapa: 'anulado' as const } : t))

    await act(async () => {
      await m.lista.actualizar()
    })

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('en el teléfono', () => {
  it('cada vehículo de la lista dice todo sin abrirlo, y su «Ver detalle» abre el panel', async () => {
    const m = await montar()
    const segunda = within(m.listaMovil()).getAllByRole('listitem')[1]!
    for (const texto of ['Toyota Corolla', 'VIN TESTVIN0000X00231', 'Blanco', 'Sede Norte', 'En camino', 'Salida registrada: 15 oct, 07:40', 'Ver detalle']) {
      expect(segunda).toHaveTextContent(texto)
    }

    await userEvent.click(within(segunda).getByRole('button', { name: /Ver detalle/ }))
    expect(within(m.detalle()).getByText('VIN TESTVIN0000X00231')).toBeInTheDocument()
  })

  it('en planta, la lista dice «Salida registrada: —» y nada de GPS', async () => {
    const m = await montar()
    const enPlanta = within(m.listaMovil()).getAllByRole('listitem')[3]!
    expect(enPlanta).toHaveTextContent('En planta')
    expect(enPlanta).toHaveTextContent('Salida registrada: —')
    expect(enPlanta).not.toHaveTextContent(SIN_GPS)
  })
})

describe('avisos', () => {
  it('sin conexión avisa y conserva lo último recibido', async () => {
    const m = await montar()
    m.estado.fallo = new ApiError('Sin conexión al backend o internet.')

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    expect(await screen.findByText('Sin conexión. Se muestra lo último recibido.')).toBeInTheDocument()
    expect(m.filas()).toEqual(ORDEN_DE_EJEMPLO)
  })

  it('un error del servidor se dice con su mensaje, como alerta', async () => {
    const m = await montar()
    m.estado.fallo = new ApiError('No se pudieron traer los traslados.', { status: 500 })
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron traer los traslados.')
  })

  it('traslados con datos inválidos: avisa cuántos y que se avise a soporte', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.descartados = 1
    const { unmount } = render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    expect(await screen.findByText(/Un traslado no se pudo mostrar porque llegó con datos inválidos\. Avisa a soporte\./)).toBeInTheDocument()
    unmount()

    const otra = crearListaSeguimientoDePrueba()
    otra.estado.descartados = 3
    render(<SeguimientoPage sesion={SESION} lista={otra.lista} onCerrarSesion={() => undefined} />)
    expect(await screen.findByText(/3 traslados no se pudieron mostrar/)).toBeInTheDocument()
  })

  it('un 403 muestra «Sin permiso» con el mensaje del servidor y deja cerrar la sesión', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.fallo = new ApiError('Permisos insuficientes', { status: 403 })
    const onCerrarSesion = vi.fn()
    render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={onCerrarSesion} />)

    expect(await screen.findByRole('heading', { name: 'Sin permiso para ver el seguimiento' })).toBeInTheDocument()
    expect(screen.getByText('Permisos insuficientes')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tabla de vehículos' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(onCerrarSesion).toHaveBeenCalledTimes(1)
  })
})

describe('actualizar', () => {
  it('pide la lista de nuevo y mientras tanto el botón dice «Actualizando…» y no se puede pulsar', async () => {
    const m = await montar()
    const antes = m.estado.llamadas
    let abrirPuerta: () => void = () => undefined
    m.estado.puerta = new Promise<void>((r) => (abrirPuerta = r))

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    const ocupado = screen.getByRole('button', { name: 'Actualizando…' })
    expect(ocupado).toBeDisabled()
    expect(m.estado.llamadas).toBe(antes + 1)

    abrirPuerta()
    expect(await screen.findByRole('button', { name: 'Actualizar' })).toBeEnabled()
  })
})

describe('accesibilidad', () => {
  it('la pantalla no tiene violaciones de axe', async () => {
    const m = await montar()
    expect(await axe(m.container)).toHaveNoViolations()
  })

  it('con el detalle abierto tampoco', async () => {
    const m = await montar()
    await abrir(m, 'X00231')
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it('«Sin permiso» tampoco', async () => {
    const m = crearListaSeguimientoDePrueba()
    m.estado.fallo = new ApiError('Permisos insuficientes', { status: 403 })
    const vista = render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
    await screen.findByRole('heading', { name: 'Sin permiso para ver el seguimiento' })
    expect(await axe(vista.container)).toHaveNoViolations()
  })
})
