import type { ResultadosVinesLeidos, SeguimientoApi, TrasladosLeidos } from '../../api/seguimientoApi'
import type { ResultadoVin, TrasladoSeguimiento } from '../../domain'
import { ListaSeguimiento } from '../listaSeguimiento'

/** Un traslado de ejemplo (datos inventados, ningún VIN real). */
export const trasladoDePrueba = (extra: Partial<TrasladoSeguimiento> = {}): TrasladoSeguimiento => ({
  idOrden: 1,
  vin: 'TESTVIN0000X00231',
  marca: 'Toyota',
  modelo: 'Corolla',
  color: 'Blanco',
  destino: 'Sede Norte',
  etapa: 'en_camino',
  salidaRegistrada: '2026-10-15T12:40:00Z',
  entregadoEn: null,
  entregaEstimada: false,
  ...extra,
})

/** La lista de ejemplo de la maqueta: cada etapa. */
export const trasladosDeEjemplo = (): TrasladoSeguimiento[] => [
  trasladoDePrueba({ idOrden: 1, vin: 'TESTVIN0000X00231', marca: 'Toyota', modelo: 'Corolla', color: 'Blanco', destino: 'Sede Norte', etapa: 'en_camino', salidaRegistrada: '2026-10-15T12:40:00Z' }),
  trasladoDePrueba({ idOrden: 2, vin: 'TESTVIN0000X00487', marca: 'Kia', modelo: 'Sportage', color: 'Gris', destino: 'Sede Sur', etapa: 'en_camino', salidaRegistrada: '2026-10-15T11:50:00Z' }),
  trasladoDePrueba({ idOrden: 3, vin: 'TESTVIN0000X00602', marca: 'Toyota', modelo: 'Hilux', color: 'Rojo', destino: 'Sede Norte', etapa: 'en_camino', salidaRegistrada: '2026-10-15T13:12:00Z' }),
  trasladoDePrueba({ idOrden: 4, vin: 'TESTVIN0000X00519', marca: 'Hyundai', modelo: 'Tucson', color: 'Negro', destino: 'Sede Norte', etapa: 'en_planta', salidaRegistrada: null }),
  trasladoDePrueba({ idOrden: 5, vin: 'TESTVIN0000X00655', marca: 'Kia', modelo: 'Rio', color: 'Plata', destino: 'Sede Sur', etapa: 'entregado', salidaRegistrada: '2026-10-14T13:30:00Z', entregadoEn: '2026-10-14T16:20:00Z' }),
  trasladoDePrueba({ idOrden: 6, vin: 'TESTVIN0000X00097', marca: 'Hyundai', modelo: 'Accent', color: 'Blanco', destino: 'Sede Norte', etapa: 'entregado', salidaRegistrada: '2026-10-13T16:05:00Z', entregadoEn: '2026-10-13T20:00:00Z', entregaEstimada: true }),
  trasladoDePrueba({ idOrden: 7, vin: 'TESTVIN0000X00064', marca: 'Toyota', modelo: 'Yaris', color: 'Azul', destino: 'Sede Sur', etapa: 'anulado', salidaRegistrada: null }),
]

/** Una API de seguimiento de mentira: responde lo que se le ponga y cuenta las llamadas. */
export function crearSeguimientoApiDePrueba(inicial: readonly TrasladoSeguimiento[] = trasladosDeEjemplo()) {
  const estado: {
    traslados: readonly TrasladoSeguimiento[]
    descartados: number
    llamadas: number
    /** Si se pone, la próxima llamada falla con esto (y se limpia). */
    fallo: unknown
    /** Si se pone, la respuesta espera a que se resuelva. */
    puerta: Promise<void> | null
    /** Cada consulta masiva recibida (los VIN que se mandaron). */
    consultas: string[][]
    /** Si se pone, la próxima consulta masiva falla con esto (y se limpia). */
    falloConsulta: unknown
    /** Si se pone, la consulta masiva espera a que se resuelva. */
    puertaConsulta: Promise<void> | null
    /** Si se pone, la consulta masiva responde esto en vez de cruzar con `traslados`. */
    respuestaConsulta: ResultadosVinesLeidos | null
  } = { traslados: inicial, descartados: 0, llamadas: 0, fallo: null, puerta: null, consultas: [], falloConsulta: null, puertaConsulta: null, respuestaConsulta: null }

  const api: SeguimientoApi = {
    async traslados(): Promise<TrasladosLeidos> {
      estado.llamadas++
      if (estado.puerta) await estado.puerta
      if (estado.fallo) {
        const fallo = estado.fallo
        estado.fallo = null
        throw fallo
      }
      return { traslados: [...estado.traslados], descartados: estado.descartados }
    },
    async consultarVines(vines): Promise<ResultadosVinesLeidos> {
      estado.consultas.push([...vines])
      if (estado.puertaConsulta) await estado.puertaConsulta
      if (estado.falloConsulta) {
        const fallo = estado.falloConsulta
        estado.falloConsulta = null
        throw fallo
      }
      if (estado.respuestaConsulta) return estado.respuestaConsulta
      // Como el servidor: solo cuenta lo que está en camino o entregado; lo demás es «pendiente».
      const resultados: ResultadoVin[] = vines.map((vin) => {
        const traslado = estado.traslados.find((t) => t.vin === vin && (t.etapa === 'en_camino' || t.etapa === 'entregado'))
        return traslado ? { vin, informacion: 'disponible', traslado } : { vin, informacion: 'pendiente' }
      })
      return { resultados, descartados: 0 }
    },
  }
  return { api, estado }
}

/** Una lista de seguimiento con su API de mentira y un reloj que se mueve a mano. */
export function crearListaSeguimientoDePrueba(inicial?: readonly TrasladoSeguimiento[]) {
  const doble = crearSeguimientoApiDePrueba(inicial)
  const reloj = { ahora: Date.parse('2026-10-15T12:00:00Z') }
  const lista = new ListaSeguimiento({ api: doble.api, reloj: () => reloj.ahora })
  return { lista, ...doble, reloj }
}
