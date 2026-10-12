import { Banner, Button, Card } from '@/core/ui'
import { type CandidatoVin, normalizarVin, tipoDeBusqueda } from '../domain'
import type { OrdenEncontrada, ResultadoBusqueda } from '../data/identificadorVin'

export interface BuscarEnElSistemaProps {
  /** Lo que el operario escribió en el filtro de VIN: no apareció en la lista del teléfono. */
  texto: string
  resultado: ResultadoBusqueda
  onBuscar: () => void
  onElegirCandidato: (vin: string) => void
  /** «Comenzar despacho» sobre una orden del pool hallada. */
  onTomar: (encontrada: OrdenEncontrada) => void
  /** Ya es del operario: llevarlo a «Mis traslados». */
  onMostrar: (vin: string) => void
  /** Ids de las órdenes con una acción en curso. */
  ocupadas?: ReadonlySet<number>
}

/**
 * Cuando el filtro no encuentra el VIN en la lista del teléfono (O-03): **puede estar en el sistema sin
 * haberse descargado** (el pool de otro día, una orden creada después de la última actualización, una
 * asignada a otra persona). Esta pantalla lo busca y dice qué pasa con él, con un mensaje distinto
 * para cada caso: «no existe ese vehículo» manda a revisar el VIN; «sin orden pendiente» manda a
 * esperar al supervisor.
 *
 * No dice «no existe» por no encontrarlo en el teléfono: no puede saberlo sin consultar.
 */
export function BuscarEnElSistema({ texto, resultado, onBuscar, onElegirCandidato, onTomar, onMostrar, ocupadas }: BuscarEnElSistemaProps) {
  const vin = normalizarVin(texto)
  const corto = tipoDeBusqueda(texto) === 'corto'
  const buscando = resultado.tipo === 'buscando'

  return (
    <Card className="mb-6 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-ink-1">¿No aparece en tu lista?</h2>
        <p className="text-sm text-ink-2">«{vin}» puede estar en el sistema sin haberse descargado en este teléfono.</p>
      </div>
      <Button variante="secundario" disabled={corto || buscando} onClick={onBuscar}>
        {buscando ? 'Buscando…' : 'Buscar en el sistema'}
      </Button>
      {corto && <p className="text-sm text-ink-3">Escribe al menos 4 caracteres del VIN para buscar en el sistema.</p>}

      {/* Una región con anuncio educado: el lector de pantalla dice el resultado sin cortar lo que está leyendo. */}
      <div aria-live="polite" className="flex flex-col gap-2">
        <Resultado resultado={resultado} onElegirCandidato={onElegirCandidato} onTomar={onTomar} onMostrar={onMostrar} ocupadas={ocupadas} />
      </div>
    </Card>
  )
}

function Resultado({ resultado, onElegirCandidato, onTomar, onMostrar, ocupadas }: Omit<BuscarEnElSistemaProps, 'texto' | 'onBuscar'>) {
  switch (resultado.tipo) {
    case 'inactivo':
    case 'muyCorto':
      return null
    case 'buscando':
      return (
        <p role="status" className="text-sm text-ink-2">
          Buscando en el sistema…
        </p>
      )
    case 'sinConexion':
      return <Banner tono="warning">Sin conexión. Buscar en el sistema necesita internet.</Banner>
    case 'sinPermiso':
      return <Banner tono="danger">{resultado.mensaje}</Banner>
    case 'error':
      return <Banner tono="danger">{resultado.mensaje}</Banner>
    case 'sinCoincidencias':
      return <Banner tono="warning">Ningún vehículo del sistema coincide con «{resultado.texto}».</Banner>
    case 'noConocido':
      return (
        <Banner tono="warning">
          <strong>VIN no conocido.</strong> {resultado.vin} no está registrado como vehículo en el sistema. Revisa que esté bien escrito.
        </Banner>
      )
    case 'sinOrden':
      return (
        <Banner tono="warning">
          <strong>Sin orden pendiente.</strong> El vehículo {resultado.vin} existe, pero no tiene una orden pendiente. Espera a que el supervisor de despacho la cree.
        </Banner>
      )
    case 'formatoInvalido':
      return (
        <Banner tono="danger">
          <strong>Formato de VIN inválido.</strong> Debe tener 17 caracteres: números y letras sin I, O ni Q (se confunden con 1 y 0).
        </Banner>
      )
    case 'candidatos':
      return <Candidatos candidatos={resultado.candidatos} onElegir={onElegirCandidato} />
    case 'ordenes':
      return (
        <ul className="flex flex-col gap-2">
          {resultado.ordenes.map((encontrada) => (
            <li key={encontrada.orden.idOrden}>
              <OrdenHallada encontrada={encontrada} onTomar={onTomar} onMostrar={onMostrar} ocupada={ocupadas?.has(encontrada.orden.idOrden) ?? false} />
            </li>
          ))}
        </ul>
      )
  }
}

function Candidatos({ candidatos, onElegir }: { candidatos: readonly CandidatoVin[]; onElegir: (vin: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-bold text-ink-2">Elige el vehículo</p>
      <ul className="flex flex-col gap-2">
        {candidatos.map((candidato) => (
          <li key={candidato.vin}>
            <button
              type="button"
              onClick={() => onElegir(candidato.vin)}
              className="flex min-h-11 w-full flex-col items-start rounded-ficha border border-line-strong bg-surface px-4 py-2 text-left hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="font-mono text-[15px] font-bold break-all text-ink-1">{candidato.vin}</span>
              <span className="text-sm text-ink-2">{[candidato.marca, candidato.modelo].filter(Boolean).join(' ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OrdenHallada({
  encontrada,
  onTomar,
  onMostrar,
  ocupada,
}: {
  encontrada: OrdenEncontrada
  onTomar: (encontrada: OrdenEncontrada) => void
  onMostrar: (vin: string) => void
  ocupada: boolean
}) {
  const { orden, relacion } = encontrada
  const detalle = [orden.placa?.codigo, orden.proveedor?.nombre, orden.destino?.nombre].filter(Boolean).join(' · ')
  const dueno = orden.conductorAsignado?.nombreCompleto ?? orden.conductorAsignado?.username ?? 'otra persona'

  return (
    <div className="flex flex-col gap-2 rounded-ficha border border-line bg-surface-2 p-3">
      <p className="font-mono text-[15px] font-bold break-all text-ink-1">{orden.vin}</p>
      {detalle !== '' && <p className="text-sm text-ink-2">{detalle}</p>}
      {relacion === 'delPool' && (
        <>
          <p className="text-sm text-ink-2">Disponible: todavía no la tomó nadie.</p>
          <div className="flex justify-end">
            <Button tamano="compacto" disabled={ocupada} aria-label={`Comenzar despacho ${orden.vin}`} onClick={() => onTomar(encontrada)}>
              Comenzar despacho
            </Button>
          </div>
        </>
      )}
      {relacion === 'mia' && (
        <>
          <p className="text-sm font-medium text-success-ink">Ya es tuya.</p>
          <div className="flex justify-end">
            <Button variante="secundario" tamano="compacto" aria-label={`Ver ${orden.vin} en mis traslados`} onClick={() => onMostrar(orden.vin)}>
              Ver en mis traslados
            </Button>
          </div>
        </>
      )}
      {relacion === 'deOtro' && (
        <p className="text-sm font-medium text-warning-ink">
          Asignada a {dueno}. No es tuya: avisa a tu supervisor si te toca a ti.
        </p>
      )}
    </div>
  )
}
