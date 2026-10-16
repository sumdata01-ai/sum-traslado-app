/** El tablero de llegadas por QR (`/dashboard`): lo que ve el supervisor, con los datos de ejemplo del apéndice del spec. */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { ApiError } from '@/core/http/ApiError'
import { DIA_APENDICE, PATIO, PUERTA, crearTableroDePrueba } from '@/features/tablero-llegadas/data/testing/fakes'
import { TableroLlegadasPage } from './TableroLlegadasPage'

const sesion: Sesion = { idUsuario: 7, usuario: 'sup.despacho', nombre: 'SUPERVISOR DESPACHO', role: 'supervisor', area: 'despacho', allowedApps: [] }

async function montar() {
  const doble = crearTableroDePrueba()
  const onCerrarSesion = vi.fn()
  const vista = render(<TableroLlegadasPage sesion={sesion} tablero={doble.tablero} onCerrarSesion={onCerrarSesion} />)
  await screen.findByRole('region', { name: 'Resumen del día' })
  return { ...doble, ...vista, onCerrarSesion }
}

const resumen = () => within(screen.getByRole('region', { name: 'Resumen del día' }))
const senales = () => within(screen.getByRole('region', { name: 'Señales para revisar' }))
const filas = () => within(screen.getByRole('list', { name: 'Llegadas' })).getAllByRole('listitem')
const pestana = (nombre: RegExp | string) => screen.getByRole('button', { name: nombre })

async function irARechazados() {
  await userEvent.click(pestana(/^Códigos rechazados \(/))
  return within(screen.getByRole('list', { name: 'Códigos rechazados' }))
}

describe('abrir el tablero', () => {
  it('muestra «Cargando el tablero…» hasta que llega lo primero', async () => {
    const doble = crearTableroDePrueba()
    let abrir!: () => void
    doble.estado.puerta = new Promise<void>((r) => (abrir = r))
    render(<TableroLlegadasPage sesion={sesion} tablero={doble.tablero} onCerrarSesion={() => undefined} />)
    expect(screen.getByText('Cargando el tablero…')).toBeInTheDocument()
    abrir()
    expect(await screen.findByRole('region', { name: 'Resumen del día' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando el tablero…')).not.toBeInTheDocument()
  })

  it('pide hoy y todos los puntos, y dice cuándo llegó lo último', async () => {
    const m = await montar()
    expect(m.estado.dia).toEqual([{ dia: DIA_APENDICE, idPunto: null }])
    expect(screen.getByText('Última actualización: 12:00')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Llegadas por QR' })).toBeInTheDocument()
  })

  it('no pide nada por su cuenta; «Actualizar» sí', async () => {
    const m = await montar()
    await new Promise((r) => setTimeout(r, 60))
    expect(m.estado.dia).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(m.estado.dia).toHaveLength(2))
  })

  it('el saludo y «Cerrar sesión»; no hay ningún camino a Traslado', async () => {
    const m = await montar()
    expect(screen.getByText('SUPERVISOR DESPACHO')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Traslado|Marcar llegada/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(m.onCerrarSesion).toHaveBeenCalledTimes(1)
  })
})

describe('el resumen y las señales (HU-1 y HU-3), con el apéndice', () => {
  it('19 llegadas con su desglose, 3 con flag, 9 rechazados y 12 s de mediana', async () => {
    await montar()
    const r = resumen()
    expect(r.getByText('Llegadas').parentElement).toHaveTextContent('19')
    expect(r.getByText('Patio de llegada: 16 · Puerta norte: 3')).toBeInTheDocument()
    expect(r.getByRole('button', { name: /Con flag/ })).toHaveTextContent('3')
    expect(r.getByRole('button', { name: /Códigos rechazados/ })).toHaveTextContent('9')
    expect(r.getByText('Demora mediana').parentElement).toHaveTextContent('12 s')
    expect(r.getByText('Del QR a la recepción')).toBeInTheDocument()
  })

  it('las dos señales: 3 con flag y 1 conductor con QR vencido repetido, nombrado', async () => {
    await montar()
    const s = senales()
    expect(s.getByRole('button', { name: /Llegadas con flag/ })).toHaveTextContent('3')
    const vencido = s.getByRole('button', { name: /QR vencido, repetido/ })
    expect(vencido).toHaveTextContent('1')
    expect(vencido).toHaveTextContent('op.demo07 (3 veces)')
    expect(screen.getByText('Las señales no acusan a nadie: son una cuenta de lo ya guardado.')).toBeInTheDocument()
  })

  it('«Con flag» (tarjeta o señal) abre la lista de llegadas filtrada', async () => {
    await montar()
    await userEvent.click(pestana(/^Puntos/))
    await userEvent.click(resumen().getByRole('button', { name: /Con flag/ }))
    expect(screen.getByRole('button', { name: 'Con flag', pressed: true })).toBeInTheDocument()
    expect(filas()).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(filas()).toHaveLength(19)
    await userEvent.click(pestana(/^Puntos/))
    await userEvent.click(senales().getByRole('button', { name: /Llegadas con flag/ }))
    expect(screen.getByRole('button', { name: 'Con flag', pressed: true })).toBeInTheDocument()
    expect(filas()).toHaveLength(3)
  })

  it('«Códigos rechazados» abre esa pestaña con todos los motivos', async () => {
    await montar()
    await userEvent.click(resumen().getByRole('button', { name: /Códigos rechazados/ }))
    expect(screen.getByRole('button', { name: 'Todos', pressed: true })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Códigos rechazados' })).getAllByRole('listitem')).toHaveLength(9)
  })

  it('la señal del QR vencido abre los rechazados ya filtrados por ese motivo', async () => {
    await montar()
    await userEvent.click(senales().getByRole('button', { name: /QR vencido, repetido/ }))
    expect(screen.getByRole('button', { name: 'QR demasiado viejo', pressed: true })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Códigos rechazados' })).getAllByRole('listitem')).toHaveLength(4)
  })

  it('las cuatro tarjetas tienen el mismo estilo, sin franjas de color a los lados', async () => {
    await montar()
    const tarjetas = [...screen.getByRole('region', { name: 'Resumen del día' }).children] as HTMLElement[]
    expect(tarjetas).toHaveLength(4)
    for (const t of tarjetas) {
      expect(t.className).not.toMatch(/border-l-|border-r-|border-t-|border-b-/)
      expect(t).toHaveClass('border', 'border-line', 'rounded-ficha', 'bg-surface')
    }
    // Las dos tocables son botones; las otras dos, información.
    expect(tarjetas.map((t) => t.tagName)).toEqual(['DIV', 'BUTTON', 'BUTTON', 'DIV'])
  })

  it('las pestañas llevan su conteo', async () => {
    await montar()
    expect(pestana(/^Llegadas \(/)).toHaveTextContent('Llegadas (19)')
    expect(pestana(/^Códigos rechazados \(/)).toHaveTextContent('Códigos rechazados (9)')
    expect(pestana(/^Puntos/)).toHaveTextContent('Puntos (3)')
  })
})

describe('la lista de llegadas (HU-2)', () => {
  it('19 filas por hora de recepción, de la más antigua a la más reciente', async () => {
    await montar()
    const items = filas()
    expect(items).toHaveLength(19)
    expect(items[0]).toHaveTextContent('07:12:09')
    expect(items[18]).toHaveTextContent('11:40:35')
    // La de la Puerta norte de las 08:02 va entre la del Patio de las 07:58 y la de las 08:20.
    expect(items[6]).toHaveTextContent('Puerta norte')
  })

  it('cada fila dice el conductor, el punto, las horas, la demora, la distancia, la precisión y el estado', async () => {
    await montar()
    const turno8 = screen.getByRole('button', { name: /^Turno 8, Conductor 01, Patio de llegada, con flag/ })
    expect(turno8).toHaveTextContent('Conductor 01')
    expect(turno8).toHaveTextContent('op.demo01')
    expect(turno8).toHaveTextContent('08:41:00')
    expect(turno8).toHaveTextContent('08:43:20')
    expect(turno8).toHaveTextContent('2 min 20 s')
    expect(turno8).toHaveTextContent('27,5 m · 28 %')
    expect(turno8).toHaveTextContent('15,0 m')
    expect(turno8).toHaveTextContent('OUT_OF_WINDOW · 4 pasos')
  })

  it('el estado lleva su texto: «Normal» o «OUT_OF_WINDOW · N pasos» (el color nunca va solo)', async () => {
    await montar()
    const items = filas()
    expect(items.filter((i) => /OUT_OF_WINDOW/.test(i.textContent ?? ''))).toHaveLength(3)
    expect(items.filter((i) => /Normal/.test(i.textContent ?? ''))).toHaveLength(16)
    for (const pasos of ['4 pasos', '6 pasos', '18 pasos']) expect(screen.getAllByText(new RegExp(`OUT_OF_WINDOW · ${pasos}`))).toHaveLength(1)
  })

  it('caso límite: 71 s con exactamente 2 pasos es «Normal», y la demora se dice «1 min 11 s»', async () => {
    await montar()
    const turno5 = screen.getByRole('button', { name: /^Turno 5, Conductor 05, Patio de llegada, normal/ })
    expect(turno5).toHaveTextContent('1 min 11 s')
    expect(turno5).toHaveTextContent('Normal')
    expect(turno5).not.toHaveTextContent('OUT_OF_WINDOW')
  })

  it('no muestra coordenadas en la lista', async () => {
    await montar()
    expect(screen.getByRole('list', { name: 'Llegadas' }).textContent).not.toMatch(/-12[.,]0|-77[.,]0/)
  })

  it('«Con flag» deja solo las tres con flag; «Todas» las devuelve', async () => {
    await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Con flag' }))
    expect(filas()).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(filas()).toHaveLength(19)
  })

  it('la búsqueda por conductor, sin distinguir mayúsculas', async () => {
    await montar()
    await userEvent.type(screen.getByLabelText('Buscar conductor'), 'DEMO07')
    expect(filas()).toHaveLength(2)
    await userEvent.clear(screen.getByLabelText('Buscar conductor'))
    await userEvent.type(screen.getByLabelText('Buscar conductor'), 'conductor 02')
    expect(filas()).toHaveLength(3)
  })

  it('«Ninguna llegada con estos filtros» y la caja no se achica', async () => {
    await montar()
    const caja = screen.getByRole('list', { name: 'Llegadas' }).parentElement!
    expect(caja).toHaveClass('min-h-[260px]')
    await userEvent.type(screen.getByLabelText('Buscar conductor'), 'nadie se llama así')
    expect(screen.getByText('Ninguna llegada con estos filtros')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Llegadas' })).not.toBeInTheDocument()
    expect(caja).toHaveClass('min-h-[260px]')
  })

  it('el botón de orden lo invierte', async () => {
    await montar()
    await userEvent.click(screen.getByRole('button', { name: 'Más antiguas primero' }))
    expect(screen.getByRole('button', { name: 'Más recientes primero' })).toBeInTheDocument()
    const items = filas()
    expect(items[0]).toHaveTextContent('11:40:35')
    expect(items[18]).toHaveTextContent('07:12:09')
  })

  it('la barra de distancia mide contra el radio, hasta el 100 %', async () => {
    await montar()
    const turno7 = screen.getByRole('button', { name: /^Turno 7, Conductor 06, Patio de llegada/ })
    const barra = turno7.querySelector<HTMLElement>('span[style*="width"]')!
    expect(barra.style.width).toBe('96.1%')
    const puerta2 = screen.getByRole('button', { name: /^Turno 2, Conductor 01, Puerta norte/ })
    expect(puerta2.querySelector<HTMLElement>('span[style*="width"]')!.style.width).toBe('97.4%')
  })

  it('la raya y el color del estado distinguen «con flag» de «normal», además del texto', async () => {
    await montar()
    const conFlag = screen.getByRole('button', { name: /^Turno 8, Conductor 01, Patio de llegada, con flag/ })
    const normal = screen.getByRole('button', { name: /^Turno 5, Conductor 05, Patio de llegada, normal/ })
    expect(conFlag).toHaveClass('border-l-warning')
    expect(conFlag).not.toHaveClass('border-l-transparent')
    expect(normal).toHaveClass('border-l-transparent')
    expect(normal).not.toHaveClass('border-l-warning')
    expect(within(conFlag).getByText(/OUT_OF_WINDOW/)).toHaveClass('bg-warning-soft', 'text-warning-ink')
    expect(within(normal).getByText('Normal')).toHaveClass('bg-success-soft', 'text-success-ink')
  })

  it('la barra de distancia no pasa del 100 % aunque el radio haya cambiado después', async () => {
    const m = await montar()
    const original = m.api.dia
    m.api.dia = async (c) => {
      const leido = await original(c)
      return { ...leido, dia: { ...leido.dia, llegadas: leido.dia.llegadas.map((l) => (l.turno === 7 && l.punto.idPunto === PATIO ? { ...l, pctRadio: 120, distanciaM: 120 } : l)) } }
    }
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    const fila = await screen.findByRole('button', { name: /^Turno 7, Conductor 06, Patio de llegada/ })
    await waitFor(() => expect(fila).toHaveTextContent('120,0 m · 120 %'))
    expect(fila.querySelector<HTMLElement>('span[style*="width"]')!.style.width).toBe('100%')
  })

  it('si el servidor recortó la lista, lo dice y los números de arriba siguen contando todo', async () => {
    const doble = crearTableroDePrueba()
    doble.estado.truncado = true
    render(<TableroLlegadasPage sesion={sesion} tablero={doble.tablero} onCerrarSesion={() => undefined} />)
    await screen.findByRole('region', { name: 'Resumen del día' })
    expect(screen.getByText(/Hay más llegadas de las que caben en esta lista/)).toBeInTheDocument()
    expect(resumen().getByText('Llegadas').parentElement).toHaveTextContent('19')
  })
})

describe('el detalle de una llegada (HU-4)', () => {
  const abrir = async (nombre: RegExp) => {
    const fila = screen.getByRole('button', { name: nombre })
    await userEvent.click(fila)
    return { fila, dialogo: await screen.findByRole('dialog', { name: 'Detalle de la llegada' }) }
  }

  it('una llegada con flag: el resumen en lenguaje llano, los tiempos y dónde escaneó', async () => {
    await montar()
    const { dialogo } = await abrir(/^Turno 8, Conductor 01/)
    const d = within(dialogo)
    expect(d.getByRole('heading', { level: 2, name: 'Conductor 01' })).toBeInTheDocument()
    expect(dialogo).toHaveTextContent('Patio de llegada · turno 8')
    expect(dialogo).toHaveTextContent('Entró con flag. Cuando el servidor lo recibió, el QR tenía 4 pasos (2 min 0 s de antigüedad)')
    expect(dialogo).toHaveTextContent('El conductor lo vio como una confirmación normal.')
    expect(d.getByText('Hora oficial (del QR)').nextSibling).toHaveTextContent('08:41:00')
    expect(d.getByText('Recibida por el servidor').nextSibling).toHaveTextContent('08:43:20')
    expect(d.getByText('Demora').nextSibling).toHaveTextContent('2 min 20 s')
    expect(d.getByText('Pasos de antigüedad').nextSibling).toHaveTextContent('4')
    expect(d.getByText('Distancia al centro').nextSibling).toHaveTextContent('27,5 m, 28 % del radio')
    expect(d.getByText('Precisión del teléfono').nextSibling).toHaveTextContent('15,0 m, máx. 100 m')
    expect(d.getByText(/El turno sigue el orden de la hora de/)).toBeInTheDocument()
  })

  it('una llegada normal dice «dentro de lo normal»', async () => {
    await montar()
    const { dialogo } = await abrir(/^Turno 5, Conductor 05/)
    expect(dialogo).toHaveTextContent('El QR tenía 2 pasos al llegar: dentro de lo normal (hasta 2 pasos, 60 s).')
    expect(dialogo).not.toHaveTextContent('Entró con flag')
  })

  it('las coordenadas solo se ven aquí', async () => {
    await montar()
    const { dialogo } = await abrir(/^Turno 8, Conductor 01/)
    expect(within(dialogo).getByText('Coordenadas').nextSibling?.textContent).toMatch(/^-12,0\d{5}, -77,0\d{5}$/)
  })

  it('el esquema: un dibujo con su texto alternativo, el círculo del radio y la posición del teléfono', async () => {
    await montar()
    const { dialogo } = await abrir(/^Turno 8, Conductor 01/)
    const svg = within(dialogo).getByRole('img', { name: /Esquema: el teléfono estaba a 27,5 m del centro del punto, el 28 por ciento del radio de 100 metros/ })
    const circulos = svg.querySelectorAll('circle')
    expect(circulos).toHaveLength(4)
    // Centro al medio; el teléfono a 27,5 m de 100 m del radio.
    const [radio, precision, telefono, centro] = [...circulos]
    expect(centro!.getAttribute('cx')).toBe('180')
    expect(radio!.getAttribute('r')).toBe('111.6')
    const distancia = Math.hypot(Number(telefono!.getAttribute('cx')) - 180, Number(telefono!.getAttribute('cy')) - 180)
    expect(distancia).toBeCloseTo(27.5 * 1.116, 0)
    expect(Number(precision!.getAttribute('r'))).toBeCloseTo(15 * 1.116, 0)
    expect(within(dialogo).getByText('Radio del punto: 100 m')).toBeInTheDocument()
    expect(within(dialogo).getByText(/Esquema, no un mapa real/)).toBeInTheDocument()
  })

  it('el panel se cierra con «Cerrar» y con Escape, y el foco vuelve a la fila', async () => {
    await montar()
    const { fila } = await abrir(/^Turno 8, Conductor 01/)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fila).toHaveFocus()

    await userEvent.click(fila)
    await screen.findByRole('dialog', { name: 'Detalle de la llegada' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fila).toHaveFocus()
  })

  it('la fila se abre con el teclado', async () => {
    await montar()
    const fila = screen.getByRole('button', { name: /^Turno 8, Conductor 01/ })
    fila.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Detalle de la llegada' })).toBeInTheDocument()
  })

  it('tocar fuera (la cortina) cierra el panel', async () => {
    await montar()
    await abrir(/^Turno 8, Conductor 01/)
    await userEvent.click(document.querySelector('[data-fondo]')!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('si la llegada abierta desaparece pero quedan otras, no se muestra otra en su lugar', async () => {
    const m = await montar()
    await abrir(/^Turno 8, Conductor 01/)
    const original = m.api.dia
    await act(async () => {
      m.api.dia = async (c) => {
        const leido = await original(c)
        return { ...leido, dia: { ...leido.dia, llegadas: leido.dia.llegadas.filter((l) => l.turno !== 8 || l.punto.idPunto !== PATIO) } }
      }
      await m.tablero.actualizar()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el esquema pone al teléfono en la dirección de sus coordenadas, no siempre al este', async () => {
    await montar()
    const { dialogo } = await abrir(/^Turno 8, Conductor 01/)
    const svg = within(dialogo).getByRole('img', { name: /Esquema/ })
    const telefono = [...svg.querySelectorAll('circle')][2]!
    expect(telefono.getAttribute('cy')).not.toBe('180') // la dirección sale de las coordenadas (este turno no está al este del centro)
    expect(within(dialogo).queryByText(/aquí no se supo el centro del punto/)).not.toBeInTheDocument()
  })

  it('el detalle de una llegada que el servidor ya no manda no se sigue mostrando', async () => {
    const m = await montar()
    await abrir(/^Turno 8, Conductor 01/)
    await act(async () => {
      m.api.dia = async () => ({ dia: { ...(await crearTableroDePrueba().api.dia()).dia, llegadas: [] }, descartadas: 0 })
      await m.tablero.actualizar()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el detalle no tiene fallos de accesibilidad', async () => {
    const m = await montar()
    await abrir(/^Turno 8, Conductor 01/)
    expect(await axe(m.container)).toHaveNoViolations()
  })
})

describe('los códigos rechazados (HU-5 y HU-6)', () => {
  it('nueve intentos, del más reciente al más antiguo, con el aviso de que el conductor no ve el motivo', async () => {
    await montar()
    const lista = await irARechazados()
    const items = lista.getAllByRole('listitem')
    expect(items).toHaveLength(9)
    expect(items[0]).toHaveTextContent('11:22:09')
    expect(items[8]).toHaveTextContent('07:40:12')
    expect(screen.getByText(/siempre/)).toHaveTextContent('siempre')
    expect(screen.getByText(/El motivo solo se ve aquí/)).toBeInTheDocument()
  })

  it('cada motivo con su etiqueta y su explicación (no el valor crudo)', async () => {
    await montar()
    const lista = await irARechazados()
    for (const etiqueta of ['Texto ilegible', 'Punto inexistente', 'Punto desactivado', 'Código no coincide', 'QR demasiado viejo']) {
      expect(lista.getAllByText(etiqueta).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('list', { name: 'Códigos rechazados' }).textContent).not.toMatch(/payload_ilegible|fuera_de_tope|punto_inactivo|codigo_no_coincide|punto_inexistente/)
    expect(lista.getAllByText(/Suele ser otro código leído por error/).length).toBeGreaterThan(0)
    expect(lista.getAllByText(/Es lo que deja una foto del QR enviada tarde/).length).toBe(4)
  })

  it('el conductor con tres QR vencidos se marca ×3 (y el de uno solo, no)', async () => {
    await montar()
    const lista = await irARechazados()
    const vencidos = lista.getAllByRole('listitem').filter((i) => /QR demasiado viejo/.test(i.textContent ?? ''))
    expect(vencidos).toHaveLength(4)
    expect(vencidos.filter((i) => /×3/.test(i.textContent ?? ''))).toHaveLength(3)
    expect(vencidos.filter((i) => /op\.demo02/.test(i.textContent ?? ''))[0]).not.toHaveTextContent('×')
    expect(lista.getAllByText('3 veces ese día', { exact: false }).length).toBe(3)
  })

  it('la antigüedad del QR vencido, como «hace 18 h 2 min»', async () => {
    await montar()
    const lista = await irARechazados()
    expect(lista.getAllByText('hace 18 h 2 min')).toHaveLength(2)
    expect(lista.getByText('hace 18 h 3 min')).toBeInTheDocument()
    expect(lista.getByText('hace 14 min 0 s')).toBeInTheDocument()
  })

  it('lo que leyó la cámara: solo el inicio, con «…», y el punto ausente como «— (no existe)»', async () => {
    await montar()
    const lista = await irARechazados()
    expect(lista.getByText('WAUZZZ8U1HA004123…')).toBeInTheDocument()
    expect(lista.getAllByText('SUM1|1|59734129|dE5a…')).toHaveLength(3) // los tres QR vencidos del mismo conductor
    expect(lista.getAllByText('— (no existe)')).toHaveLength(2)
    expect(lista.getByText('Muelle sur')).toBeInTheDocument()
  })

  it('los chips por motivo y la búsqueda por conductor', async () => {
    await montar()
    await irARechazados()
    await userEvent.click(screen.getByRole('button', { name: 'Texto ilegible' }))
    expect(within(screen.getByRole('list', { name: 'Códigos rechazados' })).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await userEvent.type(screen.getByLabelText('Buscar conductor'), 'demo07')
    expect(within(screen.getByRole('list', { name: 'Códigos rechazados' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('×N solo desde 2: uno no se marca, dos sí', async () => {
    const m = await montar()
    const original = m.api.intentos
    m.api.intentos = async (c) => {
      const leido = await original(c)
      const vencidos = leido.intentos.intentos.filter((i) => i.motivo === 'fuera_de_tope')
      return { ...leido, intentos: { ...leido.intentos, intentos: leido.intentos.intentos.map((i) => (i === vencidos[0] ? { ...i, repeticionesConductorDia: 1 } : i === vencidos[1] ? { ...i, repeticionesConductorDia: 2 } : i)) } }
    }
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(m.estado.intentos).toHaveLength(2))
    const lista = await irARechazados()
    const textos = lista.getAllByRole('listitem').map((i) => i.textContent ?? '')
    expect(textos.some((t) => /×2/.test(t))).toBe(true)
    expect(textos.some((t) => /×1/.test(t))).toBe(false)
  })

  it('«—» donde el QR no es de los vencidos (no hay antigüedad que decir)', async () => {
    await montar()
    const lista = await irARechazados()
    const ilegible = lista.getAllByRole('listitem').find((i) => /Texto ilegible/.test(i.textContent ?? ''))!
    expect(within(ilegible).getByText('Antigüedad del QR').nextSibling).toHaveTextContent('—')
    expect(ilegible).not.toHaveTextContent('hace 0')
  })

  it('«Ningún código rechazado con estos filtros»', async () => {
    await montar()
    await irARechazados()
    await userEvent.type(screen.getByLabelText('Buscar conductor'), 'nadie')
    expect(screen.getByText('Ningún código rechazado con estos filtros')).toBeInTheDocument()
  })

  it('nunca muestra el código completo ni un campo `payload`', async () => {
    await montar()
    await irARechazados()
    expect(document.body.textContent).not.toMatch(/payload|firma completa/i)
  })
})

describe('la ficha de puntos (HU-7)', () => {
  it('una tarjeta por punto con sus reglas, y el secreto solo como texto', async () => {
    await montar()
    await userEvent.click(pestana(/^Puntos/))
    const tarjetas = within(screen.getByRole('list', { hidden: false })).getAllByRole('listitem')
    expect(tarjetas).toHaveLength(3)
    const patio = tarjetas.find((t) => /Patio de llegada/.test(t.textContent ?? ''))!
    expect(patio).toHaveTextContent('Activo')
    expect(patio).toHaveTextContent('-12,050000, -77,050000')
    expect(within(patio).getByText('Radio').nextSibling).toHaveTextContent('100 m')
    expect(within(patio).getByText('Precisión máxima').nextSibling).toHaveTextContent('100 m')
    expect(patio).toHaveTextContent('Peor caso aceptado: 200 m')
    expect(within(patio).getByText('Llegadas del día').nextSibling).toHaveTextContent('16')
    expect(within(patio).getByText('Último escaneo').nextSibling).toHaveTextContent('11:40:35')
    expect(within(patio).getByText('Secreto').nextSibling).toHaveTextContent('guardado · no se muestra nunca')
    const muelle = tarjetas.find((t) => /Muelle sur/.test(t.textContent ?? ''))!
    expect(muelle).toHaveTextContent('Desactivado')
    expect(within(muelle).getByText('Último escaneo').nextSibling).toHaveTextContent('—')
    expect(within(muelle).getByText('Llegadas del día').nextSibling).toHaveTextContent('0')
  })

  it('es solo consulta: ninguna acción que cree, edite o desactive', async () => {
    await montar()
    await userEvent.click(pestana(/^Puntos/))
    expect(screen.getByText(/No se crea, edita ni desactiva nada desde aquí/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /crear|editar|desactivar|activar|guardar|eliminar|borrar/i })).not.toBeInTheDocument()
  })
})

describe('el filtro de día y de punto', () => {
  it('el día de hoy en Lima, con el máximo de 90 días atrás', async () => {
    await montar()
    const dia = screen.getByLabelText('Día') as HTMLInputElement
    expect(dia.value).toBe('2026-10-15')
    expect(dia.max).toBe('2026-10-15')
    expect(dia.min).toBe('2026-07-17')
    expect(screen.getByText('15 oct 2026 · hoy · como máximo 90 días atrás')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeDisabled()
  })

  it('elegir un punto actualiza el resumen, las señales y las listas a la vez', async () => {
    const m = await montar()
    await userEvent.selectOptions(screen.getByLabelText('Punto'), 'Puerta norte')
    await waitFor(() => expect(m.estado.dia.at(-1)).toEqual({ dia: DIA_APENDICE, idPunto: PUERTA }))
    await waitFor(() => expect(resumen().getByText('Llegadas').parentElement).toHaveTextContent('3'))
    expect(resumen().getByText('Puerta norte: 3')).toBeInTheDocument()
    expect(resumen().getByRole('button', { name: /Con flag/ })).toHaveTextContent('1')
    expect(resumen().getByRole('button', { name: /Códigos rechazados/ })).toHaveTextContent('0')
    expect(senales().getByRole('button', { name: /QR vencido, repetido/ })).toHaveTextContent('Ningún conductor')
    expect(filas()).toHaveLength(3)
    expect(pestana(/^Llegadas \(/)).toHaveTextContent('(3)')
  })

  it('un punto sin llegadas pero con rechazos', async () => {
    const m = await montar()
    await userEvent.selectOptions(screen.getByLabelText('Punto'), 'Muelle sur')
    await waitFor(() => expect(m.estado.dia.at(-1)).toMatchObject({ idPunto: 3 }))
    await waitFor(() => expect(resumen().getByRole('button', { name: /Códigos rechazados/ })).toHaveTextContent('1'))
    expect(resumen().getByText('Sin llegadas')).toBeInTheDocument()
    expect(resumen().getByText('Demora mediana').parentElement).toHaveTextContent('0 s')
    expect(screen.getByText('Ninguna llegada con estos filtros')).toBeInTheDocument()
  })

  it('la mediana se escribe con coma decimal y sin ceros de más', async () => {
    const m = await montar()
    expect(resumen().getByText('Demora mediana').parentElement).toHaveTextContent(/^Demora mediana12 s/)
    await userEvent.selectOptions(screen.getByLabelText('Punto'), 'Patio de llegada')
    await waitFor(() => expect(m.estado.dia.at(-1)).toMatchObject({ idPunto: PATIO }))
    await waitFor(() => expect(resumen().getByText('Demora mediana').parentElement).toHaveTextContent('11,5 s'))
  })

  it('volver a «Todos los puntos»', async () => {
    const m = await montar()
    await userEvent.selectOptions(screen.getByLabelText('Punto'), 'Patio de llegada')
    await waitFor(() => expect(m.estado.dia.at(-1)).toEqual({ dia: DIA_APENDICE, idPunto: PATIO }))
    await userEvent.selectOptions(screen.getByLabelText('Punto'), 'Todos los puntos')
    await waitFor(() => expect(m.estado.dia.at(-1)).toEqual({ dia: DIA_APENDICE, idPunto: null }))
    await waitFor(() => expect(filas()).toHaveLength(19))
  })

  it('cambiar el día pide lo de ese día; un día sin datos da ceros', async () => {
    const m = await montar()
    const dia = screen.getByLabelText('Día')
    await act(async () => {
      // `userEvent.type` sobre un `<input type="date">` de jsdom es poco fiable: se dispara el cambio como lo haría el navegador.
      const { fireEvent } = await import('@testing-library/react')
      fireEvent.change(dia, { target: { value: '2026-10-14' } })
    })
    await waitFor(() => expect(m.estado.dia.at(-1)).toEqual({ dia: '2026-10-14', idPunto: null }))
    await waitFor(() => expect(resumen().getByText('Llegadas').parentElement).toHaveTextContent('0'))
    expect(screen.getByText('14 oct 2026 · como máximo 90 días atrás')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeEnabled()
    // El límite de arriba sigue siendo hoy aunque se mire otro día.
    expect((screen.getByLabelText('Día') as HTMLInputElement).max).toBe('2026-10-15')

    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }))
    await waitFor(() => expect(m.estado.dia.at(-1)).toEqual({ dia: DIA_APENDICE, idPunto: null }))
  })

  it('un campo de día vaciado a mano se ignora', async () => {
    const m = await montar()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '' } })
    await new Promise((r) => setTimeout(r, 30))
    expect(m.estado.dia).toHaveLength(1)
  })

  it('mientras llega lo nuevo se ve lo anterior, atenuado', async () => {
    const m = await montar()
    let abrir!: () => void
    m.estado.puerta = new Promise<void>((r) => (abrir = r))
    await userEvent.selectOptions(screen.getByLabelText('Punto'), 'Puerta norte')
    expect(resumen().getByText('Llegadas').parentElement).toHaveTextContent('19')
    expect(screen.getByRole('region', { name: 'Resumen del día' }).parentElement).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled()
    abrir()
    await waitFor(() => expect(screen.getByRole('region', { name: 'Resumen del día' }).parentElement).toHaveAttribute('aria-busy', 'false'))
  })
})

describe('avisos y fallos', () => {
  it('sin conexión: se sigue viendo lo último y se avisa', async () => {
    const m = await montar()
    m.estado.fallo = new ApiError('Sin conexión al backend o internet.')
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByText('Sin conexión. Se muestra lo último recibido.')).toBeInTheDocument()
    expect(resumen().getByText('Llegadas').parentElement).toHaveTextContent('19')
    expect(filas()).toHaveLength(19)
  })

  it('un error del servidor se dice, se puede reintentar y no borra lo que se veía', async () => {
    const m = await montar()
    m.estado.fallo = new ApiError('Error interno.', { status: 500 })
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno.')
    expect(filas()).toHaveLength(19)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('si falla el cambio de punto, dice que lo que se ve es de otro punto', async () => {
    const m = await montar()
    m.estado.fallo = new ApiError('Error interno.', { status: 500 })
    await userEvent.selectOptions(screen.getByLabelText('Punto'), 'Puerta norte')
    expect(await screen.findByText(/Lo que se ve es del 15 oct 2026 · hoy y de otro punto: no se pudo traer lo que elegiste/)).toBeInTheDocument()
    expect(filas()).toHaveLength(19)
  })

  it('las filas inválidas se cuentan y se avisa', async () => {
    const doble = crearTableroDePrueba()
    doble.estado.descartadas = 2
    render(<TableroLlegadasPage sesion={sesion} tablero={doble.tablero} onCerrarSesion={() => undefined} />)
    expect(await screen.findByText(/2 datos no se pudieron mostrar porque llegaron inválidos/)).toBeInTheDocument()
  })

  it('403: «Sin permiso para ver las llegadas», sin cerrar la sesión por sí solo', async () => {
    const doble = crearTableroDePrueba()
    doble.estado.fallo = new ApiError('Permisos insuficientes', { status: 403 })
    const onCerrarSesion = vi.fn()
    render(<TableroLlegadasPage sesion={sesion} tablero={doble.tablero} onCerrarSesion={onCerrarSesion} />)
    expect(await screen.findByRole('heading', { name: 'Sin permiso para ver las llegadas' })).toBeInTheDocument()
    expect(screen.getByText('Permisos insuficientes')).toBeInTheDocument()
    expect(onCerrarSesion).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(onCerrarSesion).toHaveBeenCalledTimes(1)
  })

  it('sin conexión desde el principio: lo dice y no hay datos', async () => {
    const doble = crearTableroDePrueba()
    doble.estado.fallo = new ApiError('Sin conexión al backend o internet.')
    render(<TableroLlegadasPage sesion={sesion} tablero={doble.tablero} onCerrarSesion={() => undefined} />)
    expect(await screen.findByText('Sin conexión. Se muestra lo último recibido.')).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay datos para mostrar.')).toBeInTheDocument()
  })
})

describe('accesibilidad', () => {
  it.each([
    ['la pestaña de llegadas', async () => undefined],
    ['la pestaña de rechazados', async () => void (await irARechazados())],
    ['la pestaña de puntos', async () => userEvent.click(pestana(/^Puntos/))],
  ])('%s no tiene fallos de accesibilidad', async (_nombre, preparar) => {
    const m = await montar()
    await preparar()
    expect(await axe(m.container)).toHaveNoViolations()
  })

  it('los controles principales miden 44 px o más y la letra de las entradas es de 16 px', async () => {
    await montar()
    for (const el of [screen.getByLabelText('Día'), screen.getByLabelText('Punto'), screen.getByLabelText('Buscar conductor')]) {
      expect(el.className).toMatch(/min-h-11|text-base/)
    }
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveClass('min-h-11')
  })
})
