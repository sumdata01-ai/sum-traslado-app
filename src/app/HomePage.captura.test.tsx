/** E4-01 en la home: desde una orden propia se abre la captura de la salida o de la entrega. */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sesion } from '@/core/auth'
import { ApiError } from '@/core/http/ApiError'
import type { StorageApi } from '@/features/traslado/api/storageApi'
import { AlmacenEnMemoria } from '@/features/traslado/data/almacenEnMemoria'
import { ConfirmacionTraslado } from '@/features/traslado/data/confirmacionTraslado'
import { SubidaFotos } from '@/features/traslado/data/subidaFotos'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaConServidor, ordenRemota } from '@/features/traslado/data/testing/fakes'
import { type Momento, type OrdenRemota, zonasDe } from '@/features/traslado/domain'
import { HomePage } from './HomePage'

const sesion: Sesion = { idUsuario: 7, usuario: 'usuario.prueba', nombre: 'OPERARIO PRUEBA', role: 'operario', area: 'secado', allowedApps: ['traslado'] }
const yo = { id: 7, username: 'usuario.prueba', nombreCompleto: 'OPERARIO PRUEBA' }
const placa = { id: 3, codigo: 'ABC-123' }

afterEach(() => vi.restoreAllMocks())

async function montar(ordenes: OrdenRemota[], conFotos = true) {
  const m = crearListaConServidor(ordenes)
  const store = new AlmacenEnMemoria()
  const subidas = new SubidaFotos({ store, storage: { pedirUrlDeSubida: vi.fn() } as unknown as StorageApi })
  const vista = render(
    <HomePage
      sesion={sesion}
      lista={m.lista}
      catalogo={crearCatalogoDePrueba().catalogo}
      identificador={crearIdentificadorDePrueba().identificador}
      fotos={conFotos ? { store, subidas, confirmacion: new ConfirmacionTraslado({ api: m.servidor.api, store, lista: m.lista }) } : undefined}
      onCerrarSesion={() => undefined}
    />,
  )
  await screen.findByText(ordenes[0]?.vin ?? '')
  /** Deja las fotos de un tramo ya tomadas y subidas, como si el operario hubiera terminado. */
  async function fotosSubidas(ordenId: number, momento: Momento, cuantas = zonasDe(momento).length) {
    for (const zona of zonasDe(momento).slice(0, cuantas)) {
      const guardada = await store.guardar({ ordenId, momento }, zona, { blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), ancho: 1, alto: 1, creadaEn: 5_000 })
      await store.marcarSubida(guardada.clientId, `traslado/${ordenId}/${zona}.jpg`)
    }
  }
  return { ...m, ...vista, store, fotosSubidas }
}

describe('el botón de fotografiar', () => {
  it('una orden propia pendiente con placa ofrece «Fotografiar salida»', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', placa, conductorAsignado: yo })])
    expect(screen.getByRole('button', { name: 'Fotografiar salida VIN-UNO' })).toBeEnabled()
  })

  it('una orden propia en tránsito ofrece «Fotografiar entrega»', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', estado: 'en_transito', placa, conductorAsignado: yo })])
    expect(screen.getByRole('button', { name: 'Fotografiar entrega VIN-UNO' })).toBeInTheDocument()
  })

  it('sin placa no se puede fotografiar la salida: falta elegirla', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', conductorAsignado: yo })])
    expect(screen.queryByRole('button', { name: /Fotografiar/ })).not.toBeInTheDocument()
    expect(screen.getByText('Elige la placa para poder fotografiar la salida.')).toBeInTheDocument()
  })

  it('una orden del pool no se fotografía: primero se toma', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', placa })])
    expect(screen.queryByRole('button', { name: /Fotografiar/ })).not.toBeInTheDocument()
  })

  it('una orden ya realizada no ofrece fotografiar', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', estado: 'realizado', placa, conductorAsignado: yo })])
    expect(screen.queryByRole('button', { name: /Fotografiar/ })).not.toBeInTheDocument()
  })

  it('sin la parte de fotos configurada no hay botón (la home sigue funcionando)', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', placa, conductorAsignado: yo })], false)
    expect(screen.queryByRole('button', { name: /Fotografiar/ })).not.toBeInTheDocument()
  })
})

describe('la pantalla de captura', () => {
  it('se abre con el VIN y el momento, y «Volver» regresa a la lista', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', placa, conductorAsignado: yo })])

    await userEvent.click(screen.getByRole('button', { name: 'Fotografiar salida VIN-UNO' }))

    expect(await screen.findByText('Fotos de la salida')).toBeInTheDocument()
    expect(screen.getByText('VIN-UNO')).toBeInTheDocument()
    expect(screen.getByText('0/6 fotos subidas')).toBeInTheDocument() // el subidor está conectado a la pantalla
    expect(screen.queryByText('Mis traslados')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: /Mis traslados/ })).toBeInTheDocument())
    expect(screen.queryByText('Fotos de la salida')).not.toBeInTheDocument()
  })

  it('la entrega abre las cinco zonas', async () => {
    await montar([ordenRemota(1, { vin: 'VIN-UNO', estado: 'en_transito', placa, conductorAsignado: yo })])
    await userEvent.click(screen.getByRole('button', { name: 'Fotografiar entrega VIN-UNO' }))
    expect(await screen.findByText('Fotos de la entrega')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })
})

describe('E4-02 · Confirmar salida / Confirmar entrega', () => {
  it('con las 6 fotos subidas, «Confirmar salida» registra el despacho, vuelve a la lista y lo dice en verde', async () => {
    const m = await montar([ordenRemota(1, { vin: 'VIN-UNO', placa, conductorAsignado: yo })])
    await m.fotosSubidas(1, 'salida')
    await userEvent.click(screen.getByRole('button', { name: 'Fotografiar salida VIN-UNO' }))

    const confirmar = await screen.findByRole('button', { name: 'Confirmar salida' })
    await waitFor(() => expect(confirmar).toBeEnabled())
    await userEvent.click(confirmar)

    expect(await screen.findByText('Salida confirmada. El traslado quedó en tránsito.')).toBeInTheDocument()
    expect(m.servidor.api.confirmarSalida).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Fotos de la salida')).not.toBeInTheDocument()
    // La orden sigue en «Mis traslados», ahora lista para la entrega.
    expect(await screen.findByRole('button', { name: 'Fotografiar entrega VIN-UNO' })).toBeInTheDocument()
  })

  it('con fotos sin tomar el botón está deshabilitado y dice cuántas faltan; no se llama al servidor', async () => {
    const m = await montar([ordenRemota(1, { vin: 'VIN-UNO', placa, conductorAsignado: yo })])
    await m.fotosSubidas(1, 'salida', 4)
    await userEvent.click(screen.getByRole('button', { name: 'Fotografiar salida VIN-UNO' }))

    const confirmar = await screen.findByRole('button', { name: 'Confirmar salida' })
    expect(confirmar).toBeDisabled()
    expect(screen.getByText('Faltan 2 fotos por tomar.')).toBeInTheDocument()
    expect(confirmar).toHaveAccessibleDescription('Faltan 2 fotos por tomar.')
    await userEvent.click(confirmar)
    expect(m.servidor.api.confirmarSalida).not.toHaveBeenCalled()
  })

  it('si el servidor la rechaza muestra el motivo, se queda en la pantalla y deja «Reintentar»', async () => {
    const m = await montar([ordenRemota(1, { vin: 'VIN-UNO', placa, conductorAsignado: yo })])
    await m.fotosSubidas(1, 'salida')
    m.servidor.estado.sinRed = false
    const original = m.servidor.api.confirmarSalida
    m.servidor.api.confirmarSalida = (async () => {
      throw new ApiError('Se esperan exactamente 6 fotos.', { status: 422 })
    }) as never
    await userEvent.click(screen.getByRole('button', { name: 'Fotografiar salida VIN-UNO' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar salida' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar salida' }))

    expect(await screen.findByText('Se esperan exactamente 6 fotos.')).toBeInTheDocument()
    expect(screen.getByText('Fotos de la salida')).toBeInTheDocument()

    m.servidor.api.confirmarSalida = original
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar: confirmar salida' }))
    expect(await screen.findByText('Salida confirmada. El traslado quedó en tránsito.')).toBeInTheDocument()
  })

  it('descartada por el supervisor: vuelve a la lista con un aviso en ámbar, no en rojo', async () => {
    const m = await montar([ordenRemota(1, { vin: 'VIN-UNO', placa, conductorAsignado: yo })])
    await m.fotosSubidas(1, 'salida')
    m.servidor.api.confirmarSalida = (async (idOrden: number) => ({ resultado: 'descartada_por_supervisor', idOrden, estado: 'cancelada', motivo: 'orden_cancelada' })) as never
    await userEvent.click(screen.getByRole('button', { name: 'Fotografiar salida VIN-UNO' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar salida' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar salida' }))

    const aviso = await screen.findByText(/canceló esta orden/)
    expect(aviso.closest('[role="status"]')).toHaveClass('bg-warning-soft')
  })

  it('la entrega: «Confirmar entrega» con las 5 fotos cierra y la orden sale de la lista', async () => {
    const m = await montar([ordenRemota(1, { vin: 'VIN-UNO', estado: 'en_transito', placa, conductorAsignado: yo })])
    await m.fotosSubidas(1, 'entrega')
    await userEvent.click(screen.getByRole('button', { name: 'Fotografiar entrega VIN-UNO' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

    expect(await screen.findByText('Entrega confirmada. El traslado quedó cerrado.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('VIN-UNO')).not.toBeInTheDocument())
  })
})
