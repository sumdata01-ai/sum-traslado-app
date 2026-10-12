/** O-03 en la home: buscar en el sistema un VIN que no está en la lista del teléfono. */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import type { Sesion } from '@/core/auth'
import { ApiError } from '@/core/http/ApiError'
import type { CandidatosLeidos, TrasladoApi, VinIdentificado } from '@/features/traslado/api/trasladoApi'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaConServidor, ordenRemota } from '@/features/traslado/data/testing/fakes'
import type { OrdenRemota } from '@/features/traslado/domain'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }
const VIN = 'LSCABN3E2VE840638'
const ana = { id: 8, username: 'ana', nombreCompleto: 'Ana Pérez' }

interface Opciones {
  lista?: OrdenRemota[]
  buscar?: TrasladoApi['buscarVin']
  identificar?: TrasladoApi['identificarVin']
}

async function montar({ lista = [ordenRemota(1, { vin: 'ZZZ00000000000001' })], buscar, identificar }: Opciones = {}) {
  const m = crearListaConServidor(lista)
  const cat = crearCatalogoDePrueba()
  const id = crearIdentificadorDePrueba({ buscarVin: buscar, identificarVin: identificar })
  const vista = render(<HomePage sesion={sesion} lista={m.lista} catalogo={cat.catalogo} identificador={id.identificador} onCerrarSesion={() => undefined} />)
  await screen.findByText(lista[0]?.vin ?? 'sin ordenes').catch(() => undefined)
  return { ...m, ...vista, id }
}

const filtro = () => screen.getByLabelText('Filtrar por VIN')
const boton = () => screen.getByRole('button', { name: 'Buscar en el sistema' })
const escribir = (texto: string) => userEvent.type(filtro(), texto)
const identificado = (ordenes: OrdenRemota[], vin = VIN): VinIdentificado => ({ vin, ordenes, descartadas: 0 })
const candidatos = (...vins: string[]): CandidatosLeidos => ({ candidatos: vins.map((vin) => ({ vin, marca: 'CHANGAN', modelo: 'CS35' })), descartados: 0 })

describe('cuándo aparece la búsqueda en el sistema', () => {
  it('no aparece mientras no se escribe nada ni cuando el filtro sí encuentra algo en la lista', async () => {
    await montar()
    expect(screen.queryByRole('button', { name: 'Buscar en el sistema' })).not.toBeInTheDocument()
    await escribir('ZZZ0')
    expect(screen.getByText('ZZZ00000000000001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buscar en el sistema' })).not.toBeInTheDocument()
  })

  it('aparece cuando el filtro no encuentra nada en el teléfono, y dice que puede estar sin descargar (no «no existe»)', async () => {
    await montar()
    await escribir('LSCA')
    expect(screen.getByText('¿No aparece en tu lista?')).toBeInTheDocument()
    expect(screen.getByText(/puede estar en el sistema sin haberse descargado/)).toBeInTheDocument()
    expect(boton()).toBeEnabled()
  })

  it('AC5 · con menos de 4 caracteres el botón está deshabilitado, lo explica y no se llama al servidor', async () => {
    const m = await montar()
    await escribir('LSC')
    expect(boton()).toBeDisabled()
    expect(screen.getByText('Escribe al menos 4 caracteres del VIN para buscar en el sistema.')).toBeInTheDocument()
    await userEvent.click(boton())
    expect(m.id.buscarVin).not.toHaveBeenCalled()
    expect(m.id.identificarVin).not.toHaveBeenCalled()
  })

  it('funciona también sin ninguna orden en la lista: el filtro está VISIBLE (no solo presente)', async () => {
    await montar({ lista: [] })
    expect(filtro()).toBeVisible()
    await escribir('LSCA')
    expect(boton()).toBeEnabled()
  })
})

describe('los mensajes de cada caso', () => {
  it('AC2 · 404: «VIN no conocido»', async () => {
    await montar({ identificar: async () => Promise.reject(new ApiError('no está registrado', { status: 404 })) })
    await escribir(VIN)
    await userEvent.click(boton())
    expect(await screen.findByText('VIN no conocido.')).toBeInTheDocument()
    expect(screen.getByText(/no está registrado como vehículo en el sistema/)).toBeInTheDocument()
  })

  it('AC3 · 200 con lista vacía: «sin orden pendiente», un mensaje distinto del 404', async () => {
    await montar({ identificar: async (vin) => identificado([], vin) })
    await escribir(VIN)
    await userEvent.click(boton())
    expect(await screen.findByText('Sin orden pendiente.')).toBeInTheDocument()
    expect(screen.queryByText('VIN no conocido.')).not.toBeInTheDocument()
    expect(screen.getByText(/Espera a que el supervisor de despacho la cree/)).toBeInTheDocument()
  })

  it('AC4 · 422 del servidor: «formato de VIN inválido»', async () => {
    await montar({ identificar: async () => Promise.reject(new ApiError('VIN inválido', { status: 422 })) })
    await escribir(VIN)
    await userEvent.click(boton())
    expect(await screen.findByText('Formato de VIN inválido.')).toBeInTheDocument()
  })

  it('un VIN con una O por un 0 avisa del formato sin llamar al servidor', async () => {
    const m = await montar()
    await escribir('LSCABN3E2VE84063O')
    await userEvent.click(boton())
    expect(await screen.findByText('Formato de VIN inválido.')).toBeInTheDocument()
    expect(m.id.identificarVin).not.toHaveBeenCalled()
  })

  it('sin conexión lo dice (buscar en el sistema necesita internet)', async () => {
    await montar({ identificar: async () => Promise.reject(new ApiError('Sin conexión al backend o internet.')) })
    await escribir(VIN)
    await userEvent.click(boton())
    expect(await screen.findByText('Sin conexión. Buscar en el sistema necesita internet.')).toBeInTheDocument()
  })

  it('un error del servidor se muestra en rojo con su mensaje', async () => {
    await montar({ identificar: async () => Promise.reject(new ApiError('Error interno', { status: 500 })) })
    await escribir(VIN)
    await userEvent.click(boton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno')
  })

  it('mientras busca, dice «Buscando…» y el botón no se puede volver a tocar', async () => {
    let responder: (v: VinIdentificado) => void = () => undefined
    await montar({ identificar: () => new Promise<VinIdentificado>((r) => (responder = r)) })
    await escribir(VIN)
    await userEvent.click(boton())
    expect(screen.getByRole('button', { name: 'Buscando…' })).toBeDisabled()
    expect(screen.getByText('Buscando en el sistema…')).toBeInTheDocument()
    responder(identificado([]))
    await screen.findByText('Sin orden pendiente.')
  })
})

describe('búsqueda parcial: elegir el vehículo', () => {
  it('varios candidatos: se elige uno y se identifica', async () => {
    const m = await montar({
      buscar: async () => candidatos(`${VIN.slice(0, 16)}8`, `${VIN.slice(0, 16)}9`),
      identificar: async (vin) => identificado([ordenRemota(5, { vin })], vin),
    })
    await escribir('LSCABN')
    await userEvent.click(boton())

    expect(await screen.findByText('Elige el vehículo')).toBeInTheDocument()
    expect(screen.getAllByText('CHANGAN CS35')).toHaveLength(2)
    expect(m.id.identificarVin).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`${VIN.slice(0, 16)}9`) }))
    expect(await screen.findByRole('button', { name: new RegExp(`Comenzar despacho ${VIN.slice(0, 16)}9`) })).toBeInTheDocument()
  })

  it('ningún candidato: lo dice con lo buscado', async () => {
    await montar({ buscar: async () => candidatos() })
    await escribir('QQQQ')
    await userEvent.click(boton())
    expect(await screen.findByText('Ningún vehículo del sistema coincide con «QQQQ».')).toBeInTheDocument()
  })

  it('un solo candidato se identifica sin pedir otro toque', async () => {
    await montar({ buscar: async () => candidatos(VIN), identificar: async (vin) => identificado([ordenRemota(5, { vin })], vin) })
    await escribir('LSCABN')
    await userEvent.click(boton())
    expect(await screen.findByRole('button', { name: `Comenzar despacho ${VIN}` })).toBeInTheDocument()
  })
})

describe('qué se puede hacer con una orden hallada', () => {
  it('del pool: «Comenzar despacho» la toma aunque no estuviera en el teléfono, y pasa a «Mis traslados»', async () => {
    const m = await montar({ identificar: async (vin) => identificado([ordenRemota(50, { vin })], vin) })
    m.servidor.ordenes.set(50, ordenRemota(50, { vin: VIN })) // existe en el servidor, no se descargó
    await escribir(VIN)
    await userEvent.click(boton())

    await userEvent.click(await screen.findByRole('button', { name: `Comenzar despacho ${VIN}` }))

    const mias = screen.getByRole('heading', { name: /Mis traslados/ }).closest('section') as HTMLElement
    expect(await within(mias).findByText(VIN)).toBeInTheDocument()
    expect(screen.getByText('La orden es tuya.')).toBeInTheDocument()
    expect(m.servidor.api.tomarOrden).toHaveBeenCalledWith(50)
    await waitFor(() => expect(screen.queryByText('¿No aparece en tu lista?')).not.toBeInTheDocument())
  })

  it('de otra persona: dice de quién es y NO ofrece tomarla ni la mete en «Mis traslados»', async () => {
    const m = await montar({ identificar: async (vin) => identificado([ordenRemota(50, { vin, conductorAsignado: ana })], vin) })
    await escribir(VIN)
    await userEvent.click(boton())

    expect(await screen.findByText(/Asignada a Ana Pérez/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Comenzar despacho LSCABN/ })).not.toBeInTheDocument()
    expect(m.servidor.api.tomarOrden).not.toHaveBeenCalled()
    const mias = screen.getByRole('heading', { name: /Mis traslados/ }).closest('section') as HTMLElement
    expect(within(mias).queryByText(VIN)).not.toBeInTheDocument()
  })

  it('mía: dice que ya es tuya y lleva a «Mis traslados»', async () => {
    const miOrden = ordenRemota(50, { vin: VIN, conductorAsignado: { id: 7, username: 'usuario.prueba', nombreCompleto: null } })
    const m = await montar({ identificar: async (vin) => identificado([{ ...miOrden, vin }], vin) })
    m.servidor.ordenes.set(50, miOrden)
    await escribir(VIN)
    await userEvent.click(boton())

    expect(await screen.findByText('Ya es tuya.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `Ver ${VIN} en mis traslados` }))

    expect(filtro()).toHaveValue(VIN)
    const mias = screen.getByRole('heading', { name: /Mis traslados/ }).closest('section') as HTMLElement
    expect(await within(mias).findByText(VIN)).toBeInTheDocument()
  })

  it('«Ver en mis traslados» lleva el filtro al VIN completo, también si se llegó con una búsqueda parcial', async () => {
    const miOrden = ordenRemota(50, { vin: VIN, conductorAsignado: { id: 7, username: 'usuario.prueba', nombreCompleto: null } })
    const m = await montar({ buscar: async () => candidatos(VIN), identificar: async (vin) => identificado([{ ...miOrden, vin }], vin) })
    m.servidor.ordenes.set(50, miOrden)
    await escribir('LSCABN') // solo un trozo: el filtro NO tiene el VIN completo todavía
    await userEvent.click(boton())
    await screen.findByText('Ya es tuya.')
    expect(filtro()).toHaveValue('LSCABN')

    await userEvent.click(screen.getByRole('button', { name: `Ver ${VIN} en mis traslados` }))

    expect(filtro()).toHaveValue(VIN)
    const mias = screen.getByRole('heading', { name: /Mis traslados/ }).closest('section') as HTMLElement
    expect(await within(mias).findByText(VIN)).toBeInTheDocument()
  })

  it('varias órdenes para el mismo VIN: cada una con su relación', async () => {
    await montar({
      identificar: async (vin) => identificado([ordenRemota(50, { vin }), ordenRemota(51, { vin, conductorAsignado: ana })], vin),
    })
    await escribir(VIN)
    await userEvent.click(boton())

    expect(await screen.findByText('Disponible: todavía no la tomó nadie.')).toBeInTheDocument()
    expect(screen.getByText(/Asignada a Ana Pérez/)).toBeInTheDocument()
  })

  it('si otra persona se adelantó (409), se dice quién y la orden no queda tomada', async () => {
    const m = await montar({ identificar: async (vin) => identificado([ordenRemota(50, { vin })], vin) })
    m.servidor.tomarPorOtro(50, 'Ana Pérez')
    await escribir(VIN)
    await userEvent.click(boton())

    await userEvent.click(await screen.findByRole('button', { name: `Comenzar despacho ${VIN}` }))

    expect(await screen.findByText('La tomó Ana Pérez')).toBeInTheDocument()
  })
})

describe('el resultado vale para lo que se escribió', () => {
  it('al cambiar el filtro el resultado anterior desaparece', async () => {
    await montar({ identificar: async (vin) => identificado([], vin) })
    await escribir(VIN)
    await userEvent.click(boton())
    await screen.findByText('Sin orden pendiente.')

    await userEvent.type(filtro(), 'X')

    expect(screen.queryByText('Sin orden pendiente.')).not.toBeInTheDocument()
  })

  it('una respuesta que llega después de cambiar el filtro no se muestra', async () => {
    let responder: (v: VinIdentificado) => void = () => undefined
    await montar({ identificar: () => new Promise<VinIdentificado>((r) => (responder = r)) })
    await escribir(VIN)
    await userEvent.click(boton())
    await userEvent.type(filtro(), 'X')

    responder(identificado([ordenRemota(50, { vin: VIN })]))
    await new Promise((r) => setTimeout(r, 20))

    expect(screen.queryByText('Disponible: todavía no la tomó nadie.')).not.toBeInTheDocument()
  })
})

describe('accesibilidad', () => {
  it('sin violaciones con cada tipo de resultado', async () => {
    const m = await montar({
      identificar: async (vin) => identificado([ordenRemota(50, { vin }), ordenRemota(51, { vin, conductorAsignado: ana })], vin),
    })
    await escribir(VIN)
    expect(await axe(m.container)).toHaveNoViolations()
    await userEvent.click(boton())
    await screen.findByText('Disponible: todavía no la tomó nadie.')
    expect(await axe(m.container)).toHaveNoViolations()
  })

  it('sin violaciones con candidatos y con un aviso', async () => {
    const m = await montar({ buscar: async () => candidatos(`${VIN.slice(0, 16)}8`, `${VIN.slice(0, 16)}9`) })
    await escribir('LSCABN')
    await userEvent.click(boton())
    await screen.findByText('Elige el vehículo')
    expect(await axe(m.container)).toHaveNoViolations()
  })
})
