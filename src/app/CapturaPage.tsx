import { Button } from '@/core/ui'
import { ConfirmarDespacho } from '@/features/traslado/components/ConfirmarDespacho'
import { FormularioCaptura } from '@/features/traslado/components/FormularioCaptura'
import type { ConfirmacionTraslado, ResultadoConfirmar } from '@/features/traslado/data/confirmacionTraslado'
import type { FotoStorePort } from '@/features/traslado/data/fotoStorePort'
import type { SubidaFotos } from '@/features/traslado/data/subidaFotos'
import type { Momento } from '@/features/traslado/domain'

export interface CapturaPageProps {
  ordenId: number
  vin: string
  momento: Momento
  store: FotoStorePort
  subidas: SubidaFotos
  confirmacion: ConfirmacionTraslado
  /** Sin resultado: el operario volvió sin confirmar. Con resultado: se confirmó o se descartó. */
  onVolver: (resultado?: Extract<ResultadoConfirmar, { tipo: 'confirmada' | 'descartada' }>) => void
}

/**
 * Las fotos de la salida o de la entrega de una orden: la cámara y una ficha por zona. Cada foto se sube
 * en cuanto se toma (E4-01) y al final se confirma el despacho (E4-02). Volver a la lista no pierde nada: lo tomado queda en el teléfono y lo que
 * estaba subiendo sigue subiendo.
 */
export function CapturaPage({ ordenId, vin, momento, store, subidas, confirmacion, onVolver }: CapturaPageProps) {
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{momento === 'salida' ? 'Salida' : 'Entrega'}</p>
          <p className="font-mono text-[15px] font-bold break-all text-ink-1">{vin}</p>
        </div>
        <Button variante="secundario" tamano="compacto" onClick={() => onVolver()}>
          Volver
        </Button>
      </header>
      <FormularioCaptura
        key={`${ordenId}-${momento}`}
        momento={momento}
        ordenId={ordenId}
        store={store}
        subidas={subidas}
        pie={(estado) => (
          <ConfirmarDespacho momento={momento} estado={estado} onConfirmar={() => confirmacion.confirmar(ordenId, momento)} onTerminado={onVolver} />
        )}
      />
    </main>
  )
}
