import { Button, Card, cx } from '@/core/ui'
import type { OpcionCatalogo, TonoOrden } from '../domain'
import type { VistaOrden } from '../data/listaOrdenes'
import { SelectorCatalogo } from './SelectorCatalogo'

// El color acompaña a la etiqueta, nunca la reemplaza: quien no distingue colores lee el texto.
const ESTILOS_DEL_TONO: Record<TonoOrden, string> = {
  success: 'bg-success-soft text-success-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info',
  neutral: 'bg-line text-ink-2',
}

/** Lo que la tarjeta necesita para elegir la placa y el proveedor (O-04). */
export interface SeleccionCatalogo {
  placas: readonly OpcionCatalogo[]
  proveedores: readonly OpcionCatalogo[]
  /** Nunca se descargó el catálogo en este dispositivo: se explica en vez de mostrar una lista muda. */
  nuncaDescargado: boolean
  onElegirPlaca: (opcion: OpcionCatalogo) => void
  onElegirProveedor: (opcion: OpcionCatalogo) => void
}

export interface TarjetaOrdenProps {
  vista: VistaOrden
  /** Si se pasa, una orden de la salida sin placa o proveedor del servidor los pide aquí (O-04). */
  seleccion?: SeleccionCatalogo
  /** En el pool: «Comenzar despacho». Tocar el resto de la tarjeta no hace nada (O-02 AC1). */
  onComenzar?: () => void
  /** En lo propio, si se tomó aquí y el auto no salió: «Soltar». */
  onSoltar?: () => void
  /** En lo propio: abre las fotos de la salida o de la entrega (E4-01). */
  onFotografiar?: () => void
  /** Hay una acción en curso sobre esta orden: los botones se deshabilitan. */
  ocupada?: boolean
}

/** Una orden en la lista: su VIN, cómo va (etiqueta con color), los datos para reconocerla y sus acciones. */
export function TarjetaOrden({ vista, seleccion, onComenzar, onSoltar, onFotografiar, ocupada = false }: TarjetaOrdenProps) {
  const { orden, etiqueta, tono, aviso } = vista
  const detalle = [orden.placa?.codigo, orden.destino?.nombre].filter(Boolean).join(' · ')

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-mono text-[15px] font-bold break-all text-ink-1">{orden.vin}</p>
        <span
          data-tono={tono}
          className={cx('shrink-0 rounded-chip px-2.5 py-1 text-[12px] font-bold', ESTILOS_DEL_TONO[tono])}
        >
          {etiqueta}
        </span>
      </div>
      {detalle !== '' && <p className="text-sm text-ink-2">{detalle}</p>}
      {aviso && <p className="text-sm font-medium text-warning-ink">{aviso}</p>}
      {seleccion && (vista.placaEditable || vista.proveedorEditable) && (
        <div className="flex flex-col gap-3">
          {vista.placaEditable && (
            <SelectorCatalogo
              etiqueta={`Placa rotativa de ${orden.vin}`}
              opciones={seleccion.placas}
              valor={orden.placa?.id ?? null}
              textoValor={orden.placa?.codigo}
              onElegir={seleccion.onElegirPlaca}
              textoSinOpciones={seleccion.nuncaDescargado ? 'Las placas todavía no se descargaron. Conéctate una vez y vuelve a entrar.' : undefined}
            />
          )}
          {vista.proveedorEditable && (
            <SelectorCatalogo
              etiqueta={`Proveedor de ${orden.vin}`}
              opciones={seleccion.proveedores}
              valor={orden.proveedor?.id ?? null}
              textoValor={orden.proveedor?.nombre}
              onElegir={seleccion.onElegirProveedor}
              textoSinOpciones={seleccion.nuncaDescargado ? 'Los proveedores todavía no se descargaron. Conéctate una vez y vuelve a entrar.' : undefined}
            />
          )}
          {vista.faltaPlaca && <p className="text-sm text-ink-2">Elige la placa para poder fotografiar la salida.</p>}
        </div>
      )}
      {(onComenzar || onSoltar || onFotografiar) && (
        <div className="flex justify-end gap-2">
          {onSoltar && (
            // El VIN en el nombre accesible: con varias tarjetas, «Soltar» solo no dice cuál.
            <Button variante="secundario" tamano="compacto" disabled={ocupada} aria-label={`Soltar ${orden.vin}`} onClick={onSoltar}>
              Soltar
            </Button>
          )}
          {onFotografiar && vista.momento && (
            <Button tamano="compacto" disabled={ocupada} aria-label={`Fotografiar ${vista.momento} ${orden.vin}`} onClick={onFotografiar}>
              {vista.momento === 'salida' ? 'Fotografiar salida' : 'Fotografiar entrega'}
            </Button>
          )}
          {onComenzar && (
            <Button tamano="compacto" disabled={ocupada} aria-label={`Comenzar despacho ${orden.vin}`} onClick={onComenzar}>
              Comenzar despacho
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
