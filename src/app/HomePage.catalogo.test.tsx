/** O-04 en la home: elegir la placa y el proveedor de una orden propia que sale de la hoja. */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { ApiError } from '@/core/http/ApiError'
import type { Sesion } from '@/core/auth'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaConServidor, ordenRemota } from '@/features/traslado/data/testing/fakes'
import type { Catalogos, OrdenRemota } from '@/features/traslado/domain'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }

const catalogos: Catalogos = {
  placas: [
    { id: 1, nombre: 'EEB577', estado: 'en_uso' },
    { id: 2, nombre: 'EEB578', estado: 'disponible' },
    { id: 3, nombre: 'PR-045', estado: 'disponible' },
  ],
  proveedores: [
    { id: 6, nombre: 'BENAVIDES', estado: null },
    { id: 4, nombre: 'M&C', estado: null },
  ],
}

const propia = (id: number, extra: Partial<OrdenRemota> = {}) =>
  ordenRemota(id, { vin: `VIN-${id}`, conductorAsignado: { id: 7, username: 'usuario.prueba', nombreCompleto: null }, ...extra })

async function montar(inicial: OrdenRemota[] = [propia(1)], datos: Catalogos | null = catalogos) {
  const m = crearListaConServidor(inicial)
  const cat = crearCatalogoDePrueba(datos ?? { placas: [], proveedores: [] })
  if (datos === null) cat.pedir.mockRejectedValue(new ApiError('Sin conexión al backend o internet.'))
  const vista = render(<HomePage sesion={sesion} lista={m.lista} catalogo={cat.catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
  await screen.findByText(inicial[0]?.vin ?? '')
  return { ...m, ...vista, cat }
}

const placa = () => screen.getByRole('combobox', { name: /Placa rotativa de VIN-1/ })
const proveedor = () => screen.getByRole('combobox', { name: /Proveedor de VIN-1/ })
// Elegido, el campo pasa a solo lectura (un grupo con la elección) con un lápiz al costado (O-04b).
const grupoPlaca = () => screen.findByRole('group', { name: /Placa rotativa de VIN-1/ })
const grupoProveedor = () => screen.findByRole('group', { name: /Proveedor de VIN-1/ })
const lapizPlaca = () => screen.findByRole('button', { name: /Editar Placa rotativa de VIN-1/ })
const lapizProveedor = () => screen.findByRole('button', { name: /Editar Proveedor de VIN-1/ })

describe('AC1 · el selector de placa y proveedor en la orden', () => {
  it('una orden de la hoja sin placa ni proveedor los pide, y avisa que sin placa no se fotografía la salida', async () => {
    await montar()
    expect(await screen.findByRole('combobox', { name: /Placa rotativa de VIN-1/ })).toBeInTheDocument()
    expect(proveedor()).toBeInTheDocument()
    expect(screen.getByText('Elige la placa para poder fotografiar la salida.')).toBeInTheDocument()
  })

  it('se puede filtrar por código en la placa, con la lista limitada a 224 px', async () => {
    await montar()
    await userEvent.type(placa(), 'eeb')
    const lista = screen.getByRole('listbox', { name: /Placa rotativa/ })
    expect(lista).toHaveClass('max-h-56')
    expect(within(lista).getAllByRole('option').map((o) => o.textContent)).toEqual(['EEB577 · afuera', 'EEB578'])
  })

  it('elegir la placa la guarda, la muestra en la tarjeta y quita el aviso', async () => {
    const m = await montar()
    await userEvent.click(placa())
    await userEvent.click(screen.getByRole('option', { name: 'EEB578' }))

    expect(await screen.findByText(/EEB578 ·/)).toBeInTheDocument() // en el detalle de la tarjeta
    expect(screen.queryByText('Elige la placa para poder fotografiar la salida.')).not.toBeInTheDocument()
    expect(await grupoPlaca()).toHaveTextContent('EEB578')
    expect(await m.elecciones.listar(7)).toMatchObject([{ idOrden: 1, placa: { id: 2 } }])
  })

  it('elegir el proveedor conserva la placa', async () => {
    await montar()
    await userEvent.click(placa())
    await userEvent.click(screen.getByRole('option', { name: 'EEB578' }))
    await userEvent.click(proveedor())
    await userEvent.click(screen.getByRole('option', { name: 'BENAVIDES' }))
    expect(await grupoPlaca()).toHaveTextContent('EEB578')
    expect(await grupoProveedor()).toHaveTextContent('BENAVIDES')
  })

  it('lo que trae el servidor no se ofrece para cambiar', async () => {
    await montar([propia(1, { placa: { id: 9, codigo: 'SERVIDOR' }, proveedor: { id: 8, nombre: 'DEL SERVIDOR' } })])
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('si solo falta el proveedor, solo se pide el proveedor', async () => {
    await montar([propia(1, { placa: { id: 9, codigo: 'SERVIDOR' } })])
    expect(await screen.findByRole('combobox', { name: /Proveedor de VIN-1/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Placa rotativa/ })).not.toBeInTheDocument()
  })

  it('en la entrega (en tránsito) no se elige nada', async () => {
    await montar([propia(1, { estado: 'en_transito' })])
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('las órdenes del pool no piden elegir hasta que se toman', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-1' })])
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('O-04b · corregir con el lápiz', () => {
  const llamadasAlServidor = (m: Awaited<ReturnType<typeof montar>>) =>
    [m.servidor.api.misOrdenes, m.servidor.api.catalogos, m.servidor.api.tomarOrden, m.servidor.api.soltarOrden].map((f) => (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length)

  async function elegirPlaca(nombre: string) {
    await userEvent.click(placa())
    await userEvent.click(screen.getByRole('option', { name: nombre }))
  }

  it('AC1 · antes de elegir no hay lápiz', async () => {
    await montar()
    await screen.findByRole('combobox', { name: /Placa rotativa/ })
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('AC2 · tras elegir la placa aparece su lápiz; el del proveedor no, porque no se eligió', async () => {
    await montar()
    await elegirPlaca('EEB578')
    expect(await lapizPlaca()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar Proveedor/ })).not.toBeInTheDocument()
    expect(proveedor()).toBeInTheDocument() // sigue siendo el selector
  })

  it('AC3 y AC4 · el lápiz reabre el selector y se puede corregir una y otra vez', async () => {
    const m = await montar()
    await elegirPlaca('EEB578')

    await userEvent.click(await lapizPlaca())
    expect(placa()).toHaveFocus()
    await userEvent.click(screen.getByRole('option', { name: 'PR-045' }))
    expect(await grupoPlaca()).toHaveTextContent('PR-045')

    await userEvent.click(await lapizPlaca())
    await userEvent.click(screen.getByRole('option', { name: 'EEB577 · afuera' }))
    expect(await grupoPlaca()).toHaveTextContent('EEB577 · afuera')
    expect(await m.elecciones.listar(7)).toMatchObject([{ idOrden: 1, placa: { id: 1 } }]) // lo último quedó guardado
  })

  it('AC5 · abrir el lápiz y salir sin elegir conserva la elección anterior', async () => {
    const m = await montar()
    await elegirPlaca('EEB578')
    await userEvent.click(await lapizPlaca())
    await userEvent.keyboard('{Escape}')

    expect(await grupoPlaca()).toHaveTextContent('EEB578')
    expect(await m.elecciones.listar(7)).toMatchObject([{ placa: { id: 2 } }])
  })

  it('AC7 · corregir la placa no cambia el proveedor, y al revés', async () => {
    await montar()
    await elegirPlaca('EEB578')
    await userEvent.click(proveedor())
    await userEvent.click(screen.getByRole('option', { name: 'BENAVIDES' }))

    await userEvent.click(await lapizPlaca())
    await userEvent.click(screen.getByRole('option', { name: 'PR-045' }))
    expect(await grupoProveedor()).toHaveTextContent('BENAVIDES')

    await userEvent.click(await lapizProveedor())
    await userEvent.click(screen.getByRole('option', { name: 'M&C' }))
    expect(await grupoPlaca()).toHaveTextContent('PR-045')
    expect(await grupoProveedor()).toHaveTextContent('M&C')
  })

  it('corregir no manda NADA al servidor', async () => {
    const m = await montar()
    const antes = llamadasAlServidor(m)

    await elegirPlaca('EEB578')
    await userEvent.click(await lapizPlaca())
    await userEvent.click(screen.getByRole('option', { name: 'PR-045' }))
    await userEvent.click(await lapizPlaca())
    await userEvent.keyboard('{Escape}')

    expect(llamadasAlServidor(m)).toEqual(antes)
  })

  it('lo ya elegido se sigue mostrando, con su lápiz, aunque el catálogo no esté descargado', async () => {
    const m = crearListaConServidor([propia(1)])
    await m.elecciones.guardar({ idOrden: 1, idUsuario: 7, placa: { id: 2, nombre: 'EEB578', estado: 'disponible' }, proveedor: { id: 6, nombre: 'BENAVIDES', estado: null }, elegidaEn: 1 })
    const cat = crearCatalogoDePrueba(catalogos)
    cat.pedir.mockRejectedValue(new ApiError('Sin conexión al backend o internet.')) // y nunca se descargó
    render(<HomePage sesion={sesion} lista={m.lista} catalogo={cat.catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)

    expect(await grupoPlaca()).toHaveTextContent('EEB578')
    expect(await grupoProveedor()).toHaveTextContent('BENAVIDES')
    expect(await lapizPlaca()).toBeInTheDocument()
    expect(await lapizProveedor()).toBeInTheDocument()
  })

  it('AC6 · lo que trae el servidor no tiene lápiz', async () => {
    await montar([propia(1, { placa: { id: 9, codigo: 'SERVIDOR' }, proveedor: { id: 8, nombre: 'DEL SERVIDOR' } })])
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('con varias órdenes cada lápiz dice de cuál es', async () => {
    const m = crearListaConServidor([propia(1), propia(2, { vin: 'VIN-2' })])
    const cat = crearCatalogoDePrueba(catalogos)
    render(<HomePage sesion={sesion} lista={m.lista} catalogo={cat.catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
    await screen.findByText('VIN-1')
    await userEvent.click(await screen.findByRole('combobox', { name: /Placa rotativa de VIN-1/ }))
    await userEvent.click(screen.getByRole('option', { name: 'EEB578' }))

    expect(await screen.findByRole('button', { name: /Editar Placa rotativa de VIN-1/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar Placa rotativa de VIN-2/ })).not.toBeInTheDocument()
  })

  it('AC8 · sin violaciones de accesibilidad con lápices y con un selector abierto desde un lápiz', async () => {
    const m = await montar()
    await elegirPlaca('EEB578')
    await lapizPlaca()
    expect(await axe(m.container)).toHaveNoViolations()
    await userEvent.click(await lapizPlaca())
    expect(await axe(m.container)).toHaveNoViolations()
  })
})

describe('AC3 · sin conexión se usa el catálogo guardado', () => {
  it('con el catálogo ya descargado antes, el selector funciona aunque no haya red', async () => {
    const m = crearListaConServidor([propia(1)])
    const cat = crearCatalogoDePrueba(catalogos)
    cat.cache.guardado = catalogos // se descargó en una visita anterior
    cat.pedir.mockRejectedValue(new ApiError('Sin conexión al backend o internet.'))
    render(<HomePage sesion={sesion} lista={m.lista} catalogo={cat.catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
    await screen.findByText('VIN-1')

    await userEvent.click(await screen.findByRole('combobox', { name: /Placa rotativa/ }))
    expect(await screen.findAllByRole('option')).toHaveLength(3)
  })

  it('si nunca se descargó y no hay red, el selector lo explica en vez de quedar mudo', async () => {
    await montar([propia(1)], null)
    expect(await screen.findByText(/Las placas todavía no se descargaron/)).toBeInTheDocument()
    expect(screen.getByText(/Los proveedores todavía no se descargaron/)).toBeInTheDocument()
  })

  it('elegir funciona sin conexión: queda en el teléfono', async () => {
    const m = await montar([propia(1)], catalogos)
    m.servidor.estado.sinRed = true // se corta la red con la lista ya cargada
    await userEvent.click(await screen.findByRole('combobox', { name: /Placa rotativa/ }))
    await userEvent.click(screen.getByRole('option', { name: 'EEB578' }))
    expect(await m.elecciones.listar(7)).toHaveLength(1)
  })
})

describe('errores del catálogo', () => {
  it('un mensaje que ya termina en punto no lleva dos', async () => {
    const m = crearListaConServidor([propia(1)])
    const cat = crearCatalogoDePrueba(catalogos)
    cat.pedir.mockRejectedValue(new TypeError('raro')) // mensaje general: «No se pudieron traer las placas y proveedores.»
    render(<HomePage sesion={sesion} lista={m.lista} catalogo={cat.catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
    await screen.findByText('VIN-1')
    expect(await screen.findByText('No se pudieron traer las placas y proveedores. Se usan las placas y proveedores guardados.')).toBeInTheDocument()
  })

  it('un error del servidor al traer el catálogo se avisa sin ocultar las órdenes', async () => {
    const m = crearListaConServidor([propia(1)])
    const cat = crearCatalogoDePrueba(catalogos)
    cat.pedir.mockRejectedValue(new ApiError('Error interno', { status: 500 }))
    render(<HomePage sesion={sesion} lista={m.lista} catalogo={cat.catalogo} identificador={crearIdentificadorDePrueba().identificador} onCerrarSesion={() => undefined} />)
    await screen.findByText('VIN-1')
    expect(await screen.findByText(/Error interno\. Se usan las placas y proveedores guardados\./)).toBeInTheDocument()
  })
})

describe('accesibilidad', () => {
  it('sin violaciones con los selectores cerrados y con uno abierto', async () => {
    const m = await montar()
    await screen.findByRole('combobox', { name: /Placa rotativa/ })
    expect(await axe(m.container)).toHaveNoViolations()
    await userEvent.click(placa())
    expect(await axe(m.container)).toHaveNoViolations()
  })
})
