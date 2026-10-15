import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { ApiError } from '@/core/http/ApiError'
import { crearListaSeguimientoDePrueba, trasladoDePrueba } from '@/features/seguimiento/data/testing/fakes'
import type { TrasladoSeguimiento } from '@/features/seguimiento/domain'
import { SeguimientoPage } from './SeguimientoPage'

const SESION: Sesion = { idUsuario: 7, usuario: 'coord.prueba', nombre: 'COORDINADOR PRUEBA', role: 'coordinador', area: null, allowedApps: [] }

// VIN de verdad válidos (17 caracteres, sin I, O ni Q).
const EN_CAMINO = 'LVTDD24B6VDX00231'
const ENTREGADO = 'KMHJB81B1PU123456'
const EN_PLANTA = 'JTDBR32E102345678'
const ANULADO = 'LVTDD24B7VDC81454'
const SIN_ORDEN = 'LVTDD24B6VDX99999'

const TRASLADOS: TrasladoSeguimiento[] = [
  trasladoDePrueba({ idOrden: 1, vin: EN_CAMINO, marca: 'Toyota', modelo: 'Corolla', color: 'Blanco', destino: 'Sede Norte', etapa: 'en_camino', salidaRegistrada: '2026-10-15T12:40:00Z' }),
  trasladoDePrueba({ idOrden: 2, vin: ENTREGADO, marca: 'Hyundai', modelo: 'Tucson', color: 'Gris', destino: 'Sede Sur', etapa: 'entregado', salidaRegistrada: '2026-10-14T13:30:00Z', entregadoEn: '2026-10-14T16:20:00Z' }),
  trasladoDePrueba({ idOrden: 3, vin: EN_PLANTA, marca: 'Kia', modelo: 'Rio', color: 'Plata', destino: 'Sede Norte', etapa: 'en_planta', salidaRegistrada: null }),
  trasladoDePrueba({ idOrden: 4, vin: ANULADO, marca: 'Jetour', modelo: 'T1', color: 'Plata', destino: 'Sede Sur', etapa: 'anulado', salidaRegistrada: null }),
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:03:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  document.body.style.overflow = ''
})

async function montar(traslados: readonly TrasladoSeguimiento[] = TRASLADOS) {
  const m = crearListaSeguimientoDePrueba(traslados)
  const vista = render(<SeguimientoPage sesion={SESION} lista={m.lista} onCerrarSesion={() => undefined} />)
  await screen.findByRole('region', { name: 'Tabla de vehículos' })
  return { ...m, ...vista }
}

const abrirConsulta = async () => userEvent.click(screen.getByRole('button', { name: 'Consulta masiva de VIN' }))
const campo = () => screen.getByRole('textbox', { name: 'VIN a consultar' })
const boton = (nombre: string) => screen.getByRole('button', { name: nombre })
/** Pega la lista (de una vez, como al pegar desde Excel) y consulta. */
async function consultar(texto: string) {
  await userEvent.click(campo())
  await userEvent.paste(texto)
  await userEvent.click(boton('Consultar'))
}
const seccion = () => screen.getByRole('region', { name: 'Consulta masiva de VIN' })

describe('entrar y salir de la consulta masiva', () => {
  it('el botón abre la consulta: otro título, el cuadro para pegar los VIN, y no la lista ni sus filtros', async () => {
    await montar()
    await abrirConsulta()
    expect(screen.getByRole('heading', { level: 1, name: 'Consulta masiva de VIN' })).toBeInTheDocument()
    expect(campo()).toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Buscar vehículo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tabla de vehículos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument()
  })

  it('«Volver a mis vehículos» regresa a la lista, y al volver a la consulta sigue lo escrito y el resultado', async () => {
    await montar()
    await abrirConsulta()
    await consultar(`${EN_CAMINO}\n${SIN_ORDEN}`)
    await screen.findByText(/2 VIN consultados/)

    await userEvent.click(boton('Volver a mis vehículos'))
    expect(screen.getByRole('heading', { level: 1, name: 'Mis vehículos' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tabla de vehículos' })).toBeInTheDocument()

    await abrirConsulta()
    expect(campo()).toHaveValue(`${EN_CAMINO}\n${SIN_ORDEN}`)
    expect(screen.getByText(/2 VIN consultados/)).toBeInTheDocument()
  })

  it('la consulta explica cómo pegar y el máximo', async () => {
    await montar()
    await abrirConsulta()
    expect(seccion()).toHaveTextContent('uno por línea o separados por coma o espacio')
    expect(seccion()).toHaveTextContent('Máximo 200 por consulta')
  })
})

describe('lo que se escribe se lee antes de consultar', () => {
  it('sin VIN, «Consultar» y «Limpiar» no se pueden pulsar', async () => {
    await montar()
    await abrirConsulta()
    expect(boton('Consultar')).toBeDisabled()
    expect(boton('Limpiar')).toBeDisabled()
  })

  it('dice cuántos VIN son, y que los repetidos se consultan una sola vez', async () => {
    await montar()
    await abrirConsulta()
    await userEvent.click(campo())
    await userEvent.paste(`${EN_CAMINO}\n${ENTREGADO}\n${EN_CAMINO.toLowerCase()}`)
    expect(screen.getByText('2 VIN para consultar (1 repetido se consulta una sola vez)')).toBeInTheDocument()
    expect(boton('Consultar')).toBeEnabled()
  })

  it('avisa de lo que no tiene forma de VIN, y no lo consulta', async () => {
    const m = await montar()
    await abrirConsulta()
    await consultar(`${EN_CAMINO} ABC123 LVTDD24B6VDX0023O`)
    expect(screen.getByText(/Estos 2 textos no tienen forma de VIN y no se consultarán: ABC123, LVTDD24B6VDX0023O\./)).toBeInTheDocument()
    expect(screen.getByText(/17 letras y números, sin I, O ni Q/)).toBeInTheDocument()
    await screen.findByText(/1 VIN consultado/)
    expect(m.estado.consultas).toEqual([[EN_CAMINO]])
  })

  it('con solo textos inválidos no hay nada que consultar', async () => {
    await montar()
    await abrirConsulta()
    await userEvent.click(campo())
    await userEvent.paste('ABC123')
    expect(screen.getByText(/Este texto no tiene forma de VIN y no se consultará: ABC123\./)).toBeInTheDocument()
    expect(boton('Consultar')).toBeDisabled()
  })

  it('más de 200 VIN: lo dice, cuántos sobran, y no deja consultar', async () => {
    await montar()
    await abrirConsulta()
    const muchos = Array.from({ length: 201 }, (_, i) => `LVTDD24B6VDX${String(i).padStart(5, '0')}`).join('\n')
    await userEvent.click(campo())
    await userEvent.paste(muchos)
    expect(screen.getByText('Son 201 VIN y el máximo por consulta es 200. Quita 1 para poder consultar.')).toBeInTheDocument()
    expect(boton('Consultar')).toBeDisabled()
  })

  it('exactamente 200 sí se consulta', async () => {
    const m = await montar()
    await abrirConsulta()
    const justos = Array.from({ length: 200 }, (_, i) => `LVTDD24B6VDX${String(i).padStart(5, '0')}`).join('\n')
    await userEvent.click(campo())
    await userEvent.paste(justos)
    expect(boton('Consultar')).toBeEnabled()
    await userEvent.click(boton('Consultar'))
    await screen.findByText(/200 VIN consultados/)
    expect(m.estado.consultas[0]).toHaveLength(200)
  })
})

describe('el resultado', () => {
  it('manda los VIN en mayúsculas, sin repetidos y en el orden pegado', async () => {
    const m = await montar()
    await abrirConsulta()
    await consultar(` ${ENTREGADO.toLowerCase()}, ${EN_CAMINO}\n${ENTREGADO}`)
    await screen.findByText(/2 VIN consultados/)
    expect(m.estado.consultas).toEqual([[ENTREGADO, EN_CAMINO]])
  })

  it('separa los que tienen información de los pendientes, con su resumen', async () => {
    await montar()
    await abrirConsulta()
    await consultar(`${EN_CAMINO}\n${SIN_ORDEN}\n${ENTREGADO}`)

    expect(await screen.findByText('3 VIN consultados: 2 con información y 1 pendientes de información.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Con información (2)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Pendientes de información (1)' })).toBeInTheDocument()
  })

  it('un VIN con información se ve como en la lista: vehículo, destino, etapa y fecha', async () => {
    await montar()
    await abrirConsulta()
    await consultar(EN_CAMINO)
    const tabla = await screen.findByRole('region', { name: 'Tabla de vehículos' })
    for (const texto of ['Toyota Corolla', `VIN ${EN_CAMINO}`, 'Blanco', 'Sede Norte', 'En camino', 'Salida registrada: 15 oct, 07:40', 'Ver detalle']) {
      expect(tabla).toHaveTextContent(texto)
    }
  })

  it('«Ver detalle» de un resultado abre el panel con ese vehículo, y «Cerrar» devuelve a la consulta', async () => {
    await montar()
    await abrirConsulta()
    await consultar(ENTREGADO)
    await userEvent.click((await screen.findAllByRole('button', { name: `Ver detalle de ${ENTREGADO}` }))[0]!)

    const panel = screen.getByRole('dialog', { name: 'Detalle del traslado' })
    expect(within(panel).getByText('Hyundai Tucson')).toBeInTheDocument()
    expect(within(panel).getByText(`VIN ${ENTREGADO}`)).toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(campo()).toHaveValue(ENTREGADO)
  })

  it('el detalle de un resultado se abre aunque ese vehículo no esté en la lista de la pantalla principal', async () => {
    const m = await montar()
    const fuera = trasladoDePrueba({ idOrden: 99, vin: SIN_ORDEN, marca: 'Volkswagen', modelo: 'Nivus', color: 'Negro', etapa: 'entregado', entregadoEn: '2026-09-01T15:00:00Z', salidaRegistrada: '2026-09-01T12:00:00Z' })
    m.estado.respuestaConsulta = { resultados: [{ vin: SIN_ORDEN, informacion: 'disponible', traslado: fuera }], descartados: 0 }
    await abrirConsulta()
    await consultar(SIN_ORDEN)
    await userEvent.click((await screen.findAllByRole('button', { name: `Ver detalle de ${SIN_ORDEN}` }))[0]!)

    const panel = screen.getByRole('dialog', { name: 'Detalle del traslado' })
    expect(within(panel).getByText('Volkswagen Nivus')).toBeInTheDocument()
    expect(within(panel).getByText(`VIN ${SIN_ORDEN}`)).toBeInTheDocument()
  })

  it('un VIN pendiente dice «Pendiente de información» y que aún no está en el plan de despacho, sin ningún otro dato', async () => {
    await montar()
    await abrirConsulta()
    await consultar(SIN_ORDEN)

    const fila = within(await screen.findByRole('list', { name: 'VIN pendientes de información' })).getByRole('listitem')
    expect(fila).toHaveTextContent(`VIN ${SIN_ORDEN}`)
    expect(fila).toHaveTextContent('Pendiente de información')
    expect(fila).toHaveTextContent('Aún no está en el plan de despacho.')
    expect(fila).not.toHaveTextContent(/Ver detalle|En camino|Entregado|Sede/)
    expect(screen.queryByRole('region', { name: 'Tabla de vehículos' })).not.toBeInTheDocument() // sin «Con información»
  })

  it('una orden en planta, una anulada y un VIN sin orden son lo mismo: pendiente de información (no se dice que se anuló)', async () => {
    await montar()
    await abrirConsulta()
    await consultar(`${EN_PLANTA}\n${ANULADO}\n${SIN_ORDEN}`)

    const lista = await screen.findByRole('list', { name: 'VIN pendientes de información' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
    expect(lista).toHaveTextContent(`VIN ${ANULADO}`)
    expect(document.body.textContent).not.toMatch(/anulad|cancelad|Kia|Jetour|En planta/i)
  })

  it('una orden «disponible» que el servidor mande anulada tampoco se enseña', async () => {
    const m = await montar()
    m.estado.respuestaConsulta = { resultados: [{ vin: ANULADO, informacion: 'pendiente' }], descartados: 0 }
    await abrirConsulta()
    await consultar(ANULADO)
    expect(await screen.findByText(/1 VIN consultado: 0 con información y 1 pendientes/)).toBeInTheDocument()
  })

  it('no muestra datos que esta versión no ofrece', async () => {
    await montar()
    await abrirConsulta()
    await consultar(`${EN_CAMINO}\n${SIN_ORDEN}`)
    await screen.findByText(/2 VIN consultados/)
    expect(document.body.textContent).not.toMatch(/PDI|conductor|velocidad|km\/h|foto|gps|satelital|ubicaci[oó]n|en vivo|dispositivo/i)
  })

  it('«Limpiar» borra lo escrito y el resultado', async () => {
    await montar()
    await abrirConsulta()
    await consultar(EN_CAMINO)
    await screen.findByText(/1 VIN consultado/)

    await userEvent.click(boton('Limpiar'))

    expect(campo()).toHaveValue('')
    expect(screen.queryByText(/VIN consultado/)).not.toBeInTheDocument()
    expect(boton('Consultar')).toBeDisabled()
  })

  it('mientras consulta, el botón dice «Consultando…» y no se puede pulsar; un resultado que llega tras «Limpiar» se descarta', async () => {
    const m = await montar()
    let abrirPuerta: () => void = () => undefined
    m.estado.puertaConsulta = new Promise<void>((r) => (abrirPuerta = r))
    await abrirConsulta()
    await consultar(EN_CAMINO)

    expect(screen.getByRole('button', { name: 'Consultando…' })).toBeDisabled()

    // «Limpiar» está bloqueado mientras consulta: no hay forma de que la respuesta pise un campo ya limpio.
    expect(boton('Limpiar')).toBeDisabled()

    abrirPuerta()
    expect(await screen.findByText(/1 VIN consultado/)).toBeInTheDocument()
    expect(boton('Consultar')).toBeEnabled()
  })

  it('salir de la pantalla con la consulta en curso no deja nada colgado ni da error', async () => {
    const m = await montar()
    let abrirPuerta: () => void = () => undefined
    m.estado.puertaConsulta = new Promise<void>((r) => (abrirPuerta = r))
    await abrirConsulta()
    await consultar(EN_CAMINO)

    m.unmount()
    abrirPuerta()
    await vi.waitFor(() => expect(m.estado.consultas).toHaveLength(1))
  })
})

describe('cuando la consulta falla', () => {
  it('sin conexión: lo dice y se puede volver a consultar; lo escrito se conserva', async () => {
    const m = await montar()
    m.estado.falloConsulta = new ApiError('Sin conexión al backend o internet.')
    await abrirConsulta()
    await consultar(EN_CAMINO)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión. Revisa tu internet y vuelve a consultar.')
    expect(campo()).toHaveValue(EN_CAMINO)
    expect(boton('Consultar')).toBeEnabled()

    await userEvent.click(boton('Consultar'))
    expect(await screen.findByText(/1 VIN consultado/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un 403 se dice como falta de permiso, sin sacar al usuario de la pantalla', async () => {
    const m = await montar()
    m.estado.falloConsulta = new ApiError('Permisos insuficientes', { status: 403 })
    await abrirConsulta()
    await consultar(EN_CAMINO)

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu usuario no tiene permiso para hacer consultas. Pide a SUM que lo revise.')
    expect(screen.getByRole('heading', { level: 1, name: 'Consulta masiva de VIN' })).toBeInTheDocument()
  })

  it('un error del servidor se dice con su mensaje', async () => {
    const m = await montar()
    m.estado.falloConsulta = new ApiError('No se pudo hacer la consulta.', { status: 500 })
    await abrirConsulta()
    await consultar(EN_CAMINO)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo hacer la consulta.')
  })

  it('un fallo no borra el último resultado que sí llegó', async () => {
    const m = await montar()
    await abrirConsulta()
    await consultar(EN_CAMINO)
    await screen.findByText(/1 VIN consultado/)

    m.estado.falloConsulta = new ApiError('Sin conexión al backend o internet.')
    await userEvent.click(boton('Consultar'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/1 VIN consultado/)).toBeInTheDocument()
  })

  it('resultados con datos inválidos: avisa cuántos y que se avise a soporte', async () => {
    const m = await montar()
    m.estado.respuestaConsulta = { resultados: [{ vin: SIN_ORDEN, informacion: 'pendiente' }], descartados: 2 }
    await abrirConsulta()
    await consultar(SIN_ORDEN)
    expect(await screen.findByText(/2 resultados no se pudieron mostrar porque llegaron con datos inválidos\. Avisa a soporte\./)).toBeInTheDocument()
  })
})

describe('accesibilidad', () => {
  it('la consulta, con un resultado mixto, no tiene violaciones de axe', async () => {
    const m = await montar()
    await abrirConsulta()
    await consultar(`${EN_CAMINO}\n${ENTREGADO}\n${SIN_ORDEN}\nABC`)
    await screen.findByText(/3 VIN consultados/)
    expect(await axe(m.container)).toHaveNoViolations()
  })

  it('con el detalle abierto desde un resultado tampoco', async () => {
    await montar()
    await abrirConsulta()
    await consultar(EN_CAMINO)
    await userEvent.click((await screen.findAllByRole('button', { name: `Ver detalle de ${EN_CAMINO}` }))[0]!)
    expect(await axe(document.body)).toHaveNoViolations()
  })
})
