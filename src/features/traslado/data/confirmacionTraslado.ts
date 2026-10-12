import { ApiError } from '@/core/http/ApiError'
import type { TrasladoApi } from '../api/trasladoApi'
import { type Momento, fechaMedida, mensajeDelProblema, validarConfirmacion } from '../domain'
import type { FotoStorePort } from './fotoStorePort'
import type { ListaOrdenes } from './listaOrdenes'

export type ResultadoConfirmar =
  /** El servidor registró el despacho. Lo guardado en el teléfono ya se limpió. */
  | { tipo: 'confirmada'; mensaje: string }
  /** El supervisor canceló o reasignó la orden: NO es un error, pero el traslado no sigue. */
  | { tipo: 'descartada'; mensaje: string }
  /** No se llamó al servidor: falta algo. `problemas` dice qué. */
  | { tipo: 'incompleta'; mensaje: string; problemas: string[] }
  /** No se pudo confirmar. No se borró nada; «Reintentar» es seguro. */
  | { tipo: 'fallida'; mensaje: string }

export interface OpcionesConfirmacion {
  api: Pick<TrasladoApi, 'confirmarSalida' | 'confirmarEntrega'>
  store: Pick<FotoStorePort, 'listar'>
  lista: Pick<ListaOrdenes, 'getSnapshot' | 'actualizar' | 'alConfirmar'>
}

const NOMBRE: Record<Momento, string> = { salida: 'La salida', entrega: 'La entrega' }

const MENSAJE_DE_DESCARTE: Record<string, string> = {
  orden_cancelada: 'El supervisor canceló esta orden, así que el traslado no sigue. Tus fotos quedaron registradas en el sistema.',
  orden_reasignada: 'El supervisor asignó esta orden a otra persona, así que ya no es tuya. Tus fotos quedaron registradas en el sistema.',
}
const DESCARTE_SIN_MOTIVO = 'El supervisor descartó este traslado, así que no sigue. Tus fotos quedaron registradas en el sistema.'

/**
 * «Confirmar salida» / «Confirmar entrega» (E4-02). Las fotos **ya están subidas** (E4-01): esto solo
 * registra el despacho con sus referencias. Antes de llamar al servidor comprueba que estén todas, de
 * zonas distintas y subidas; si algo falla (red, 4xx, respuesta rara) **no borra nada** y repetirlo es
 * seguro, porque el servidor reconoce al mismo conductor y no duplica.
 *
 * Una confirmación por orden a la vez: pedirla de nuevo mientras va en curso comparte la primera.
 */
export class ConfirmacionTraslado {
  readonly #api: OpcionesConfirmacion['api']
  readonly #store: OpcionesConfirmacion['store']
  readonly #lista: OpcionesConfirmacion['lista']
  readonly #enCurso = new Map<number, Promise<ResultadoConfirmar>>()

  constructor(opciones: OpcionesConfirmacion) {
    this.#api = opciones.api
    this.#store = opciones.store
    this.#lista = opciones.lista
  }

  confirmar(idOrden: number, momento: Momento): Promise<ResultadoConfirmar> {
    const activa = this.#enCurso.get(idOrden)
    if (activa) return activa
    const nueva = this.#confirmar(idOrden, momento).finally(() => this.#enCurso.delete(idOrden))
    this.#enCurso.set(idOrden, nueva)
    return nueva
  }

  async #confirmar(idOrden: number, momento: Momento): Promise<ResultadoConfirmar> {
    let vista = this.#buscar(idOrden)
    if (!vista) return { tipo: 'fallida', mensaje: 'Esa orden ya no está en tu lista.' }
    if (vista.orden.tomaSync === 'perdida') return { tipo: 'fallida', mensaje: 'Esta orden la tomó otra persona: ya no es tuya.' }

    // La toma hecha sin señal tiene que estar registrada antes: si no, el servidor no sabe de quién es.
    if (vista.orden.tomaSync === 'pendiente') {
      await this.#lista.actualizar()
      vista = this.#buscar(idOrden)
      if (!vista) return { tipo: 'fallida', mensaje: 'Esa orden ya no está en tu lista.' }
      if (vista.orden.tomaSync === 'pendiente') {
        return { tipo: 'fallida', mensaje: 'La toma de esta orden todavía no se registró en el servidor. Revisa tu conexión y vuelve a intentar.' }
      }
      if (vista.orden.tomaSync === 'perdida') return { tipo: 'fallida', mensaje: 'Esta orden la tomó otra persona: ya no es tuya.' }
    }
    if (vista.momento !== momento) {
      return { tipo: 'fallida', mensaje: `${NOMBRE[momento]} ya no corresponde a esta orden. Vuelve a la lista.` }
    }
    const { orden } = vista

    let guardadas
    try {
      guardadas = await this.#store.listar({ ordenId: idOrden, momento })
    } catch {
      return { tipo: 'fallida', mensaje: 'No se pudieron leer las fotos de este teléfono.' }
    }
    const validacion = validarConfirmacion(momento, guardadas.map((f) => ({ zona: f.zona, storageKey: f.storageKey })))
    const problemas = validacion.ok ? [] : validacion.problemas.map(mensajeDelProblema)
    if (momento === 'salida' && orden.placa === null) problemas.push('Falta elegir la placa.')
    if (problemas.length > 0) return { tipo: 'incompleta', mensaje: 'Todavía no se puede confirmar.', problemas }

    // `validarConfirmacion` ya comprobó que todas tienen ruta; el filtro es para el tipo.
    const fotos = guardadas.flatMap((f) => (f.storageKey ? [{ zona: f.zona, storageKey: f.storageKey }] : []))
    const instante = fechaMedida(guardadas.map((f) => ({ createdAt: f.creadaEn })))

    let resultado
    try {
      resultado =
        momento === 'salida'
          ? await this.#api.confirmarSalida(idOrden, {
              fotos,
              idConductorEsperado: orden.conductorAsignado?.id ?? null,
              idPlaca: orden.placa?.id ?? null,
              idProveedor: orden.proveedor?.id ?? null,
              fechaSalida: instante,
            })
          : await this.#api.confirmarEntrega(idOrden, { fotos, fechaEntrega: instante })
    } catch (error) {
      return { tipo: 'fallida', mensaje: mensajeDeFallo(error, momento) }
    }

    if (resultado.resultado === 'descartada_por_supervisor') {
      await this.#lista.alConfirmar(idOrden, momento, 'descartada')
      return { tipo: 'descartada', mensaje: MENSAJE_DE_DESCARTE[resultado.motivo ?? ''] ?? DESCARTE_SIN_MOTIVO }
    }
    await this.#lista.alConfirmar(idOrden, momento, 'confirmada')
    return { tipo: 'confirmada', mensaje: momento === 'salida' ? 'Salida confirmada. El traslado quedó en tránsito.' : 'Entrega confirmada. El traslado quedó cerrado.' }
  }

  #buscar(idOrden: number) {
    return this.#lista.getSnapshot().mias.find((v) => v.orden.idOrden === idOrden)
  }
}

function mensajeDeFallo(error: unknown, momento: Momento): string {
  const accion = momento === 'salida' ? 'confirmar la salida' : 'confirmar la entrega'
  if (!(error instanceof ApiError)) return `No se pudo ${accion}.`
  if (error.isNetwork) return `Sin conexión: no se pudo ${accion}. Vuelve a intentar cuando tengas señal.`
  return error.message
}
