import type { EstadoOrdenLocal } from './estadoOrden'
import { totalZonas } from './zonas'

/**
 * Cómo se ve una orden en la lista: su etiqueta y su tono. Ver `patron-traslado-web.md` §5 y
 * `_OrdenVista` de la app.
 *
 * El mismo estado derivado se lee distinto según el tramo: `sinIniciar` en una orden `pendiente`
 * es «todavía no la empezó» y en una `en_transito` es «el auto está viajando». Sin distinguirlos,
 * una orden con la salida ya confirmada volvía a decir «Sin empezar», lo contrario de lo que pasó.
 */
export type TonoOrden = 'success' | 'danger' | 'info' | 'neutral'

export interface DatosDePresentacion {
  estadoServidor: string
  /** `null` cuando el servidor ya no está en `pendiente` ni `en_transito`: no queda nada que derivar. */
  estadoLocal: EstadoOrdenLocal | null
  fotosTomadas: number
}

function etiquetaLocal(estado: EstadoOrdenLocal, fotosTomadas: number, esEntrega: boolean): string {
  const total = totalZonas(esEntrega ? 'entrega' : 'salida')
  switch (estado) {
    case 'sinIniciar':
      return esEntrega ? 'En tránsito — falta entregar' : 'Sin empezar'
    case 'enCaptura':
      return esEntrega ? `Entregando (${fotosTomadas}/${total})` : `Cargando fotos (${fotosTomadas}/${total})`
    case 'listaParaEnviar':
      return esEntrega ? 'Entrega lista para enviar' : 'Listo para enviar'
    case 'enviando':
      return esEntrega ? 'Enviando la entrega…' : 'Enviando…'
    case 'confirmada':
      return esEntrega ? 'Entregado' : 'Confirmada'
    case 'descartadaPorSupervisor':
      return 'Descartada por el supervisor'
  }
}

function etiquetaDelServidor(estado: string): string {
  switch (estado) {
    case 'en_transito':
      return 'En tránsito'
    case 'realizado':
      return 'Entregado'
    case 'cerrada':
      return 'Cerrada'
    case 'cancelada':
      return 'Cancelada'
    default:
      return estado // un estado que no conocemos se muestra tal cual, mejor que ocultarlo
  }
}

export function etiquetaDeOrden({ estadoServidor, estadoLocal, fotosTomadas }: DatosDePresentacion): string {
  if (estadoLocal !== null) return etiquetaLocal(estadoLocal, fotosTomadas, estadoServidor === 'en_transito')
  return etiquetaDelServidor(estadoServidor)
}

/** Listo para enviar, verde; cancelada, rojo; en tránsito, azul; el resto, gris. Se evalúa en ese orden. */
export function tonoDeOrden({ estadoServidor, estadoLocal }: Pick<DatosDePresentacion, 'estadoServidor' | 'estadoLocal'>): TonoOrden {
  if (estadoLocal === 'listaParaEnviar') return 'success'
  if (estadoServidor === 'cancelada') return 'danger'
  if (estadoServidor === 'en_transito') return 'info'
  return 'neutral'
}

/** El filtro de VIN compara sin importar mayúsculas ni espacios en los extremos. */
export const normalizarFiltro = (texto: string): string => texto.trim().toUpperCase()

export function filtrarPorVin<T extends { vin: string }>(ordenes: readonly T[], texto: string): T[] {
  const consulta = normalizarFiltro(texto)
  if (consulta === '') return [...ordenes]
  return ordenes.filter((orden) => orden.vin.toUpperCase().includes(consulta))
}
