import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { ApiError } from '@/core/http/ApiError'
import type { ResultadoMisOrdenes } from '@/features/traslado/api/trasladoApi'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaDePrueba, ordenCacheada, ordenRemota, sinFotos } from '@/features/traslado/data/testing/fakes'
import type { OrdenRemota } from '@/features/traslado/domain'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }
const ana = { id: 7, username: 'ana', nombreCompleto: 'Ana Pérez' }

const respuestaCon = (ordenes: OrdenRemota[], descartadas = 0) => async (): Promise<ResultadoMisOrdenes> => ({ ordenes, descartadas })

function montar(respuesta?: () => Promise<ResultadoMisOrdenes>, opciones: { estricto?: boolean } = {}) {
  const base = crearListaDePrueba(respuesta)
  const alCerrar = vi.fn()
  const pagina = <HomePage sesion={sesion} lista={base.lista} catalogo={crearCatalogoDePrueba().catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={alCerrar} />
  const vista = render(opciones.estricto ? <StrictMode>{pagina}</StrictMode> : pagina)
  return { ...base, alCerrar, ...vista }
}

const seccion = (nombre: RegExp) => within(screen.getByRole('heading', { name: nombre }).closest('section') as HTMLElement)

describe('AC1 · dos secciones que no se fusionan', () => {
  it('muestra «Mis traslados» con las propias y «Disponibles hoy» con las del pool', async () => {
    montar(respuestaCon([ordenRemota(1, { vin: 'MIA0001', conductorAsignado: ana }), ordenRemota(2, { vin: 'POOL0002' })]))

    expect(await screen.findByText('MIA0001')).toBeInTheDocument()
    expect(seccion(/Mis traslados/).getByText('MIA0001')).toBeInTheDocument()
    expect(seccion(/Mis traslados/).queryByText('POOL0002')).not.toBeInTheDocument()
    expect(seccion(/Disponibles hoy/).getByText('POOL0002')).toBeInTheDocument()
    expect(seccion(/Disponibles hoy/).queryByText('MIA0001')).not.toBeInTheDocument()
  })

  it('cada sección muestra cuántas tiene', async () => {
    montar(respuestaCon([ordenRemota(1, { conductorAsignado: ana }), ordenRemota(2), ordenRemota(3)]))
    await screen.findByText('VIN1')
    expect(screen.getByRole('heading', { name: /Mis traslados/ })).toHaveTextContent('1')
    expect(screen.getByRole('heading', { name: /Disponibles hoy/ })).toHaveTextContent('2')
  })

  it('saluda con el nombre (o con el usuario si no hay nombre) y permite cerrar sesión', async () => {
    const { alCerrar } = montar()
    expect(screen.getByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(alCerrar).toHaveBeenCalledTimes(1)
  })

  it('cada sección vacía lo dice con su propio texto', async () => {
    montar(respuestaCon([]))
    expect(await screen.findByText('Todavía no tienes traslados asignados.')).toBeInTheDocument()
    expect(screen.getByText('No hay traslados disponibles hoy.')).toBeInTheDocument()
  })

  it('mientras llega la primera respuesta, sin nada guardado, dice «Cargando» y no «no hay traslados»', async () => {
    montar(() => new Promise<ResultadoMisOrdenes>(() => undefined))
    expect(await screen.findByText('Cargando tus traslados…')).toBeInTheDocument()
    expect(screen.queryByText('No hay traslados disponibles hoy.')).not.toBeInTheDocument()
  })

  it('el modo estricto de React no deja la pantalla sin datos', async () => {
    montar(respuestaCon([ordenRemota(1), ordenRemota(2)]), { estricto: true })
    expect(await screen.findByText('VIN1')).toBeInTheDocument()
    expect(screen.getByText('VIN2')).toBeInTheDocument()
  })
})

describe('AC2 · el color y la etiqueta de cada tarjeta', () => {
  const etiqueta = (texto: string) => screen.getByText(texto)

  it('una orden sin fotos: «Sin empezar», gris', async () => {
    montar(respuestaCon([ordenRemota(1)]))
    await screen.findByText('Sin empezar')
    expect(etiqueta('Sin empezar')).toHaveAttribute('data-tono', 'neutral')
    expect(etiqueta('Sin empezar')).toHaveClass('bg-line')
  })

  it('con las 6 fotos de la salida: «Listo para enviar», verde', async () => {
    const m = montar(respuestaCon([ordenRemota(1)]))
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 6, subidas: 0 } })
    await m.lista.recalcular()
    await screen.findByText('Listo para enviar')
    expect(etiqueta('Listo para enviar')).toHaveAttribute('data-tono', 'success')
    expect(etiqueta('Listo para enviar')).toHaveClass('bg-success-soft')
  })

  it('una cancelada: «Cancelada», roja', async () => {
    montar(respuestaCon([ordenRemota(1, { estado: 'cancelada', conductorAsignado: ana })]))
    await screen.findByText('Cancelada')
    expect(etiqueta('Cancelada')).toHaveAttribute('data-tono', 'danger')
    expect(etiqueta('Cancelada')).toHaveClass('bg-danger-soft')
  })

  it('una en tránsito: «En tránsito — falta entregar», azul', async () => {
    montar(respuestaCon([ordenRemota(1, { estado: 'en_transito', conductorAsignado: ana })]))
    await screen.findByText('En tránsito — falta entregar')
    expect(etiqueta('En tránsito — falta entregar')).toHaveAttribute('data-tono', 'info')
    expect(etiqueta('En tránsito — falta entregar')).toHaveClass('bg-info-soft')
  })

  it('con fotos a medias: «Cargando fotos (3/6)», gris', async () => {
    const m = montar(respuestaCon([ordenRemota(1)]))
    m.fotos.mapa.set(1, { ...sinFotos(), salida: { archivo: 3, subidas: 0 } })
    await m.lista.recalcular()
    await screen.findByText('Cargando fotos (3/6)')
    expect(etiqueta('Cargando fotos (3/6)')).toHaveAttribute('data-tono', 'neutral')
  })

  it('la tarjeta muestra la placa y el destino para reconocer la orden', async () => {
    montar(respuestaCon([ordenRemota(1, { placa: { id: 27, codigo: 'ABC-123' }, destino: { id: 4, nombre: 'Martinez Lujan' } })]))
    expect(await screen.findByText('ABC-123 · Martinez Lujan')).toBeInTheDocument()
  })

  it('sin placa ni destino no deja una línea vacía', async () => {
    montar(respuestaCon([ordenRemota(1, { placa: null, destino: null })]))
    await screen.findByText('VIN1')
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })
})

describe('contador de avance', () => {
  it('aparece desde 2 órdenes propias', async () => {
    montar(respuestaCon([ordenRemota(1, { conductorAsignado: ana }), ordenRemota(2, { conductorAsignado: ana })]))
    expect(await screen.findByRole('group', { name: 'Avance de traslados' })).toHaveTextContent('2sin empezar')
  })

  it('con una sola orden propia no aparece', async () => {
    montar(respuestaCon([ordenRemota(1, { conductorAsignado: ana }), ordenRemota(2), ordenRemota(3)]))
    await screen.findByText('VIN1')
    expect(screen.queryByRole('group', { name: 'Avance de traslados' })).not.toBeInTheDocument()
  })
})

describe('AC3 · el filtro de VIN trabaja sobre lo ya cargado', () => {
  async function conTresOrdenes() {
    const m = montar(
      respuestaCon([
        ordenRemota(1, { vin: 'LSCABN3E2VE840638', conductorAsignado: ana }),
        ordenRemota(2, { vin: 'LSCABN3E2VE111111' }),
        ordenRemota(3, { vin: 'ZZZ999' }),
      ]),
    )
    await screen.findByText('ZZZ999')
    return m
  }
  const campo = () => screen.getByLabelText('Filtrar por VIN')

  it('muestra solo las órdenes que contienen el texto, en las dos secciones', async () => {
    await conTresOrdenes()

    await userEvent.type(campo(), 'lscabn')

    expect(screen.getByText('LSCABN3E2VE840638')).toBeInTheDocument()
    expect(screen.getByText('LSCABN3E2VE111111')).toBeInTheDocument()
    expect(screen.queryByText('ZZZ999')).not.toBeInTheDocument()
  })

  it('no distingue mayúsculas ni espacios en los extremos', async () => {
    await conTresOrdenes()
    await userEvent.type(campo(), '  zzz9  ')
    expect(screen.getByText('ZZZ999')).toBeInTheDocument()
    expect(screen.queryByText('LSCABN3E2VE111111')).not.toBeInTheDocument()
  })

  it('NO consulta al servidor: filtrar funciona sin red', async () => {
    const m = await conTresOrdenes()
    const peticiones = m.misOrdenes.mock.calls.length

    await userEvent.type(campo(), 'ZZZ')

    expect(m.misOrdenes.mock.calls.length).toBe(peticiones)
  })

  it('las cuentas de cada sección siguen al filtro', async () => {
    await conTresOrdenes()
    await userEvent.type(campo(), 'ZZZ')
    expect(screen.getByRole('heading', { name: /Mis traslados/ })).toHaveTextContent('0')
    expect(screen.getByRole('heading', { name: /Disponibles hoy/ })).toHaveTextContent('1')
  })

  it('sin coincidencias lo dice con el texto buscado; al borrar el filtro vuelve todo', async () => {
    await conTresOrdenes()
    await userEvent.type(campo(), 'NOEXISTE')
    expect(screen.getAllByText('Ningún traslado coincide con «NOEXISTE».')).toHaveLength(2)

    await userEvent.clear(campo())
    expect(screen.getByText('ZZZ999')).toBeInTheDocument()
    expect(screen.getByText('LSCABN3E2VE840638')).toBeInTheDocument()
  })

  it('el campo pide al teléfono mayúsculas y sin autocorrección (un VIN no es una palabra)', async () => {
    await conTresOrdenes()
    expect(campo()).toHaveAttribute('autocapitalize', 'characters')
    expect(campo()).toHaveAttribute('autocorrect', 'off')
    expect(campo()).toHaveAttribute('spellcheck', 'false')
    expect(campo()).toHaveClass('text-base') // 16 px: Safari no amplía la página al enfocar
  })

  it('sin ninguna orden el filtro se ofrece igual (O-03): quien no tiene órdenes hoy es quien más necesita buscar un VIN', async () => {
    montar(respuestaCon([]))
    await screen.findByText('No hay traslados disponibles hoy.')
    expect(screen.getByLabelText('Filtrar por VIN')).toBeVisible()
  })

  it('durante la primera carga no se muestra el filtro', async () => {
    montar(() => new Promise<ResultadoMisOrdenes>(() => undefined))
    await screen.findByText('Cargando tus traslados…')
    expect(screen.queryByLabelText('Filtrar por VIN')).not.toBeInTheDocument()
  })
})

describe('AC4 · sin conexión', () => {
  it('muestra el banner ámbar y, debajo, las órdenes guardadas', async () => {
    const m = crearListaDePrueba(() => Promise.reject(new ApiError('Sin conexión al backend o internet.')))
    m.cache.filas = [ordenCacheada(1, { vin: 'GUARDADA1' })]
    m.dueno.fijar(sesion.idUsuario) // son de quien tiene la sesión
    render(<HomePage sesion={sesion} lista={m.lista} catalogo={crearCatalogoDePrueba().catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)

    expect(await screen.findByText(/Sin conexión\. Se muestra lo último guardado/)).toBeInTheDocument()
    expect(screen.getByText('GUARDADA1')).toBeInTheDocument()
    expect(screen.getByText(/Sin conexión\. Se muestra/).closest('[role="status"]')).toHaveClass('bg-warning-soft')
  })

  it('con las órdenes guardadas, filtrar sigue funcionando sin red', async () => {
    const m = crearListaDePrueba(() => Promise.reject(new ApiError('Sin conexión al backend o internet.')))
    m.cache.filas = [ordenCacheada(1, { vin: 'AAA111' }), ordenCacheada(2, { vin: 'BBB222' })]
    m.dueno.fijar(sesion.idUsuario) // son de quien tiene la sesión
    render(<HomePage sesion={sesion} lista={m.lista} catalogo={crearCatalogoDePrueba().catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
    await screen.findByText(/Sin conexión/)

    await userEvent.type(screen.getByLabelText('Filtrar por VIN'), 'BBB')

    expect(screen.getByText('BBB222')).toBeInTheDocument()
    expect(screen.queryByText('AAA111')).not.toBeInTheDocument()
  })

  it('al volver la red se actualiza sola y el aviso desaparece', async () => {
    const respuestas: Array<() => Promise<ResultadoMisOrdenes>> = [
      () => Promise.reject(new ApiError('Sin conexión al backend o internet.')),
      respuestaCon([ordenRemota(9, { vin: 'NUEVA9' })]),
    ]
    montar(() => respuestas.shift()!())
    await screen.findByText(/Sin conexión/)

    window.dispatchEvent(new Event('online'))

    expect(await screen.findByText('NUEVA9')).toBeInTheDocument()
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument()
  })

  it('un error del servidor se muestra como error (rojo), no como falta de conexión', async () => {
    montar(() => Promise.reject(new ApiError('Error interno', { status: 500 })))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno')
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument()
  })
})

describe('«Actualizar»', () => {
  it('vuelve a pedir las órdenes y se deshabilita mientras lo hace', async () => {
    let responder: (r: ResultadoMisOrdenes) => void = () => undefined
    const respuestas: Array<() => Promise<ResultadoMisOrdenes>> = [
      respuestaCon([ordenRemota(1)]),
      () => new Promise<ResultadoMisOrdenes>((resolver) => (responder = resolver)),
    ]
    const m = montar(() => respuestas.shift()!())
    await screen.findByText('VIN1')

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled()

    responder({ ordenes: [ordenRemota(1), ordenRemota(2)], descartadas: 0 })
    expect(await screen.findByText('VIN2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeEnabled()
    expect(m.misOrdenes).toHaveBeenCalledTimes(2)
  })
})

describe('salir de la home', () => {
  it('lo que el servidor conteste después de salir se descarta: no se guarda ni se pinta', async () => {
    let responder: (r: ResultadoMisOrdenes) => void = () => undefined
    const m = montar(() => new Promise<ResultadoMisOrdenes>((resolver) => (responder = resolver)))
    await screen.findByText('Cargando tus traslados…')

    m.unmount()
    responder({ ordenes: [ordenRemota(1)], descartadas: 0 })
    await new Promise((resolver) => setTimeout(resolver, 20))

    expect(m.cache.filas).toEqual([])
    expect(m.lista.getSnapshot().pool).toEqual([])
  })

  it('al desmontarse deja de escuchar el regreso de la red', async () => {
    const m = montar(respuestaCon([ordenRemota(1)]))
    await screen.findByText('VIN1')
    m.unmount()
    const peticiones = m.misOrdenes.mock.calls.length

    window.dispatchEvent(new Event('online'))

    expect(m.misOrdenes.mock.calls.length).toBe(peticiones)
  })
})

describe('órdenes con datos inválidos', () => {
  it('se avisa cuántas no se pudieron mostrar, en vez de callarlo', async () => {
    montar(respuestaCon([ordenRemota(1)], 2))
    expect(await screen.findByText(/2 traslados no se pudieron mostrar/)).toBeInTheDocument()
  })

  it('en singular, con el texto en singular', async () => {
    montar(respuestaCon([ordenRemota(1)], 1))
    expect(await screen.findByText(/Un traslado no se pudo mostrar/)).toBeInTheDocument()
  })
})

describe('AC6 · sin permiso (403)', () => {
  it('muestra «Sin permiso para Traslado» con el mensaje del servidor y un botón para cerrar sesión', async () => {
    const m = montar(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))

    expect(await screen.findByRole('heading', { name: 'Sin permiso para Traslado' })).toBeInTheDocument()
    expect(screen.getByText('Permisos insuficientes')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Mis traslados/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(m.alCerrar).toHaveBeenCalledTimes(1)
  })

  it('NO cierra la sesión por su cuenta', async () => {
    const m = montar(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))
    await screen.findByRole('heading', { name: 'Sin permiso para Traslado' })
    expect(m.alCerrar).not.toHaveBeenCalled()
  })
})

function fijarContextoSeguro(valor: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: valor, configurable: true })
}

describe('herramientas de prueba', () => {
  afterEach(() => fijarContextoSeguro(true))

  it('siguen disponibles al pie, plegadas, y no abren la cámara al cargar', async () => {
    fijarContextoSeguro(true)
    montar(respuestaCon([]))
    await screen.findByText('No hay traslados disponibles hoy.')

    const resumen = screen.getByText('Herramientas de prueba')
    expect(resumen.closest('details')).not.toHaveAttribute('open')
    expect(screen.queryByRole('heading', { name: 'Prueba de cámara' })).not.toBeInTheDocument()

    await userEvent.click(resumen)
    await userEvent.click(screen.getByRole('button', { name: 'Probar la cámara' }))
    expect(screen.getByRole('heading', { name: 'Prueba de cámara' })).toBeInTheDocument()
    // jsdom no tiene cámara: la sesión lo dice en vez de fallar
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no permite usar la cámara'))
  })

  it('indican si hay contexto seguro y cámara', async () => {
    fijarContextoSeguro(true)
    const seguro = montar(respuestaCon([]))
    expect(screen.getByText(/Contexto seguro \(HTTPS\): sí/)).toBeInTheDocument()
    expect(screen.getByText(/Cámara disponible en el navegador: no/)).toBeInTheDocument() // jsdom no expone mediaDevices
    seguro.unmount()

    fijarContextoSeguro(false)
    montar(respuestaCon([]))
    expect(screen.getByText(/Contexto seguro \(HTTPS\): no/)).toBeInTheDocument()
  })
})

describe('accesibilidad', () => {
  it('sin violaciones con órdenes, sin conexión, vacía y sin permiso', async () => {
    const conOrdenes = montar(respuestaCon([ordenRemota(1, { conductorAsignado: ana }), ordenRemota(2, { estado: 'cancelada', conductorAsignado: ana }), ordenRemota(3)]))
    await screen.findByText('VIN3')
    expect(await axe(conOrdenes.container)).toHaveNoViolations()
    conOrdenes.unmount()

    const sinConexion = crearListaDePrueba(() => Promise.reject(new ApiError('Sin conexión al backend o internet.')))
    sinConexion.cache.filas = [ordenCacheada(1)]
    sinConexion.dueno.fijar(sesion.idUsuario) // son de quien tiene la sesión
    const a = render(<HomePage sesion={sesion} lista={sinConexion.lista} catalogo={crearCatalogoDePrueba().catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
    await screen.findByText(/Sin conexión/)
    expect(await axe(a.container)).toHaveNoViolations()
    a.unmount()

    const vacia = montar(respuestaCon([]))
    await screen.findByText('No hay traslados disponibles hoy.')
    expect(await axe(vacia.container)).toHaveNoViolations()
    vacia.unmount()

    const sinPermiso = montar(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))
    await screen.findByRole('heading', { name: 'Sin permiso para Traslado' })
    expect(await axe(sinPermiso.container)).toHaveNoViolations()
  })
})
